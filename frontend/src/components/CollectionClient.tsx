/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { api, db, resolveAutoCoding } from '../api';
import { Question, Survey, SurveyResponse, Paradata, BehaviorScores, ValidationStatus } from '../types';
import { translations } from '../i18n';
import { TrustBadge, ConfidenceGauge, ScoreBar, StatusChip, OfflineBanner, SyncIndicator } from './TrustComponents';
import { MessageSquare, Mic, Wifi, WifiOff, RefreshCw, Check, ArrowRight, CornerDownLeft, Shield, AlertTriangle, AlertCircle, Radio } from 'lucide-react';

interface CollectionClientProps {
  lang: 'en' | 'hi' | 'ta';
  isColorBlind: boolean;
  onResponseStored: () => void;
}

interface ChatMessage {
  sender: 'ai' | 'user';
  text: string;
  prepopulated?: boolean;
}

export const CollectionClient: React.FC<CollectionClientProps> = ({ lang, isColorBlind, onResponseStored }) => {
  const t = translations[lang];

  // Stage in Colection Flow: 1 = Lang, 2 = Consent, 3 = Active Survey, 4 = Success Complete
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);
  const [selectedLang, setSelectedLang] = useState<'en' | 'hi' | 'ta'>(lang);
  
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [householdPrepop, setHouseholdPrepop] = useState('HH-TN-0042');
  
  // Speed and Persona modifiers (WOW triggers)
  const [persona, setPersona] = useState<'Genuine' | 'Suspicious'>('Genuine');
  const [speed, setSpeed] = useState<'Normal' | 'Too-fast'>('Normal');

  // Input states & chat logs
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [voiceRecording, setVoiceRecording] = useState(false);

  // Paradata metrics markers
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [corrections, setCorrections] = useState(0);
  const [navBackCount, setNavBackCount] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [timeLogs, setTimeLogs] = useState<Record<string, number>>({});

  // Offline/Sync simulated states
  const [isOffline, setIsOffline] = useState(false);
  const [queuedResponses, setQueuedResponses] = useState<SurveyResponse[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Auto-code suggestion card state
  const [autoCodeSuggest, setAutoCodeSuggest] = useState<{ code: string; label: string; confidence: number; reason: string } | null>(null);

  // Live Pipeline feedback variables
  const [pipelineState, setPipelineState] = useState<{
    behaviorScores: BehaviorScores;
    validation: ValidationStatus;
    confidenceScore: number;
    trustBand: 'Green' | 'Amber' | 'Red';
    nextAction: 'ASK' | 'SIMPLIFY' | 'SKIP' | 'REORDER';
    nextActionReason: string;
  }>({
    behaviorScores: { engagement: 100, fatigue: 0, dropout: 0, quality: 100 },
    validation: {
      layer1_rule: { status: 'pass', reason: 'Normal initialization' },
      layer2_govt: { status: 'pass', reason: 'LGD Code linked' },
      layer3_bayesian: { status: 'pass', reason: 'Awaiting values' },
      layer4_behavior: { status: 'pass', reason: 'Awaiting intervals' },
      layer5_cross: { status: 'pass', reason: 'Awaiting comparisons' }
    },
    confidenceScore: 100,
    trustBand: 'Green',
    nextAction: 'ASK',
    nextActionReason: 'Awaiting initial question response'
  });

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSurvey();
  }, [stage]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const loadSurvey = async () => {
    const list = await api.getSurveys();
    const published = list.find(s => s.status === 'Published');
    if (published) {
      setActiveSurvey(published);
    }
  };

  const startSurveySelection = () => {
    if (!activeSurvey) return;
    setStage(3);
    setCurrentQuestionIdx(0);
    setAnswers({});
    setCorrections(0);
    setNavBackCount(0);
    setTimeLogs({});
    
    // Seed initial welcome prompt from AI SATARK
    const firstQ = activeSurvey.questions[0];
    const questionText = getQuestionText(firstQ);

    setChatLog([
      { sender: 'ai', text: `Welcome to SATARK. I will guide you through ${activeSurvey.name_en} and help populate required classifications.` },
      { 
        sender: 'ai', 
        text: `Pre-populated: Record link found for household: [${householdPrepop}]. Respondent: Arun Kumar, Age: 34. Let's verify: "${questionText}"`,
        prepopulated: true
      }
    ]);

    // Prepopulate name answer in drafts
    const prefilledName = 'Arun Kumar';
    setAnswers({ Q_NAME: prefilledName });
    setTimeLogs({ Q_NAME: 2000 });
    setQuestionStartTime(Date.now());
  };

  const getQuestionText = (q: Question) => {
    if (selectedLang === 'hi') return q.text_hi;
    if (selectedLang === 'ta') return q.text_ta;
    return q.text_en;
  };

  // Automated Synonym coding lookup card modifier
  const handleTextInputChange = (val: string) => {
    setTextInput(val);
    
    // Check if currently on Occupation question to trigger Auto-Coding Card live
    const activeQ = activeSurvey?.questions[currentQuestionIdx];
    if (activeQ?.code === 'Q_OCCUPATION' && val.length > 2) {
      const suggest = resolveAutoCoding(val);
      setAutoCodeSuggest(suggest);
    } else {
      setAutoCodeSuggest(null);
    }
  };

  const handleApplyAutoCode = () => {
    if (autoCodeSuggest && activeSurvey) {
      const activeQ = activeSurvey.questions[currentQuestionIdx];
      // Append text answer of NCO suggestion
      handleAnswerSubmit(autoCodeSuggest.label);
      setAutoCodeSuggest(null);
    }
  };

  const handleVoiceInputSimulate = () => {
    setVoiceRecording(true);
    setTimeout(() => {
      setVoiceRecording(false);
      // Simulate input depending on selected language
      if (selectedLang === 'ta') {
        setTextInput('ஆட்டோ ஓட்டுநர்');
        const suggest = resolveAutoCoding('ஆட்டோ ஓட்டுநர்');
        setAutoCodeSuggest(suggest);
      } else if (selectedLang === 'hi') {
        setTextInput('ऑटो ड्राइवर');
        const suggest = resolveAutoCoding('ऑटो ड्राइवर');
        setAutoCodeSuggest(suggest);
      } else {
        setTextInput('auto driver');
        const suggest = resolveAutoCoding('auto driver');
        setAutoCodeSuggest(suggest);
      }
    }, 2000);
  };

  const handleAnswerSubmit = async (value: any) => {
    if (!activeSurvey || !value) return;

    const currentQ = activeSurvey.questions[currentQuestionIdx];
    const duration = Date.now() - questionStartTime;
    const keyLogs = { ...timeLogs, [currentQ.code]: speed === 'Too-fast' ? 800 : duration };
    setTimeLogs(keyLogs);

    // Save answers
    const updatedAnswers = { ...answers, [currentQ.code]: value };
    setAnswers(updatedAnswers);
    setTextInput('');
    setAutoCodeSuggest(null);

    // Append Answer to chat bubble log
    setChatLog(prev => [...prev, { sender: 'user', text: String(value) }]);

    // Trigger evaluation on Intelligence Panel Pipeline
    const para = {
      timePerQuestion: keyLogs,
      corrections,
      navBackCount
    };
    
    const evaluation = await api.evaluateAnsweringStep(
      activeSurvey.id,
      updatedAnswers,
      para,
      persona,
      speed
    );

    setPipelineState({
      behaviorScores: evaluation.behaviorScores,
      validation: evaluation.validation,
      confidenceScore: evaluation.confidenceScore,
      trustBand: evaluation.trustBand,
      nextAction: evaluation.nextAction,
      nextActionReason: evaluation.nextActionReason
    });

    // Proceed to next question logic
    const nextIdx = currentQuestionIdx + 1;
    if (nextIdx < activeSurvey.questions.length) {
      setTimeout(() => {
        const nextQ = activeSurvey.questions[nextIdx];
        const nextQText = getQuestionText(nextQ);
        
        let prefixText = '';
        if (evaluation.nextAction === 'SIMPLIFY') {
          prefixText = '[Simplified Language Interface active]: ';
        } else if (evaluation.nextAction === 'REORDER') {
          prefixText = '[Triggering core triangulation questions]: ';
        }

        setChatLog(prev => [...prev, { sender: 'ai', text: `${prefixText}${nextQText}` }]);
        setCurrentQuestionIdx(nextIdx);
        setQuestionStartTime(Date.now());
      }, 1000);
    } else {
      // Complete survey final trigger list
      setTimeout(() => {
        completeAnsweringFlow(updatedAnswers, para, evaluation);
      }, 1000);
    }
  };

  const completeAnsweringFlow = async (finalAnswers: any, para: any, evaluation: any) => {
    if (!activeSurvey) return;

    // Build the final compiled responses object
    const finalResp: SurveyResponse = {
      id: 'resp_' + Date.now(),
      surveyId: activeSurvey.id,
      surveyName: activeSurvey.name_en,
      enumeratorId: db.currentUser?.id === 'u_fod' ? 'enum_2' : 'enum_1', // Emulate Suspect enumerator Karthik in FOD scenario
      enumeratorName: db.currentUser?.id === 'u_fod' ? 'Karthik S. (Suspect Profile)' : 'Lakshmi R.',
      householdId: householdPrepop,
      timestamp: new Date().toISOString(),
      answers: finalAnswers,
      codedAnswers: {
        Q_OCCUPATION: resolveAutoCoding(finalAnswers.Q_OCCUPATION) || {
          code: 'None',
          label: 'Uncoded freeform text',
          confidence: 25,
          reason: 'Auto coder unassigned'
        }
      },
      consentLogged: true,
      consentTimestamp: new Date().toISOString(),
      paradata: {
        ...para,
        gpsLat: 13.0827,
        gpsLng: 80.2707,
        mode: 'CAPI'
      },
      behaviorScores: evaluation.behaviorScores,
      validation: evaluation.validation,
      confidenceScore: evaluation.confidenceScore,
      trustBand: evaluation.trustBand,
      status: evaluation.trustBand === 'Red' ? 'flagged' : 'approved'
    };

    // Offline queuing mechanics
    if (isOffline) {
      setQueuedResponses(prev => [...prev, finalResp]);
      setStage(4);
    } else {
      setIsSyncing(true);
      await api.submitResponse(finalResp);
      setIsSyncing(false);
      setStage(4);
      onResponseStored();
    }
  };

  const handleReconnectSync = async () => {
    setIsOffline(false);
    if (queuedResponses.length === 0) return;

    setIsSyncing(true);
    // Submit All queued items sequentially
    for (const resp of queuedResponses) {
      await api.submitResponse(resp);
    }
    setQueuedResponses([]);
    setIsSyncing(false);
    onResponseStored();
  };

  const resetFlow = () => {
    setStage(1);
    setAutoCodeSuggest(null);
  };

  const activeQ = activeSurvey?.questions[currentQuestionIdx];

  return (
    <div className="space-y-6" id="collection-client-root">
      
      {/* Network connectivity simulation bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            {t.convoClientTitle}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Primary digital DPI collection screen with dynamic translation hooks</p>
        </div>

        {/* Action Toggles for Network Connection Demo */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <SyncIndicator offlineCount={queuedResponses.length} isSyncing={isSyncing} />

          {isOffline ? (
            <button 
              onClick={handleReconnectSync}
              className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
              aria-label="Re-connect network to sync queued data"
            >
              <WifiOff className="w-4 h-4 text-rose-600" />
              Simulate Offline (Reconnect)
            </button>
          ) : (
            <button 
              onClick={() => setIsOffline(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-100 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
              aria-label="Disconnect collection network connection to demonstrate caching"
            >
              <Wifi className="w-4 h-4 text-emerald-600" />
              Fully Connected
            </button>
          )}
        </div>
      </div>

      <OfflineBanner isOffline={isOffline} />

      {/* STAGE 1: Lang selection */}
      {stage === 1 && (
        <section className="bg-white rounded-xl border border-slate-100 p-8 max-w-lg mx-auto text-center space-y-6">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-md font-bold text-slate-800">Choose Interview Language</h2>
            <p className="text-xs text-slate-400">सभी उत्तर लोक हित में संकलित किए जाते हैं</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => { setSelectedLang('en'); setStage(2); }} 
              className="py-3 px-4 border border-slate-200 hover:border-indigo-500 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
            >
              English (EN)
            </button>
            <button 
              onClick={() => { setSelectedLang('hi'); setStage(2); }} 
              className="py-3 px-4 border border-slate-200 hover:border-indigo-500 rounded-xl text-xs font-semibold text-slate-700 transition-colors font-sans"
            >
              हिंदी (HI)
            </button>
            <button 
              onClick={() => { setSelectedLang('ta'); setStage(2); }} 
              className="py-3 px-4 border border-slate-200 hover:border-indigo-500 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
            >
              தமிழ் (TA)
            </button>
          </div>
        </section>
      )}

      {/* STAGE 2: Informative Consent screen */}
      {stage === 2 && (
        <section className="bg-white rounded-xl border border-slate-100 p-8 max-w-xl mx-auto space-y-6">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 text-indigo-800">
            <Shield className="w-5 h-5 shrink-0 text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider">{t.consentTitle}</h2>
          </div>

          <div className="text-xs text-slate-600 leading-relaxed space-y-3 font-sans">
            <p className="font-semibold">{t.consentText}</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-500">
              <li>{t.consentBullet1}</li>
              <li>{t.consentBullet2}</li>
              <li>{t.consentBullet3}</li>
            </ul>
          </div>

          <div className="flex items-center gap-3 pt-3">
            <button 
              onClick={resetFlow}
              className="flex-1 py-2 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-all"
            >
              {t.declineConsent}
            </button>
            <button 
              onClick={startSurveySelection}
              className="flex-1 py-2 px-4 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5"
            >
              {t.acceptConsent}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* STAGE 3: Conversational and live decision pipeline panel */}
      {stage === 3 && activeSurvey && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left panel: Answering Conversational chat window */}
          <section className="lg:col-span-7 bg-white rounded-xl border border-slate-100 p-4 space-y-4 flex flex-col h-[520px]">
            {/* Header: Persona Modifier controls (WOW simulation triggers) */}
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-200 text-[10px] uppercase font-bold tracking-wider text-slate-500">
              <div className="flex items-center gap-2">
                <span>Respondent Profile:</span>
                <div className="flex bg-white rounded border divide-x border-slate-200">
                  <button 
                    onClick={() => { setPersona('Genuine'); setAnswers(prev => ({ ...prev, Q_INCOME: 24500, Q_OCCUPATION: 'Farmer' })); }} 
                    className={`px-2 py-0.5 ${persona === 'Genuine' ? 'bg-indigo-600 text-white font-bold' : ''}`}
                  >
                    Legit
                  </button>
                  <button 
                    onClick={() => { setPersona('Suspicious'); setAnswers(prev => ({ ...prev, Q_INCOME: 200000, Q_OCCUPATION: 'Unemployed' })); }} 
                    className={`px-2 py-0.5 ${persona === 'Suspicious' ? 'bg-rose-600 text-white font-bold' : ''}`}
                  >
                    Suspicious
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span>Speed check:</span>
                <div className="flex bg-white rounded border divide-x border-slate-200">
                  <button 
                    onClick={() => setSpeed('Normal')} 
                    className={`px-2 py-0.5 ${speed === 'Normal' ? 'bg-indigo-600 text-white font-bold' : ''}`}
                  >
                    Normal (90s)
                  </button>
                  <button 
                    onClick={() => setSpeed('Too-fast')} 
                    className={`px-2 py-0.5 ${speed === 'Too-fast' ? 'bg-rose-600 text-white font-bold animate-pulse' : ''}`}
                  >
                    Fabricating (4s)
                  </button>
                </div>
              </div>
            </div>

            {/* Simulated chat container */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 p-2 bg-slate-50/40 border border-slate-100 rounded-lg">
              {chatLog.map((chat, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${chat.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                >
                  <div className={`p-3 rounded-2xl text-xs max-w-sm ${
                    chat.sender === 'user' 
                      ? 'bg-indigo-750 text-white rounded-br-none' 
                      : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none shadow-sm'
                  }`}>
                    {chat.prepopulated && (
                      <span className="inline-block text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 font-mono px-1.5 py-0.5 rounded uppercase mr-1 mb-1 shadow-sm">
                        {t.fromHousehold}
                      </span>
                    )}
                    <p className="leading-relaxed font-sans">{chat.text}</p>
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Typing answers controls panel */}
            {activeQ && (
              <div className="space-y-3">
                {/* Visual Synonym Suggestion Card */}
                {autoCodeSuggest && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs flex justify-between items-center animate-fadeIn shadow-sm">
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[9px] font-bold text-sky-800 bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded uppercase">
                          MATCH DETECTED: NCO {autoCodeSuggest.code}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="font-semibold text-indigo-800 font-sans">{autoCodeSuggest.label}</span>
                      </div>
                      <p className="text-slate-600 leading-normal">{autoCodeSuggest.reason}</p>
                    </div>

                    <button 
                      onClick={handleApplyAutoCode}
                      className="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-[10px] uppercase tracking-wider rounded-md"
                    >
                      Apply Code
                    </button>
                  </div>
                )}

                {/* Input action toolbar */}
                <div className="flex gap-2 items-center">
                  
                  {activeQ.type === 'single' && activeQ.options ? (
                    <div className="flex-1 flex gap-1.5 flex-wrap">
                      {activeQ.options.map((opt, oIdx) => {
                        // Translate options bilingual
                        const optText = selectedLang === 'hi' && activeQ.options_hi ? activeQ.options_hi[oIdx] :
                                        selectedLang === 'ta' && activeQ.options_ta ? activeQ.options_ta[oIdx] : opt;
                        
                        return (
                          <button 
                            key={opt}
                            onClick={() => handleAnswerSubmit(opt)}
                            className="flex-1 py-2 px-3 border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 bg-white font-medium text-xs rounded-xl shadow-sm transition-all"
                          >
                            {optText}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex gap-2 relative">
                      <input 
                        type={activeQ.type === 'number' ? 'number' : 'text'} 
                        placeholder={activeQ.type === 'number' ? 'Enter numerical amount...'  : 'Enter answer details...'}
                        value={textInput}
                        onChange={e => handleTextInputChange(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAnswerSubmit(textInput);
                          if (e.key === 'Backspace' && textInput.length > 0) setCorrections(p => p + 1);
                        }}
                        className="flex-1 bg-white p-3 pr-10 border border-slate-250 rounded-xl text-xs focus:outline-indigo-500 text-slate-800 shadow"
                      />
                      <button 
                        onClick={() => handleAnswerSubmit(textInput)}
                        className="absolute right-2 top-1.5 p-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                        title="Submit answer selection"
                      >
                        <CornerDownLeft className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Bhashini Voice Sim button */}
                  <button 
                    onClick={handleVoiceInputSimulate}
                    className={`p-3 border rounded-xl shadow transition-colors flex items-center justify-center shrink-0 ${
                      voiceRecording ? 'bg-rose-500 border-rose-500 text-white animate-pulse' : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-50'
                    }`}
                    title={t.voiceSim}
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                </div>
                
                {/* Progress bar */}
                <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-slate-400">
                  <div className="flex-1 bg-slate-100 h-1 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                      style={{ width: `${(currentQuestionIdx / activeSurvey.questions.length) * 100}%` }}
                    />
                  </div>
                  <span>Q: {currentQuestionIdx + 1}/{activeSurvey.questions.length}</span>
                </div>
              </div>
            )}
          </section>

          {/* Right panel: Live Intelligence telemetry update feed */}
          <section className="lg:col-span-5 bg-white rounded-xl border border-slate-100 p-4 space-y-4">
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-400 border-b border-slate-50 pb-2.5 flex items-center gap-1">
              <Radio className="w-4 h-4 text-emerald-500 shrink-0" />
              {t.pipelineTitle} (Live telemetry)
            </h2>

            {/* Arc Confidence Gauge */}
            <div className="grid grid-cols-2 gap-4">
              <ConfidenceGauge score={pipelineState.confidenceScore} />
              
              {/* Detailed Breakdown weights description */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-[11px] leading-relaxed self-stretch flex flex-col justify-between">
                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400 block">MoSPI Weight Index</span>
                  <p className="text-slate-500">Score integrates rule validity, strata deviation levels, paradata pacing, and corrected typings.</p>
                </div>
                <TrustBadge score={pipelineState.confidenceScore} band={pipelineState.trustBand} isColorBlind={isColorBlind} />
              </div>
            </div>

            {/* 6 Stage Vertical Pipeline display */}
            <div className="space-y-3 leading-relaxed text-xs">
              <span className="font-bold uppercase tracking-widest text-[9px] text-slate-400 block">6-Stage National Processing Channel</span>
              
              <div className="relative border-l border-slate-200 pl-4 space-y-3">
                {/* STAGE 1: Behavior pacing scorebars */}
                <div className="relative">
                  <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-700 font-black flex items-center justify-center text-[7px]" />
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800">Stage 1: Behavior Analytics</span>
                    <div className="grid grid-cols-1 gap-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <ScoreBar label="Engagement Level" value={pipelineState.behaviorScores.engagement} colorClass="bg-indigo-600" description="Calculated ratio of response-time vs standard typing limits" />
                      <ScoreBar label="Interview Fatigue" value={pipelineState.behaviorScores.fatigue} colorClass="bg-amber-500" description="Cumulative question pause durations" />
                    </div>
                  </div>
                </div>

                {/* STAGE 2: Adaptive questioning branch */}
                <div className="relative">
                  <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-700" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800">Stage 2: Adaptive Branch Decision</span>
                    <div className="p-2 bg-indigo-50/50 border border-indigo-100/60 rounded text-[11px] text-slate-700 font-sans">
                      <span className="font-bold text-slate-900">{pipelineState.nextAction}</span> — {pipelineState.nextActionReason}
                    </div>
                  </div>
                </div>

                {/* STAGE 3: Checklist Status Chips */}
                <div className="relative">
                  <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-700" />
                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-800">Stage 3: Multi-Layer Validation</span>
                    <div className="flex gap-1.5 flex-wrap">
                      <StatusChip status={pipelineState.validation.layer1_rule.status} label="Rules" reason={pipelineState.validation.layer1_rule.reason} isColorBlind={isColorBlind} />
                      <StatusChip status={pipelineState.validation.layer3_bayesian.status} label="Strata prior" reason={pipelineState.validation.layer3_bayesian.reason} isColorBlind={isColorBlind} />
                      <StatusChip status={pipelineState.validation.layer5_cross.status} label="Cross Checks" reason={pipelineState.validation.layer5_cross.reason} isColorBlind={isColorBlind} />
                    </div>
                  </div>
                </div>

                {/* STAGE 4: Integrity state evaluation */}
                <div className="relative">
                  <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-700" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800">Stage 4: National Trust Band</span>
                    <div className="text-[11px]">
                      Evaluated category matches <span className={`font-bold outline-none border-b ${
                        pipelineState.trustBand === 'Green' ? 'text-emerald-700 border-emerald-300' : 'text-rose-700 border-rose-300'
                      }`}>{pipelineState.trustBand} Registry standards</span>
                    </div>
                  </div>
                </div>

                {/* STAGE 5: Next question reason details */}
                <div className="relative">
                  <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-700" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800">Stage 5: Path Triangulation Reason</span>
                    <p className="text-slate-500 text-[11px]">
                      {activeQ ? `Analyzing ${activeQ.code} rules criteria matching.` : 'Survey completed.'}
                    </p>
                  </div>
                </div>

                {/* STAGE 6: Stored indicators check */}
                <div className="relative">
                  <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-700" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800">Stage 6: Persistent Archiving</span>
                    <p className="text-slate-500 text-[11px]">Write mode: Buffered append-only local cache blocks</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      )}

      {/* STAGE 4: Success Completion feedback card */}
      {stage === 4 && (
        <section className="bg-white rounded-xl border border-slate-100 p-8 max-w-md mx-auto text-center space-y-6">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-800">Survey Completed successfully</h2>
            <p className="text-xs text-slate-400">
              {isOffline 
                ? 'Stored offline inside PWA SQLite/IndexedDB cache queue.' 
                : 'Pushed and synchronized to DPD scrutiny validation warehouse.'
              }
            </p>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={resetFlow}
              className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg"
            >
              Start New Survey
            </button>
            {isOffline && (
              <button 
                onClick={handleReconnectSync}
                className="flex-1 py-2 px-3 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Trigger Sync
              </button>
            )}
          </div>
        </section>
      )}

    </div>
  );
};
