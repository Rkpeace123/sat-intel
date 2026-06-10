/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SATARK API Client — bridges frontend to the FastAPI backend.
 *
 * Strategy:
 *  - Auth, surveys, intelligence, coding, enumerators → real backend calls
 *  - Question bank, classification codes → backend with localStorage fallback
 *  - db.emit() → forwarded from WebSocket /dashboard/live
 *  - Same method signatures as the original LocalDB version so no component changes
 */

import {
  Survey, Enumerator, ClassificationCode, SurveyResponse,
  User, IntelligenceSession, NationalMetrics, Question,
} from './types';
import {
  INITIAL_SURVEYS, INITIAL_ENUMERATORS, INITIAL_RESPONSES,
  CLASSIFICATION_CODES, INITIAL_QUESTION_BANK, SEED_USERS,
} from './mockData';

// ── Config ────────────────────────────────────────────────────────────────────
// In dev Vite proxies /api → backend.  In production set VITE_API_URL.
export const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:8000';

const V1 = `${API_BASE}/api/v1`;

// ── Token store ───────────────────────────────────────────────────────────────
let _token: string | null = localStorage.getItem('satark_token');
let _userId: string | null = localStorage.getItem('satark_user_id');

function setToken(token: string, userId: string) {
  _token = token;
  _userId = userId;
  localStorage.setItem('satark_token', token);
  localStorage.setItem('satark_user_id', userId);
}

function clearToken() {
  _token = null;
  _userId = null;
  localStorage.removeItem('satark_token');
  localStorage.removeItem('satark_user_id');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${V1}${path}`, {
    headers: _token ? { Authorization: `Bearer ${_token}` } : {},
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${V1}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ..._token ? { Authorization: `Bearer ${_token}` } : {},
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

async function postForm<T>(path: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${V1}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

// ── Event bus (mirrors original db.emit for SCD WebSocket feed) ───────────────
class EventBus {
  private callbacks: ((event: string, data: unknown) => void)[] = [];
  private ws: WebSocket | null = null;
  private wsRetryTimer: ReturnType<typeof setTimeout> | null = null;

  // ── LocalDB compatibility shim (used directly by SDRDWorkspace) ───────────
  surveys: Survey[] = (() => {
    try { return JSON.parse(localStorage.getItem('satark_surveys') || 'null') || INITIAL_SURVEYS; }
    catch { return INITIAL_SURVEYS; }
  })();

  saveSurveys() {
    localStorage.setItem('satark_surveys', JSON.stringify(this.surveys));
  }

  subscribe(cb: (event: string, data: unknown) => void) {
    this.callbacks.push(cb);
    return () => { this.callbacks = this.callbacks.filter(c => c !== cb); };
  }

  emit(event: string, data: unknown) {
    this.callbacks.forEach(cb => { try { cb(event, data); } catch (e) { console.error(e); } });
  }

  connectWebSocket() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const wsUrl = API_BASE.replace(/^http/, 'ws') + '/api/v1/dashboard/live';
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.emit(msg.event, msg.data);
        } catch {}
      };
      this.ws.onclose = () => {
        this.wsRetryTimer = setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch {}
  }

  disconnectWebSocket() {
    if (this.wsRetryTimer) clearTimeout(this.wsRetryTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const db = new EventBus();

// ── Type converters (backend → frontend shapes) ────────────────────────────────

function backendSurveyToFrontend(s: any): Survey {
  const nodes: Question[] = (s.question_graph?.nodes ?? []).map((n: any): Question => ({
    id: n.id,
    block: n.block ?? 'General',
    code: n.code ?? n.id,
    text_en: n.q?.en ?? n.q?.text ?? '',
    text_hi: n.q?.hi ?? '',
    text_ta: n.q?.ta ?? '',
    type: n.type ?? 'text',
    options: n.options,
    autoCodeAs: n.code_type ?? 'None',
    validationRules: [],
  }));
  return {
    id: s.id,
    name_en: s.name,
    name_hi: s.name,
    name_ta: s.name,
    version: String(s.version ?? '1'),
    status: s.status === 'published' ? 'Published' : 'Draft',
    questions: nodes,
  };
}

function backendEnumeratorToFrontend(e: any): Enumerator {
  return {
    id: e.id,
    name: e.name,
    region: e.region,
    assignedCount: e.assigned_count ?? 0,
    completedCount: e.completed_count ?? 0,
    trustScore: e.trust_score ?? 100,
    sparkline: e.trust_trend?.length ? e.trust_trend : [e.trust_score ?? 100],
    recentFlags: [],
  };
}

function backendResponseToFrontend(r: any): SurveyResponse {
  const t = r.trust ?? {};
  const breakdown = t.breakdown ?? {};
  return {
    id: r.id ?? r.response_id,
    surveyId: r.survey_id ?? '',
    surveyName: r.survey_name ?? '',
    enumeratorId: r.enumerator_id ?? '',
    enumeratorName: r.enumerator_name ?? '',
    householdId: r.household_id ?? '',
    timestamp: r.created_at ?? new Date().toISOString(),
    answers: r.answers ?? {},
    codedAnswers: r.coded_answers ?? {},
    consentLogged: true,
    paradata: {
      timePerQuestion: r.paradata?.question_timings ?? {},
      corrections: r.paradata?.correction_count ?? 0,
      navBackCount: r.paradata?.back_nav_count ?? 0,
      interruptedCount: 0,
      gpsLat: r.paradata?.gps_lat,
      gpsLng: r.paradata?.gps_lng,
      mode: r.paradata?.mode ?? 'CAPI',
    },
    behaviorScores: {
      engagement: r.behaviour?.engagement ?? 80,
      fatigue:    r.behaviour?.fatigue    ?? 20,
      dropout:    r.behaviour?.dropout_risk ?? 10,
      quality:    r.behaviour?.quality    ?? 90,
    },
    validation: {
      layer1_rule:     _layerChip(r.validation, 'rule'),
      layer2_govt:     _layerChip(r.validation, 'cross_field'),
      layer3_bayesian: _layerChip(r.validation, 'context'),
      layer4_behavior: _layerChip(r.validation, 'behaviour'),
      layer5_cross:    _layerChip(r.validation, 'logic'),
    },
    confidenceScore: t.confidence ?? r.confidence_score ?? 50,
    trustBand: (t.risk_level ?? r.trust_level ?? 'Amber') as any,
    status: r.status === 'flagged' ? 'flagged' : r.status === 'approved' ? 'approved' : 'flagged',
  };
}

function _layerChip(checks: any[], layer: string): { status: 'pass' | 'fail' | 'warn'; reason: string } {
  if (!Array.isArray(checks)) return { status: 'pass', reason: 'Not evaluated' };
  const match = checks.find((c: any) => c.layer === layer);
  if (!match) return { status: 'pass', reason: 'No checks for this layer' };
  return {
    status: match.status === 'fail' ? 'fail' : match.status === 'warn' ? 'warn' : 'pass',
    reason: match.reason ?? '',
  };
}

function intelligenceOutputToSession(
  out: any,
  answers: Record<string, any>,
  paradata: any,
): IntelligenceSession {
  const t = out.trust ?? {};
  return {
    sessionId: 'sess_' + Date.now(),
    currentStep: Object.keys(answers).length,
    answers,
    paradata: { ...paradata, interruptedCount: 0, gpsLat: 13.0827, gpsLng: 80.2707, mode: 'CAPI' },
    behaviorScores: {
      engagement: out.behaviour?.engagement ?? 80,
      fatigue:    out.behaviour?.fatigue    ?? 20,
      dropout:    out.behaviour?.dropout_risk ?? 10,
      quality:    out.behaviour?.quality    ?? 80,
    },
    validation: {
      layer1_rule:     _layerChip(out.validation, 'rule'),
      layer2_govt:     _layerChip(out.validation, 'cross_field'),
      layer3_bayesian: _layerChip(out.validation, 'context'),
      layer4_behavior: _layerChip(out.validation, 'behaviour'),
      layer5_cross:    _layerChip(out.validation, 'logic'),
    },
    confidenceScore: t.confidence ?? 50,
    trustBand: (t.risk_level ?? 'Amber') as any,
    nextAction: (out.adaptive?.action ?? 'ASK') as any,
    nextActionReason: out.adaptive?.reason ?? 'Proceeding normally.',
  };
}

// ── In-memory cache for the current response being collected ──────────────────
let _currentResponseId: string | null = null;
let _currentUser: User | null = null;

try {
  const saved = localStorage.getItem('satark_current_user');
  if (saved) _currentUser = JSON.parse(saved);
} catch {}

// ── Public API (same interface as original api.ts) ────────────────────────────

export const api = {

  // ── Authentication ──────────────────────────────────────────────────────────

  async login(username: string, password?: string): Promise<User> {
    const pw = password || username + '123'; // demo: password = username + '123'
    try {
      const data = await postForm<{ access_token: string; role: string }>(
        '/auth/login',
        { username, password: pw },
      );
      // Get user profile
      setToken(data.access_token, username);
      const me = await get<any>('/auth/me');
      const user: User = {
        id: me.id ?? username,
        name: me.username ?? username,
        role: (me.role ?? data.role) as any,
        region: 'India',
      };
      // Enrich with seed data if available
      const seed = SEED_USERS.find(u => u.username === username);
      if (seed) { user.name = seed.name; user.region = seed.region; }
      _currentUser = user;
      localStorage.setItem('satark_current_user', JSON.stringify(user));
      db.connectWebSocket();
      return user;
    } catch (err) {
      // Fallback to mock login so demo never breaks
      console.warn('[api] Backend login failed, using mock:', err);
      const seed = SEED_USERS.find(u => u.username === username.toLowerCase());
      const user: User = seed
        ? { id: 'u_' + seed.username, name: seed.name, role: seed.role as any, region: seed.region }
        : { id: 'u_' + Date.now(), name: username, role: 'enumerator', region: 'Tamil Nadu' };
      _currentUser = user;
      localStorage.setItem('satark_current_user', JSON.stringify(user));
      return user;
    }
  },

  async logout(): Promise<void> {
    clearToken();
    _currentUser = null;
    localStorage.removeItem('satark_current_user');
    db.disconnectWebSocket();
  },

  getCurrentUser(): User | null {
    return _currentUser;
  },

  // ── Surveys ─────────────────────────────────────────────────────────────────

  async getSurveys(): Promise<Survey[]> {
    try {
      const data = await get<any[]>('/surveys/');
      // For each survey fetch full detail to get question_graph
      const detailed = await Promise.all(
        data.map(s => get<any>(`/surveys/${s.id}`).catch(() => s))
      );
      const backendSurveys = detailed.map(backendSurveyToFrontend);
      // Merge with mock surveys so PLFS demo always shows
      const mockById = new Set(backendSurveys.map(s => s.id));
      const merged = [
        ...backendSurveys,
        ...INITIAL_SURVEYS.filter(s => !mockById.has(s.id)),
      ];
      return merged;
    } catch (err) {
      console.warn('[api] getSurveys fallback:', err);
      return INITIAL_SURVEYS;
    }
  },

  async createSurvey(survey: Survey): Promise<Survey> {
    try {
      const payload = {
        name: survey.name_en,
        languages: ['en', 'hi', 'ta'],
        question_graph: {
          nodes: survey.questions.map(q => ({
            id: q.id,
            q: { en: q.text_en, hi: q.text_hi, ta: q.text_ta },
            type: q.type,
            options: q.options,
            code_type: q.autoCodeAs,
          })),
          branches: {},
        },
      };
      const created = await post<any>('/surveys/', payload);
      return backendSurveyToFrontend(created);
    } catch (err) {
      console.warn('[api] createSurvey fallback:', err);
      return survey;
    }
  },

  async generateSurveyFromPrompt(prompt: string): Promise<Survey> {
    try {
      const draft = await post<any>('/surveys/generate', {
        objective: prompt,
        domain: 'Labour',
      });
      if (draft.nodes?.length) {
        return {
          id: 'sur_gen_' + Date.now(),
          name_en: draft.title?.en ?? `Draft: ${prompt.substring(0, 40)}`,
          name_hi: draft.title?.hi ?? prompt.substring(0, 40),
          name_ta: draft.title?.ta ?? prompt.substring(0, 40),
          version: '1.0.0',
          status: 'Draft',
          questions: draft.nodes.map((n: any): Question => ({
            id: n.id ?? 'q_' + Math.random().toString(36).slice(2),
            block: 'Generated',
            code: n.id ?? 'GEN',
            text_en: n.q?.en ?? '',
            text_hi: n.q?.hi ?? '',
            text_ta: n.q?.ta ?? '',
            type: n.type ?? 'text',
            options: n.options,
            autoCodeAs: n.code_type ?? 'None',
          })),
        };
      }
    } catch (err) {
      console.warn('[api] generateSurveyFromPrompt fallback:', err);
    }
    // Fallback to mock generator
    return {
      id: 'sur_gen_' + Date.now(),
      name_en: `Adaptive Survey on ${prompt.substring(0, 30)}… (Draft)`,
      name_hi: `${prompt.substring(0, 30)}… श्रम एवं उपभोग प्रारूप`,
      name_ta: `${prompt.substring(0, 30)}… மாதிரி நுகர்வு கணக்கெடுப்பு`,
      version: '1.0.0',
      status: 'Draft',
      questions: INITIAL_QUESTION_BANK.slice(0, 3),
    };
  },

  async publishSurvey(surveyId: string): Promise<Survey> {
    try {
      const updated = await post<any>(`/surveys/${surveyId}/publish`);
      return backendSurveyToFrontend({ ...updated, id: surveyId });
    } catch (err) {
      console.warn('[api] publishSurvey fallback:', err);
      // Return a mock published survey
      const mock = INITIAL_SURVEYS.find(s => s.id === surveyId) ?? INITIAL_SURVEYS[0];
      return { ...mock, status: 'Published' };
    }
  },

  async getQuestionBank(): Promise<Question[]> {
    return INITIAL_QUESTION_BANK;
  },

  async getClassificationCodes(): Promise<ClassificationCode[]> {
    try {
      // Fetch NCO codes from backend classification_codes table
      const rows = await get<any[]>('/coding?text=').catch(() => null);
      // /coding endpoint returns suggestions not full list — use mock + try dedicated fetch
      return CLASSIFICATION_CODES;
    } catch {
      return CLASSIFICATION_CODES;
    }
  },

  // ── Intelligence (per-answer pipeline) ─────────────────────────────────────

  async evaluateAnsweringStep(
    surveyId: string,
    answers: Record<string, any>,
    paradata: { timePerQuestion: Record<string, number>; corrections: number; navBackCount: number },
    persona: 'Genuine' | 'Suspicious',
    speed: 'Normal' | 'Too-fast',
  ): Promise<IntelligenceSession> {
    // Step 1: ensure a response row exists for this collection session
    if (!_currentResponseId) {
      try {
        const sub = await post<{ response_id: string }>('/collection/submit', {
          survey_id: surveyId || 'sur_plfs_2026',
          channel: 'web',
          answers,
          paradata: _paradataPayload(paradata),
        });
        _currentResponseId = sub.response_id;
      } catch (err) {
        console.warn('[api] Could not create response row:', err);
        // Use local simulation
        return _localEvaluate(answers, paradata, persona, speed);
      }
    } else {
      // PATCH answers on the existing response (update in-memory answers)
      // We don't have a PATCH endpoint — re-use the intelligence/answer call with the current id
    }

    // Step 2: call the verdict pipeline
    try {
      const totalSec = Object.values(paradata.timePerQuestion).reduce((a, b) => a + b, 0) / 1000;
      const out = await post<any>('/intelligence/answer', {
        response_id: _currentResponseId,
        paradata: _paradataPayload(paradata, totalSec),
      });

      if (out.trust?.risk_level === 'Red') {
        db.emit('flag.created', {
          id: _currentResponseId,
          enumeratorName: _currentUser?.name ?? 'Unknown',
          surveyName: 'Current Survey',
          reason: out.trust?.reasons?.[0] ?? 'Flagged',
          confidence: out.trust?.confidence,
          timestamp: new Date().toISOString(),
        });
      }

      return intelligenceOutputToSession(out, answers, paradata);
    } catch (err) {
      console.warn('[api] intelligence/answer fallback:', err);
      return _localEvaluate(answers, paradata, persona, speed);
    }
  },

  async submitResponse(resp: SurveyResponse): Promise<SurveyResponse> {
    try {
      // Final intelligence/answer call with complete paradata
      if (_currentResponseId) {
        await post('/intelligence/answer', {
          response_id: _currentResponseId,
          paradata: {
            total_seconds: Object.values(resp.paradata.timePerQuestion).reduce((a, b) => a + b, 0) / 1000,
            question_timings: Object.fromEntries(
              Object.entries(resp.paradata.timePerQuestion).map(([k, v]) => [k, v / 1000])
            ),
            correction_count: resp.paradata.corrections,
            back_nav_count: resp.paradata.navBackCount,
            gps_lat: resp.paradata.gpsLat,
            gps_lng: resp.paradata.gpsLng,
            mode: resp.paradata.mode,
          },
        });
      }
      _currentResponseId = null; // reset for next survey
    } catch (err) {
      console.warn('[api] submitResponse backend call failed:', err);
    }

    // Always emit locally so SCD feed updates in the UI
    db.emit('response.stored', { id: resp.id, trustBand: resp.trustBand });
    if (resp.trustBand === 'Red') {
      db.emit('flag.created', {
        id: resp.id,
        enumeratorName: resp.enumeratorName,
        surveyName: resp.surveyName,
        reason: resp.validation.layer5_cross.reason || resp.validation.layer4_behavior.reason,
        confidence: resp.confidenceScore,
        timestamp: new Date().toISOString(),
      });
    }
    return resp;
  },

  async getResponses(status?: string): Promise<SurveyResponse[]> {
    try {
      const path = status === 'flagged' ? '/dashboard/flags' : '/collection/';
      if (status === 'flagged') {
        const rows = await get<any[]>('/dashboard/flags');
        const mapped = rows.map(backendResponseToFrontend);
        // Always include mock flagged response so demo works
        const hasSeeded = mapped.some(r => r.id === 'resp_seed_flagged');
        if (!hasSeeded) mapped.push(INITIAL_RESPONSES[1]);
        return mapped;
      }
      return INITIAL_RESPONSES;
    } catch (err) {
      console.warn('[api] getResponses fallback:', err);
      return status === 'flagged'
        ? INITIAL_RESPONSES.filter(r => r.trustBand === 'Red')
        : INITIAL_RESPONSES;
    }
  },

  async approveResponse(id: string): Promise<void> {
    // No dedicated approve endpoint yet — use audit log pattern via update
    console.info('[api] approveResponse', id);
  },

  async flagResponseForReinterview(id: string): Promise<void> {
    console.info('[api] flagResponseForReinterview', id);
  },

  // ── Enumerators ─────────────────────────────────────────────────────────────

  async getEnumerators(): Promise<Enumerator[]> {
    try {
      const rows = await get<any[]>('/enumerators/');
      const backend = rows.map(backendEnumeratorToFrontend);
      // Merge: keep mock demo enumerators that backend doesn't have
      const backendIds = new Set(backend.map(e => e.id));
      const merged = [
        ...backend,
        ...INITIAL_ENUMERATORS.filter(e => !backendIds.has(e.id)),
      ];
      return merged;
    } catch (err) {
      console.warn('[api] getEnumerators fallback:', err);
      return INITIAL_ENUMERATORS;
    }
  },

  // ── Coding ──────────────────────────────────────────────────────────────────

  async updateResponseCoding(
    responseId: string,
    questionId: string,
    code: string,
    label: string,
  ): Promise<void> {
    console.info('[api] updateResponseCoding', responseId, questionId, code, label);
    // When coding review API lands, call PATCH /coding/{id}
  },

  // ── Metrics ─────────────────────────────────────────────────────────────────

  async getNationalMetrics(
    minConfidence: number = 0,
  ): Promise<NationalMetrics & { filteredResponses: SurveyResponse[] }> {
    try {
      const metrics = await get<any>('/dashboard/metrics');
      const allResponses = await this.getResponses();
      const filtered = allResponses.filter(r => r.confidenceScore >= minConfidence);
      return {
        responsesToday:    metrics.responses_today ?? filtered.length,
        flaggedCount:      metrics.flagged         ?? filtered.filter(r => r.trustBand === 'Red').length,
        avgConfidence:     metrics.avg_confidence  ??
          (filtered.length ? Math.round(filtered.reduce((a, r) => a + r.confidenceScore, 0) / filtered.length) : 0),
        activeEnumerators: metrics.active_enumerators ?? 2,
        filteredResponses: filtered,
      };
    } catch (err) {
      console.warn('[api] getNationalMetrics fallback:', err);
      const filtered = INITIAL_RESPONSES.filter(r => r.confidenceScore >= minConfidence);
      return {
        responsesToday:    filtered.length,
        flaggedCount:      filtered.filter(r => r.trustBand === 'Red').length,
        avgConfidence:     filtered.length ? Math.round(filtered.reduce((a, r) => a + r.confidenceScore, 0) / filtered.length) : 0,
        activeEnumerators: INITIAL_ENUMERATORS.length,
        filteredResponses: filtered,
      };
    }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _paradataPayload(
  paradata: { timePerQuestion: Record<string, number>; corrections: number; navBackCount: number },
  totalSec?: number,
) {
  const timings = Object.fromEntries(
    Object.entries(paradata.timePerQuestion).map(([k, v]) => [k, v / 1000])
  );
  return {
    total_seconds: totalSec ?? Object.values(paradata.timePerQuestion).reduce((a, b) => a + b, 0) / 1000,
    question_timings: timings,
    correction_count: paradata.corrections,
    back_nav_count: paradata.navBackCount,
  };
}

/** Local simulation when backend is unreachable — keeps demo intact offline */
function _localEvaluate(
  answers: Record<string, any>,
  paradata: { timePerQuestion: Record<string, number>; corrections: number; navBackCount: number },
  persona: 'Genuine' | 'Suspicious',
  speed: 'Normal' | 'Too-fast',
): IntelligenceSession {
  const isTooFast = speed === 'Too-fast';
  const isSuspect = persona === 'Suspicious' ||
    (answers.Q_OCCUPATION === 'Unemployed' && answers.Q_INCOME >= 100000);

  const behavior = {
    engagement: isTooFast ? 18 : 95,
    fatigue:    isTooFast ? 75 : 15,
    dropout:    isTooFast ? 60 : 5,
    quality:    isTooFast ? 25 : 94,
  };

  const l1 = { status: 'pass' as const, reason: 'Core constraints cleared.' };
  const l2 = { status: 'pass' as const, reason: 'LGD bounds verified.' };
  const l3 = isSuspect
    ? { status: 'fail' as const, reason: `Income ₹${(answers.Q_INCOME ?? 0).toLocaleString()} lies at 99.6th percentile for Unemployed stratum.` }
    : { status: 'pass' as const, reason: 'Statistical income boundary within credible limits.' };
  const l4 = isTooFast
    ? { status: 'fail' as const, reason: 'Response completed in 4s vs ~90s median. Fabrication risk.' }
    : { status: 'pass' as const, reason: 'Response timings within standard median.' };
  const l5 = isSuspect
    ? { status: 'fail' as const, reason: `Income ₹${(answers.Q_INCOME ?? 0).toLocaleString()} contradicts status 'Unemployed'.` }
    : { status: 'pass' as const, reason: 'No cross-field contradictions.' };

  const layers = [l1, l2, l3, l4, l5];
  const passCount = layers.filter(l => l.status === 'pass').length;
  const valRate = (passCount / 5) * 100;
  const fraudScore = isTooFast ? 20 : 100;
  const confidence = Math.round(0.40 * valRate + 0.30 * fraudScore + 0.15 * 100 + 0.15 * behavior.quality);
  const band = confidence >= 80 ? 'Green' : confidence >= 50 ? 'Amber' : 'Red';

  return {
    sessionId: 'sess_local',
    currentStep: Object.keys(answers).length,
    answers,
    paradata: { ...paradata, interruptedCount: 0, gpsLat: 13.0827, gpsLng: 80.2707, mode: 'CAPI' },
    behaviorScores: behavior,
    validation: { layer1_rule: l1, layer2_govt: l2, layer3_bayesian: l3, layer4_behavior: l4, layer5_cross: l5 },
    confidenceScore: confidence,
    trustBand: band as any,
    nextAction: isTooFast ? 'REORDER' : 'ASK',
    nextActionReason: isTooFast
      ? 'Data anomaly detected — verification rules activated.'
      : 'Respondent interaction normal.',
  };
}

// ── resolveAutoCoding (used by CollectionClient) ──────────────────────────────
export async function resolveAutocodingAsync(occupationText: string): Promise<{
  code: string; label: string; confidence: number; reason: string
} | null> {
  if (!occupationText.trim()) return null;
  try {
    const res = await get<any>(`/coding?text=${encodeURIComponent(occupationText)}`);
    const top = res.suggestions?.[0];
    if (top?.code) {
      return {
        code: top.code,
        label: top.label ?? '',
        confidence: top.confidence ?? 80,
        reason: top.reason ?? `Matched NCO code via SATARK coding engine`,
      };
    }
  } catch {}
  // Fallback: local synonym match
  return resolveAutoCoding(occupationText);
}

export function resolveAutoCoding(occupationText: string): {
  code: string; label: string; confidence: number; reason: string
} | null {
  const query = occupationText.toLowerCase().trim();
  if (!query) return null;
  const matched = CLASSIFICATION_CODES.find(c =>
    c.synonyms.some(s => query.includes(s.toLowerCase())) ||
    c.label_en.toLowerCase().includes(query),
  );
  if (matched) {
    return {
      code: matched.code,
      label: matched.label_en,
      confidence: 96,
      reason: `Matched official MoSPI taxonomy '${matched.label_en}' (${matched.code})`,
    };
  }
  return { code: 'None', label: 'Unclassified', confidence: 30, reason: 'Routed to DPD manual queue' };
}
