/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { SurveyResponse, ClassificationCode } from '../types';
import { translations } from '../i18n';
import { TrustBadge, StatusChip, ConfidenceGauge, ReasonPopover } from './TrustComponents';
import { 
  FileSearch, 
  Sparkles, 
  Check, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  Eye, 
  Search, 
  Settings, 
  Sliders, 
  ShieldAlert, 
  Layers, 
  AlertTriangle, 
  TrendingUp, 
  User, 
  MapPin, 
  BarChart2, 
  BookOpen, 
  CheckCircle,
  Clock,
  X,
  FileText,
  Volume2,
  Camera,
  ExternalLink,
  Info,
  Calendar,
  Grid,
  Smartphone
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid, 
  LineChart, 
  Line, 
  Cell, 
  ComposedChart
} from 'recharts';

interface DPDWorkspaceProps {
  lang: 'en' | 'hi' | 'ta';
  isColorBlind: boolean;
}

interface SupervisorActionLog {
  id: string;
  responseId: string;
  action: 'Approve' | 'Re-Interview' | 'Escalate';
  note: string;
  supervisorName: string;
  timestamp: string;
}

// Taxonomic Code Structure for search picker
interface TaxonNode {
  code: string;
  name: string;
  description?: string;
  inclusions?: string;
  exclusions?: string;
  children?: TaxonNode[];
}

const TAXONOMY_TREE: TaxonNode[] = [
  {
    code: '1',
    name: 'Major Group 1: Legislators, Senior Officials and Managers',
    children: [
      {
        code: '11',
        name: 'Sub-Major Group 11: Legislators and Senior Officials',
        children: [
          { code: '1111', name: 'Unit 1111: Members of Parliament and State Assemblies', inclusions: 'Elected representatives, ministers', exclusions: 'Civil servants (Group 12)' }
        ]
      }
    ]
  },
  {
    code: '5',
    name: 'Major Group 5: Service Workers and Shop & Market Sales Workers',
    children: [
      {
        code: '52',
        name: 'Sub-Major Group 52: Sales Demonstration & Models',
        children: [
          { code: '5220', name: 'Unit 5220: Shopkeepers and Retail Assistants', inclusions: 'Bazaar stalls keepers, grocery store managers', exclusions: 'Wholesalers (Group 13)' }
        ]
      }
    ]
  },
  {
    code: '6',
    name: 'Major Group 6: Skilled Agricultural and Fishery Workers',
    children: [
      {
        code: '61',
        name: 'Sub-Major Group 61: Market-Oriented Skilled Agricultural Workers',
        children: [
          { code: '6111', name: 'Unit 6111: Field Crop Farmers', inclusions: 'Wheat growers, rice cultivators, grain planters', exclusions: 'Gardeners and horticulturists' }
        ]
      }
    ]
  },
  {
    code: '8',
    name: 'Major Group 8: Plant and Machine Operators and Assemblers',
    children: [
      {
        code: '83',
        name: 'Sub-Major Group 83: Drivers and Mobile Plant Operators',
        children: [
          {
            code: '8322',
            name: 'Unit 8322: Auto-rickshaw & Taxi Drivers',
            description: 'Drivers of motorized three-wheelers, cars, and passenger light vehicles.',
            inclusions: 'Traditional taxi services, app-based ride-hailing services (Ola/Uber), auto-rickshaw riders',
            exclusions: 'Excludes: Animal-drawn passenger carts (NCO 9332), heavy cargo trucks'
          }
        ]
      }
    ]
  }
];

export const DPDWorkspace: React.FC<DPDWorkspaceProps> = ({ lang, isColorBlind }) => {
  const t = translations[lang];

  // High-level sub-navigation tabs (8.1, 8.2, 8.3, 8.4)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'flag_review' | 'coding' | 'exceptions'>('flag_review');

  // Local state representing database entries, synchronized with local storage simulation
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [codes, setCodes] = useState<ClassificationCode[]>([]);
  const [successToast, setSuccessToast] = useState('');

  // 8.2 Master-Detail flag review states
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [filterLayer, setFilterLayer] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [filterEnumerator, setFilterEnumerator] = useState<string>('');

  // Detail panel collapsibles: map of layer index -> open status
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({
    layer1: true,
    layer2: true,
    layer3: true,
    layer4: true,
    layer5: true
  });

  // Trust breakdown visualizer modal states
  const [isTrustExplainOpen, setIsTrustExplainOpen] = useState(false);

  // Attached media lightbox viewer
  const [lightboxMedia, setLightboxMedia] = useState<{ type: 'photo' | 'audio'; src: string; caption: string } | null>(null);

  // supervisor_actions modal variables
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'Approve' | 'Re-Interview' | 'Escalate';
    responseId: string;
  } | null>(null);
  const [supervisorNote, setSupervisorNote] = useState('');
  const [actionHistory, setActionHistory] = useState<SupervisorActionLog[]>([]);

  // 8.3 Taxonomic code picker tree state
  const [isCodePickerOpen, setIsCodePickerOpen] = useState(false);
  const [codePickerTarget, setCodePickerTarget] = useState<{ responseId: string; questionId: string } | null>(null);
  const [taxonSearchTerm, setTaxonSearchTerm] = useState('');
  const [expandedTaxonGroups, setExpandedTaxonGroups] = useState<string[]>(['1', '5', '6', '8']);

  // Fetch from model APIs
  useEffect(() => {
    loadDPDData();
    const loadedLogs = localStorage.getItem('satark_supervisor_logs');
    if (loadedLogs) {
      setActionHistory(JSON.parse(loadedLogs));
    }
  }, []);

  const loadDPDData = async () => {
    const resps = await api.getResponses();
    const cds = await api.getClassificationCodes();
    
    // Ensure all mock responses have paradata and detailed breakdowns for the detailed charts
    const enrichedResps = resps.map(r => {
      // Inject standard question timers if not existing
      if (!r.paradata.timePerQuestion || Object.keys(r.paradata.timePerQuestion).length === 0) {
        r.paradata.timePerQuestion = {
          'Q_NAME': 12000,
          'Q_AGE': 10000,
          'Q_OCCUPATION': 25000,
          'Q_INCOME': 35000,
          'Q_MOBILE': 8000
        };
      }
      return r;
    });

    setResponses(enrichedResps);
    setCodes(cds);
    if (enrichedResps.length > 0 && !selectedResponseId) {
      // Default select the first flagged response or first response general
      const firstFlagged = enrichedResps.find(x => x.trustBand === 'Red' || x.status === 'flagged');
      setSelectedResponseId(firstFlagged ? firstFlagged.id : enrichedResps[0].id);
    }
  };

  // Helper dispatcher toast
  const triggerToast = (text: string) => {
    setSuccessToast(text);
    setTimeout(() => setSuccessToast(''), 4500);
  };

  // Dispatch actions to state and sync to custom supervisor action logs tables
  const submitSupervisorAction = () => {
    if (!actionModal) return;
    if (!supervisorNote.trim()) {
      alert('Supervisor audit verification require a valid note explanation field');
      return;
    }

    const { type, responseId } = actionModal;
    const targetResponse = responses.find(r => r.id === responseId);
    
    if (targetResponse) {
      if (type === 'Approve') {
        api.approveResponse(responseId);
        triggerToast(`Incident Resolved: Survey response #${responseId} manually cleared & pushed to national database!`);
      } else if (type === 'Re-Interview') {
        api.flagResponseForReinterview(responseId);
        triggerToast(`Immediate Mandate: Response #${responseId} sent back to FOD field supervisors for re-interview.`);
      } else if (type === 'Escalate') {
        targetResponse.status = 'flagged'; // keep flagged but escalate flag
        triggerToast(`Audit escalation logged for response #${responseId}. Advanced statistics branch notified.`);
      }

      // Add to audit database logs
      const log: SupervisorActionLog = {
        id: 's_log_' + Date.now(),
        responseId,
        action: type,
        note: supervisorNote,
        supervisorName: 'Amit Verma (DPD Officer)',
        timestamp: new Date().toISOString()
      };

      const updatedHistory = [log, ...actionHistory];
      setActionHistory(updatedHistory);
      localStorage.setItem('satark_supervisor_logs', JSON.stringify(updatedHistory));
      
      // Reload lists
      loadDPDData();
    }

    // Reset modals
    setActionModal(null);
    setSupervisorNote('');
  };

  // Taxonomic Search match helper
  const searchTaxonNode = (node: TaxonNode, query: string): boolean => {
    if (node.code.includes(query) || node.name.toLowerCase().includes(query)) return true;
    if (node.inclusions && node.inclusions.toLowerCase().includes(query)) return true;
    if (node.exclusions && node.exclusions.toLowerCase().includes(query)) return true;
    if (node.children) {
      return node.children.some(child => searchTaxonNode(child, query));
    }
    return false;
  };

  // Interactive link selection from dashboard top list
  const handleFilteredNavigate = (filterType: 'question' | 'region' | 'enumerator', filterValue: string) => {
    if (filterType === 'question') {
      setFilterLayer('all');
    } else if (filterType === 'region') {
      setFilterRegion(filterValue);
    } else if (filterType === 'enumerator') {
      setFilterEnumerator(filterValue);
    }
    setActiveTab('flag_review');
  };

  // Code selection execution from the Taxonomic Code Picker
  const applyTaxonCode = (code: string, label: string) => {
    if (!codePickerTarget) return;
    const { responseId, questionId } = codePickerTarget;
    api.updateResponseCoding(responseId, questionId, code, label);
    triggerToast(`Taxonomy classification overrides completed: Code ${code} assigned.`);
    setIsCodePickerOpen(false);
    loadDPDData();
  };

  // Bulk Accept for high confidence predictions (>=90%)
  const handleBulkApproveCodes = () => {
    let count = 0;
    responses.forEach(r => {
      Object.entries(r.codedAnswers).forEach(([qId, detail]: [string, any]) => {
        if (detail.confidence >= 90 && r.status !== 'approved') {
          api.updateResponseCoding(r.id, qId, detail.code, detail.label);
          count++;
        }
      });
    });
    if (count > 0) {
      triggerToast(`Successful bulk clearance: ${count} auto-coded responses (confidence \u226590%) certified.`);
      loadDPDData();
    } else {
      triggerToast('No pending auto-coded responses meet the \u226590% confidence threshold.');
    }
  };

  // Master List Filtering variables
  const filteredResponses = responses.filter(r => {
    // text search
    if (filterEnumerator && !r.enumeratorName.toLowerCase().includes(filterEnumerator.toLowerCase())) return false;
    // region filter
    if (filterRegion !== 'all' && !r.householdId.startsWith(filterRegion)) return false;
    // severity filter
    if (filterSeverity !== 'all') {
      if (filterSeverity === 'fail' && r.trustBand !== 'Red') return false;
      if (filterSeverity === 'warn' && r.trustBand !== 'Amber') return false;
    }
    // layer fails filter
    if (filterLayer !== 'all') {
      if (filterLayer === 'validation' && r.validation.layer1_rule.status === 'fail') return true;
      if (filterLayer === 'govt' && r.validation.layer2_govt.status === 'fail') return true;
      if (filterLayer === 'bayesian' && r.validation.layer3_bayesian.status === 'fail') return true;
      if (filterLayer === 'behavior' && r.validation.layer4_behavior.status === 'fail') return true;
      if (filterLayer === 'cross' && r.validation.layer5_cross.status === 'fail') return true;
      return false; // if non matches layer fail
    }

    return true;
  });

  const selectedResponse = responses.find(r => r.id === selectedResponseId);

  // Computations for 8.1 Dashboard metric numbers
  const countAwaitingReview = responses.filter(r => r.status === 'flagged').length;
  
  let codingQueueCount = 0;
  responses.forEach(r => {
    Object.keys(r.codedAnswers).forEach(() => {
      if (r.status !== 'approved') codingQueueCount++;
    });
  });

  const countExceptions = responses.filter(r => 
    r.validation.layer5_cross.status === 'fail' || 
    r.validation.layer3_bayesian.status === 'fail'
  ).length;

  const sumConfidence = responses.reduce((acc, curr) => acc + curr.confidenceScore, 0);
  const avgConfidenceText = responses.length > 0 ? `${Math.round(sumConfidence / responses.length)}%` : '0%';

  // Mock flag graph histories (14 Days Stacked Inflow counts by validation layer)
  const inflowData = [
    { name: '10/05', Completeness: 1, Range: 2, Bayesian: 1, Behavior: 4, CrossField: 2 },
    { name: '11/05', Completeness: 0, Range: 3, Bayesian: 2, Behavior: 5, CrossField: 1 },
    { name: '12/05', Completeness: 1, Range: 1, Bayesian: 0, Behavior: 3, CrossField: 3 },
    { name: '13/05', Completeness: 0, Range: 0, Bayesian: 1, Behavior: 4, CrossField: 0 },
    { name: '14/05', Completeness: 2, Range: 4, Bayesian: 3, Behavior: 7, CrossField: 4 },
    { name: '15/05', Completeness: 0, Range: 1, Bayesian: 1, Behavior: 3, CrossField: 1 },
    { name: '16/05', Completeness: 1, Range: 2, Bayesian: 0, Behavior: 2, CrossField: 0 },
    { name: '17/05', Completeness: 3, Range: 5, Bayesian: 4, Behavior: 8, CrossField: 5 },
    { name: '18/05', Completeness: 1, Range: 1, Bayesian: 1, Behavior: 5, CrossField: 2 },
    { name: '19/05', Completeness: 0, Range: 0, Bayesian: 2, Behavior: 3, CrossField: 1 },
    { name: '20/05', Completeness: 0, Range: 1, Bayesian: 0, Behavior: 2, CrossField: 1 },
    { name: '21/05', Completeness: 2, Range: 3, Bayesian: 1, Behavior: 6, CrossField: 3 },
    { name: '22/05', Completeness: 1, Range: 4, Bayesian: 2, Behavior: 9, CrossField: 4 },
    { name: '23/05', Completeness: 0, Range: 1, Bayesian: 3, Behavior: 4, CrossField: 5 }
  ];

  // Mock Error analysis statistical summaries
  const mostCommonErrors = [
    { type: 'Cross-Field Logical Contradiction', count: 18, trend: 'up', reason: 'High wage entered (>=₹10,000) contradicts status Unemployed' },
    { type: 'Paradata straight-lining (speeding)', count: 14, trend: 'down', reason: 'Answering speed (<5 seconds cumulative) indicates data fabrication' },
    { type: 'Bayesian outlier boundaries', count: 11, trend: 'up', reason: 'Income reported lies in the outlier 99.8th percentile for demographic strata' },
    { type: 'Required demographic fields missing', count: 5, trend: 'stable', reason: 'Required structural questions skipped in sub-sections' }
  ];

  // Helper for toggle collapsibles
  const toggleLayerExpanded = (layerKey: string) => {
    setExpandedLayers(prev => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  return (
    <div className="space-y-6" id="dpd-workspace-wrapper">
      {/* Head Banner controls with master-tabs and clear alerts */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-205 shadow-sm text-left">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-150 flex items-center justify-center text-indigo-700 font-extrabold shadow-sm">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                {t.dpd_title}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">Verify structural contradictions, statistical boundaries, and semantic taxonomy coding returns</p>
            </div>
          </div>
        </div>

        {/* Master layout tabs switching */}
        <div className="flex bg-slate-50 border border-slate-200 p-1.5 rounded-xl gap-1 text-xs font-bold w-full md:w-auto">
          {(['dashboard', 'flag_review', 'coding', 'exceptions'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-center font-bold tracking-tight uppercase text-[9px] transition-all duration-150 ${
                activeTab === tabKey 
                  ? 'bg-indigo-950 text-white shadow-md' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tabKey === 'dashboard' ? 'DPD Dashboard' :
               tabKey === 'flag_review' ? 'Flag Review' :
               tabKey === 'coding' ? 'Coding Review' : 'Anomalies & Stats'}
            </button>
          ))}
        </div>
      </header>

      {/* Success Notification Status banner */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 8.1: DPD DASHBOARD TAB */}
      {/* ======================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Row 1 — Metric Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
            <div className="bg-amber-50/50 border-2 border-amber-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
              <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block mb-2">Awaiting Validation Review</span>
              <div className="text-3xl font-extrabold text-amber-900 font-mono tracking-tight">{countAwaitingReview}</div>
              <p className="text-[10.5px] text-amber-700/80 mt-1 font-semibold">Flagged interviews pending manual resolution</p>
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Coding Queue Capacity</span>
              <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">{codingQueueCount}</div>
              <p className="text-[10.5px] text-slate-500 mt-1 font-semibold">Free-text fields pending NCO taxonomy checks</p>
            </div>

            <div className={`p-5 rounded-2xl shadow-sm border transition-all ${
              countExceptions > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'
            }`}>
              <span className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${
                countExceptions > 0 ? 'text-rose-700 animate-pulse' : 'text-slate-400'
              }`}>Exceptions Captured</span>
              <div className={`text-3xl font-extrabold font-mono tracking-tight ${
                countExceptions > 0 ? 'text-rose-800' : 'text-slate-900'
              }`}>{countExceptions}</div>
              <p className="text-[10.5px] text-slate-500 mt-1 font-semibold">Outlier anomalies & cross-field fails priority</p>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Weighted Avg Confidence (7d)</span>
              <div className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight">{avgConfidenceText}</div>
              <p className="text-[10.5px] text-slate-500 mt-1 font-semibold">Cumulative national data quality rating</p>
            </div>
          </section>

          {/* Row 2 — Charts and top statistics lists split */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
            {/* Left — 14 Days validation stacked bar chart */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800">Dynamic Flag Inflow Rate (14 Days)</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Stacked volumes of daily incoming alerts distributed across structural checks</p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inflowData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                    <YAxis style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 10, background: '#1e293b', color: '#fff', borderRadius: '8px' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="Completeness" stackId="a" fill="#38bdf8" />
                    <Bar dataKey="Range" stackId="a" fill="#fb7185" />
                    <Bar dataKey="Bayesian" stackId="a" fill="#c084fc" />
                    <Bar dataKey="Behavior" stackId="a" fill="#fbbf24" />
                    <Bar dataKey="CrossField" stackId="a" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right — Top flagged lists side-by-side */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
              <h3 className="font-extrabold text-sm text-slate-800 pb-2 border-b border-slate-100">Top Quality Flag Hotspots</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
                {/* Outlier questions */}
                <div className="space-y-2.5">
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider block">Failing Questions</span>
                  <div className="space-y-1">
                    {[
                      { field: 'Q_INCOME (Stipend Limit)', count: 4 },
                      { field: 'Q_OCCUPATION (Classify)', count: 2 },
                      { field: 'Q_AGE (Eligibility rules)', count: 1 }
                    ].map((idx, key) => (
                      <div 
                        key={key} 
                        onClick={() => handleFilteredNavigate('question', idx.field)}
                        className="p-2 hover:bg-slate-50 cursor-pointer rounded-lg border border-slate-100 flex justify-between items-center text-[11px]"
                      >
                        <span className="text-slate-700 font-mono font-bold">{idx.field.split(' ')[0]}</span>
                        <span className="bg-slate-100 text-slate-800 font-bold px-1.5 py-0.5 rounded font-mono text-[10px]">{idx.count} fails</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hot regions */}
                <div className="space-y-2.5">
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider block">Flagged Households</span>
                  <div className="space-y-1">
                    {[
                      { region: 'HH-TN-0043 (Chennai s.)', count: 3 },
                      { region: 'HH-TN-0044 (Chennai s.)', count: 2 },
                      { region: 'HH-TN-0042 (Chennai c.)', count: 1 }
                    ].map((idx, key) => (
                      <div 
                        key={key} 
                        onClick={() => handleFilteredNavigate('region', idx.region.split(' ')[0])}
                        className="p-2 hover:bg-slate-50 cursor-pointer rounded-lg border border-slate-100 flex justify-between items-center text-[11px]"
                      >
                        <span className="text-slate-700 truncate max-w-[120px] font-mono font-bold">{idx.region}</span>
                        <span className="bg-slate-100 text-slate-801 font-bold px-1.5 py-0.5 rounded font-mono text-[10px]">{idx.count} flags</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Row 3 — Most Common Errors table */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left">
            <h3 className="font-extrabold text-sm text-slate-800 pb-3">Validation Rule Fault Analysis</h3>
            
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left" role="presentation">
                <thead className="bg-slate-50 text-[10px] text-slate-500 font-black uppercase tracking-wider border-b border-slate-150">
                  <tr>
                    <th className="px-4 py-3">Error Type Code</th>
                    <th className="px-4 py-3 text-center">Inflow count</th>
                    <th className="px-4 py-3 text-center">Trend (14d)</th>
                    <th className="px-4 py-3">Representative Audited Reason (Verbatim)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                  {mostCommonErrors.map((err, index) => (
                    <tr key={index} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3.5 text-slate-900 font-bold">{err.type}</td>
                      <td className="px-4 py-3.5 text-center font-mono font-bold">{err.count} occurrences</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          err.trend === 'up' ? 'bg-rose-50 text-rose-800' :
                          err.trend === 'down' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {err.trend === 'up' ? '\u2191 Ascending' :
                           err.trend === 'down' ? '\u2193 Descending' : '\u2192 Steady'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 italic font-sans max-w-sm font-medium">"{err.reason}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 8.2: FLAG REVIEW PAGE (MASTER-DETAIL) */}
      {/* ======================================= */}
      {activeTab === 'flag_review' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="flag-review-container">
          
          {/* Left Master Pane (40% Column) */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-4 text-left">
            
            {/* Filters Row above standard list */}
            <div className="space-y-2 pb-3 border-b border-slate-150">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Queue Queries & Filters</span>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Search enumerator name */}
                <div className="col-span-2 relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search surveyor name..."
                    value={filterEnumerator}
                    onChange={e => setFilterEnumerator(e.target.value)}
                    className="w-full text-[11px] p-1.5 pl-8 border border-slate-200 rounded-lg bg-slate-50 focus:outline-indigo-500 font-semibold"
                  />
                </div>

                {/* Layer selector */}
                <div>
                  <select
                    value={filterLayer}
                    onChange={e => setFilterLayer(e.target.value)}
                    className="w-full p-1.5 text-[11px] font-bold bg-white border border-slate-205 rounded-lg focus:outline-indigo-500"
                  >
                    <option value="all">All Layers</option>
                    <option value="validation">Layer 1: Rules</option>
                    <option value="govt">Layer 2: LGD Bounds</option>
                    <option value="bayesian">Layer 3: Bayesian Outlier</option>
                    <option value="behavior">Layer 4: Pacing</option>
                    <option value="cross">Layer 5: Logical Contradict</option>
                  </select>
                </div>

                {/* Severity selector */}
                <div>
                  <select
                    value={filterSeverity}
                    onChange={e => setFilterSeverity(e.target.value)}
                    className="w-full p-1.5 text-[11px] font-bold bg-white border border-slate-205 rounded-lg focus:outline-indigo-500"
                  >
                    <option value="all">All Severities</option>
                    <option value="fail">Fabrication (Red)</option>
                    <option value="warn">High Alert (Amber)</option>
                  </select>
                </div>
              </div>

              {/* Bulk actions and counts */}
              <div className="flex justify-between items-center text-[11px] pt-1.5 font-bold">
                <span className="text-slate-400">{filteredResponses.length} records matching</span>
                {bulkSelectedIds.length > 0 && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        bulkSelectedIds.forEach(id => api.approveResponse(id));
                        triggerToast(`SUCCESS: Verified and approved ${bulkSelectedIds.length} responses in batch bulk transaction!`);
                        setBulkSelectedIds([]);
                        loadDPDData();
                      }}
                      className="px-2 py-0.5 bg-emerald-700 text-white rounded text-[10px] font-extrabold hover:bg-emerald-900 transition-colors"
                    >
                      Bulk Clear ({bulkSelectedIds.length})
                    </button>
                    <button
                      onClick={() => setBulkSelectedIds([])}
                      className="text-slate-500 hover:underline text-[10px]"
                    >
                      Deselect
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Left standard review table list */}
            <div className="overflow-y-auto max-h-[580px] space-y-2 pr-1">
              {filteredResponses.map(r => {
                const isSelected = selectedResponseId === r.id;
                const isBulkChecked = bulkSelectedIds.includes(r.id);
                
                // Determine top layer fail to emit as tag chip
                let topFailChip = 'No active flags';
                let topColor = 'bg-slate-100 text-slate-700';

                if (r.validation.layer5_cross.status === 'fail') {
                  topFailChip = 'Contradiction ✘';
                  topColor = 'bg-rose-50 border border-rose-100 text-rose-700';
                } else if (r.validation.layer4_behavior.status === 'fail') {
                  topFailChip = 'Speeding ✘';
                  topColor = 'bg-rose-50 border border-rose-100 text-rose-700';
                } else if (r.validation.layer3_bayesian.status === 'fail') {
                  topFailChip = 'Outlier ⚠';
                  topColor = 'bg-amber-50 border border-amber-100 text-amber-700';
                }

                // Calculate human clean age (simulated)
                const ageText = r.id === 'resp_1' ? '4 mins ago' : r.id === 'resp_2' ? '12 mins ago' : '1 hr ago';

                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedResponseId(r.id)}
                    className={`p-3 rounded-xl border-2 cursor-pointer relative text-xs flex flex-col gap-2 transition-all ${
                      isSelected ? 'border-indigo-950 bg-indigo-50/15 shadow-sm' : 'border-slate-150 hover:border-slate-200'
                    }`}
                  >
                    {/* Bulk select check box */}
                    <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isBulkChecked}
                        onChange={() => {
                          if (isBulkChecked) {
                            setBulkSelectedIds(bulkSelectedIds.filter(x => x !== r.id));
                          } else {
                            setBulkSelectedIds([...bulkSelectedIds, r.id]);
                          }
                        }}
                        className="rounded cursor-pointer accent-indigo-950"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="font-black text-slate-800 font-mono tracking-tight">#{r.id}</span>
                        <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-50 border border-slate-150 px-1 py-0.5 rounded">
                          {r.householdId}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-tight py-0.5 px-2 rounded-full ${topColor}`}>
                          {topFailChip}
                        </span>
                      </div>

                      <p className="text-slate-650 font-bold truncate max-w-[210px]">{r.surveyName}</p>
                      
                      <div className="flex justify-between items-center text-[10px] text-slate-450 mt-1 font-semibold">
                        <span className="text-slate-600 truncate max-w-[140px] flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" /> {r.enumeratorName}
                        </span>
                        <span className="font-mono text-[9px]">{ageText}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-1">
                      <span className={`text-[10px] font-black ${
                        r.confidenceScore >= 80 ? 'text-emerald-700' :
                        r.confidenceScore >= 50 ? 'text-amber-700' : 'text-rose-700 animate-pulse'
                      }`}>
                        Confidence: {r.confidenceScore}% {r.trustBand}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredResponses.length === 0 && (
                <div className="p-8 text-center text-slate-400 italic text-xs">
                  Zero flagging anomalies matching the query workspace bounds.
                </div>
              )}
            </div>
          </section>

          {/* Right Detail Pane (60% Column) */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm text-left relative overflow-hidden flex flex-col justify-between h-[660px]">
            {selectedResponse ? (
              <div className="flex flex-col h-full">
                
                {/* Scrollable drilldown area */}
                <div className="p-5 space-y-6 overflow-y-auto flex-1">
                  
                  {/* Header info bar */}
                  <div className="flex justify-between items-start gap-4 flex-wrap border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded text-indigo-700 font-mono">
                        VERIFICATION INCIDENT WORKSPACE
                      </span>
                      <h2 className="text-sm font-black text-slate-900 font-mono tracking-tight flex items-center gap-1.5 mt-1.5">
                        Response ID: #{selectedResponse.id}
                      </h2>
                      <div className="text-[11px] text-slate-400 font-semibold space-y-0.5">
                        <p>Enumerator: <strong className="text-slate-800">{selectedResponse.enumeratorName}</strong> (ID: {selectedResponse.enumeratorId.toUpperCase()})</p>
                        <p>Household target: <strong className="text-slate-800">{selectedResponse.householdId}</strong> • Timestamp: {new Date(selectedResponse.timestamp).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Assumed Hardware Channel</span>
                      <span className="inline-flex items-center gap-1 bg-slate-50 border-2 border-slate-200 rounded-full py-0.5 px-3 text-[10px] font-bold text-slate-600 font-mono">
                        <Smartphone className="w-3 h-3 text-slate-500" /> Mobile applet (CAPI)
                      </span>
                    </div>
                  </div>

                  {/* 5 Validation Layers Panel */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider">Five Layer Ground Validator</h3>
                      <p className="text-[10px] font-bold text-slate-400 italic">Audit indicators & remedial guidance recommendations</p>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-700 font-medium">
                      {/* Layer 1 */}
                      <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-slate-50/50">
                        <div 
                          onClick={() => toggleLayerExpanded('layer1')}
                          className="p-3 bg-white hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <span className="font-mono text-[10px] text-slate-400">01</span>
                            <span>Layer 1: Structural Completeness & Range Rules</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              selectedResponse.validation.layer1_rule.status === 'pass' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800 font-black animate-pulse'
                            }`}>
                              {selectedResponse.validation.layer1_rule.status}
                            </span>
                            {expandedLayers.layer1 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {expandedLayers.layer1 && (
                          <div className="p-3 bg-slate-100/50 border-t border-slate-150 text-[11px] leading-relaxed text-slate-600">
                            <p className="font-semibold text-slate-700">Verbatim audit statement:</p>
                            <p className="italic font-sans mt-0.5 font-medium">"{selectedResponse.validation.layer1_rule.reason}"</p>
                            <p className="text-[10px] text-indigo-700 mt-2 font-bold uppercase tracking-wider">Remedial Action: Clear as verified if values match baseline records.</p>
                          </div>
                        )}
                      </div>

                      {/* Layer 2 */}
                      <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-slate-50/50">
                        <div 
                          onClick={() => toggleLayerExpanded('layer2')}
                          className="p-3 bg-white hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <span className="font-mono text-[10px] text-slate-400">02</span>
                            <span>Layer 2: Local Government Directory (LGD) Bounds</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              selectedResponse.validation.layer2_govt.status === 'pass' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800 animate-pulse'
                            }`}>
                              {selectedResponse.validation.layer2_govt.status}
                            </span>
                            {expandedLayers.layer2 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {expandedLayers.layer2 && (
                          <div className="p-3 bg-slate-100/50 border-t border-slate-150 text-[11px] leading-relaxed text-slate-600">
                            <p className="font-semibold text-slate-700">Verbatim audit statement:</p>
                            <p className="italic font-sans mt-0.5 font-medium">"{selectedResponse.validation.layer2_govt.reason}"</p>
                            <p className="text-[10px] text-indigo-700 mt-2 font-bold uppercase tracking-wider">Remedial Action: Confirm device matches standard geographical region bounds.</p>
                          </div>
                        )}
                      </div>

                      {/* Layer 3 */}
                      <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-slate-50/50">
                        <div 
                          onClick={() => toggleLayerExpanded('layer3')}
                          className="p-3 bg-white hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <span className="font-mono text-[10px] text-slate-400">03</span>
                            <span>Layer 3: Bayesian Strata Prior Anomaly</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              selectedResponse.validation.layer3_bayesian.status === 'pass' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800 animate-pulse'
                            }`}>
                              {selectedResponse.validation.layer3_bayesian.status}
                            </span>
                            {expandedLayers.layer3 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {expandedLayers.layer3 && (
                          <div className="p-3 bg-slate-100/50 border-t border-slate-150 text-[11px] leading-relaxed text-slate-600 font-medium">
                            <p className="font-semibold text-slate-700">Verbatim audit statement:</p>
                            <p className="italic font-sans mt-0.5 font-semibold text-slate-600">"{selectedResponse.validation.layer3_bayesian.reason}"</p>
                            <p className="text-[10px] text-amber-700 mt-2 font-bold uppercase tracking-wider">Remedial Action: Inspect underlying strata income statistics for outlier trends.</p>
                          </div>
                        )}
                      </div>

                      {/* Layer 4 */}
                      <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-slate-50/50">
                        <div 
                          onClick={() => toggleLayerExpanded('layer4')}
                          className="p-3 bg-white hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <span className="font-mono text-[10px] text-slate-400">04</span>
                            <span>Layer 4: Paradata Pacing & Timing Telemetry</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              selectedResponse.validation.layer4_behavior.status === 'pass' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800 animate-pulse'
                            }`}>
                              {selectedResponse.validation.layer4_behavior.status}
                            </span>
                            {expandedLayers.layer4 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {expandedLayers.layer4 && (
                          <div className="p-3 bg-slate-100/50 border-t border-slate-150 text-[11px] leading-relaxed text-slate-600">
                            <p className="font-semibold text-slate-700">Verbatim audit statement:</p>
                            <p className="italic font-sans mt-0.5 text-slate-600">"{selectedResponse.validation.layer4_behavior.reason}"</p>
                            <p className="text-[10px] text-indigo-700 mt-2 font-bold uppercase tracking-wider">Remedial Action: Verify speeding and mechanical click behavior records.</p>
                          </div>
                        )}
                      </div>

                      {/* Layer 5 */}
                      <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-slate-50/50">
                        <div 
                          onClick={() => toggleLayerExpanded('layer5')}
                          className="p-3 bg-white hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            <span className="font-mono text-[10px] text-slate-400">05</span>
                            <span>Layer 5: Cross-Field Logical Contradictions</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              selectedResponse.validation.layer5_cross.status === 'pass' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800 animate-pulse'
                            }`}>
                              {selectedResponse.validation.layer5_cross.status}
                            </span>
                            {expandedLayers.layer5 ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {expandedLayers.layer5 && (
                          <div className="p-3 bg-slate-100/50 border-t border-slate-150 text-[11px] leading-relaxed text-slate-600">
                            <p className="font-semibold text-slate-700">Verbatim audit statement:</p>
                            <p className="italic font-sans mt-0.5 text-slate-605">"{selectedResponse.validation.layer5_cross.reason}"</p>
                            <p className="text-[10px] text-[indigo-700] mt-2 font-bold uppercase tracking-wider">Remedial Action: Inspect and escalate if logical contradictions do not permit resolution.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Trust and Confidence Breakdown panel */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700 font-medium">
                    <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl flex items-center gap-4">
                      <ConfidenceGauge score={selectedResponse.confidenceScore} />
                      <div className="space-y-1">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Weighted Quality Index</h4>
                        <p className="text-[11px] leading-relaxed text-slate-500 font-semibold">Calculated through complete physical metadata checkpoints.</p>
                        <button
                          onClick={() => setIsTrustExplainOpen(true)}
                          className="text-[10.5px] text-indigo-700 font-black hover:underline flex items-center gap-1 mt-1.5"
                        >
                          <Info className="w-3.5 h-3.5" />
                          View (Why) breakdown
                        </button>
                      </div>
                    </div>

                    {/* Stated answers list highlight */}
                    <div className="bg-slate-50 border border-slate-200/85 p-4 rounded-2xl space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Answering highlights</h4>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                          <span className="text-slate-400 font-bold">Q_OCCUPATION</span>
                          <span className="text-slate-800 font-black">{selectedResponse.answers['Q_OCCUPATION'] || 'Unemployed'}</span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-slate-400 font-bold">Q_INCOME</span>
                          <span className="text-slate-805 font-black">₹{(selectedResponse.answers['Q_INCOME'] || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Answers with details and overrides */}
                  <div className="space-y-2.5">
                    <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider">Detailed Survey Response Inputs</h3>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 font-semibold text-xs text-slate-700">
                      {Object.entries(selectedResponse.answers).map(([key, val]) => {
                        const isIncomeTrigger = key === 'Q_INCOME' && selectedResponse.answers.Q_OCCUPATION === 'Unemployed' && selectedResponse.answers.Q_INCOME >= 100000;
                        const isOverridden = key === 'Q_NAME'; // Lakshmi override mock

                        return (
                          <div key={key} className="flex justify-between items-start border-b border-slate-200 pb-2 flex-wrap gap-2">
                            <div className="space-y-0.5">
                              <span className="font-mono text-[10px] text-slate-400 font-bold">{key}</span>
                              <span className="text-slate-900 block font-medium">{key === 'Q_INCOME' ? 'Income' : key === 'Q_OCCUPATION' ? 'Occupation' : 'Respondent Name'}</span>
                            </div>

                            <div className="text-right space-y-1">
                              <span className="font-bold text-slate-800 block text-right font-mono">{String(val)}</span>
                              
                              {isIncomeTrigger && (
                                <span className="inline-block bg-rose-100 text-rose-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider ml-2 shadow-sm animate-pulse">
                                  [Cross-field conflict: Income exceeds Unemployed threshold]
                                </span>
                              )}

                              {isOverridden && (
                                <span className="inline-block bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ml-2 shadow-sm">
                                  Original Prepopulated: Sunil K. &rarr; Overridden: Lakshmi R.
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paradata panel visualizer */}
                  <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paradata Timing telemetry traces</h4>
                      <span className="text-[10px] text-indigo-700 font-bold font-mono">Corrections: {selectedResponse.paradata.corrections} re-keys</span>
                    </div>

                    {/* Per-question timing bar vs median reference line in Recharts */}
                    <div className="h-40 w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart 
                          data={Object.entries(selectedResponse.paradata.timePerQuestion).map(([qKey, ms]) => ({
                            name: qKey,
                            Seconds: Math.round((Number(ms) || 0) / 1000),
                            MedianLimit: 12
                          }))}
                          margin={{ top: 10, right: 10, left: -30, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                          <YAxis style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                          <Tooltip contentStyle={{ fontSize: 10, borderRadius: '6px' }} />
                          <Bar dataKey="Seconds" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={30}>
                            {Object.entries(selectedResponse.paradata.timePerQuestion).map((entry, index) => {
                              const isSpeed = Math.round((Number(entry[1]) || 0) / 1000) < 5;
                              return <Cell key={`cell-${index}`} fill={isSpeed ? '#f43f5e' : '#4f46e5'} />;
                            })}
                          </Bar>
                          <Line type="monotone" dataKey="MedianLimit" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Evidence attachments thumbnail lightboxes */}
                  <div className="space-y-2.5">
                    <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider">Ground Audit Evidence Attachments</h3>
                    <div className="grid grid-cols-2 gap-4">
                      
                      {/* Photo evidence placeholder */}
                      <div 
                        onClick={() => setLightboxMedia({
                          type: 'photo',
                          src: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=600',
                          caption: 'Respondent Residential physical geolocation metadata bounds check verification'
                        })}
                        className="bg-slate-50 border border-slate-205 hover:border-slate-350 shadow-sm p-3 rounded-xl cursor-pointer flex items-center gap-3 active:scale-95 transition-all text-xs"
                      >
                        <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700">
                          <Camera className="w-4 h-4" />
                        </div>
                        <div className="text-left font-semibold">
                          <span className="block text-slate-850 font-bold">Photo Verification Check</span>
                          <span className="text-[10px] text-slate-450 font-mono">JPG (342 KB) geotagged</span>
                        </div>
                      </div>

                      {/* Audio verification statement */}
                      <div 
                        onClick={() => setLightboxMedia({
                          type: 'audio',
                          src: '',
                          caption: 'Consent and identity verification recording. Sample duration: 15 seconds.'
                        })}
                        className="bg-slate-50 border border-slate-205 hover:border-slate-350 shadow-sm p-3 rounded-xl cursor-pointer flex items-center gap-3 active:scale-95 transition-all text-xs"
                      >
                        <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700">
                          <Volume2 className="w-4 h-4 animate-ping" />
                        </div>
                        <div className="text-left font-semibold">
                          <span className="block text-slate-850 font-bold">Structured Voice Audit</span>
                          <span className="text-[10px] text-slate-450 font-mono">WAV (1.4MB) decibels bounds</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Supervisor Action sticky footer bar */}
                <div className="bg-slate-50 border-t border-slate-250 p-4 flex justify-end gap-3 rounded-b-2xl sticky bottom-0 z-10 shadow-md">
                  <button
                    onClick={() => setActionModal({ isOpen: true, type: 'Approve', responseId: selectedResponse.id })}
                    className="px-4 py-2 border-2 border-emerald-600 font-bold text-emerald-800 hover:bg-emerald-700 hover:text-white rounded-xl text-xs flex items-center gap-1.5 transition-all duration-150 shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve Code clearance
                  </button>
                  <button
                    onClick={() => setActionModal({ isOpen: true, type: 'Re-Interview', responseId: selectedResponse.id })}
                    className="px-4 py-2 border-2 border-rose-600 font-bold text-rose-800 hover:bg-rose-700 hover:text-white rounded-xl text-xs flex items-center gap-1.5 transition-all duration-150 shadow-sm"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Send for re-interview
                  </button>
                  <button
                    onClick={() => setActionModal({ isOpen: true, type: 'Escalate', responseId: selectedResponse.id })}
                    className="px-4 py-2 border-2 border-slate-400 font-bold text-slate-700 hover:bg-slate-500 hover:text-white rounded-xl text-xs transition-colors duration-150 shadow-sm"
                  >
                    Escalate to HQ
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-20 text-center text-slate-400 italic text-xs h-full flex items-center justify-center">
                Select an inspection incident return for granular trace analyses.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 8.3: CODING REVIEW QUEUE */}
      {/* ======================================= */}
      {activeTab === 'coding' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-6 text-left" id="coding-review-wrapper">
          
          {/* Header controls inside queue */}
          <div className="pb-3 border-b border-slate-100 flex justify-between items-center flex-wrap gap-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-sky-600" />
                Auto-Coding Classification Auditing
              </h2>
              <p className="text-[11px] text-slate-550 mt-0.5">Approve or adjust free-text industrial classifications using standard NCO/NIC taxonomies.</p>
            </div>

            {/* Bulk approve for high confidence items */}
            <div className="flex gap-2">
              <button
                onClick={handleBulkApproveCodes}
                className="px-4 py-2 bg-sky-950 font-extrabold hover:bg-slate-900 shadow text-white text-xs rounded-xl flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Bulk approve high accuracy (\u226590%)
              </button>
              
              <span className="bg-sky-50 text-sky-850 hover:bg-sky-100 border border-sky-200 rounded-xl px-3 py-1.5 text-[10.5px] font-black inline-flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-4 h-4 text-sky-600 animate-pulse" />
                Suggestions powered by MoSPI NIC semantic search lookup
              </span>
            </div>
          </div>

          <div className="overflow-x-auto text-xs font-semibold">
            <table className="w-full text-left" role="presentation">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] tracking-wider border-b border-slate-150">
                <tr>
                  <th className="px-4 py-3">Verbatim free-text entry</th>
                  <th className="px-4 py-3">Suggested Code</th>
                  <th className="px-4 py-3">MoSPI Taxonomic label</th>
                  <th className="px-4 py-3 text-center">Matching confidence</th>
                  <th className="px-4 py-3 text-center">System validation source</th>
                  <th className="px-4 py-3 text-right">Audit resolutions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-650 leading-relaxed">
                {responses.map((resp) => {
                  return Object.entries(resp.codedAnswers).map(([qKey, codeDetailVal]: [string, any]) => {
                    const lowConfidence = codeDetailVal.confidence < 70;
                    
                    return (
                      <tr 
                        key={resp.id + qKey} 
                        className={`hover:bg-slate-50/50 transition-colors ${
                          lowConfidence ? 'bg-amber-50/40 border-l-4 border-amber-400' : ''
                        }`}
                      >
                        <td className="px-4 py-4 text-slate-900 font-bold">
                          <span className="font-serif italic text-indigo-700 bg-indigo-50/50 border border-indigo-100 px-2 py-1 rounded max-w-xs block">
                            "{resp.answers[qKey] || 'None'}"
                          </span>
                          <span className="block font-mono text-[9px] text-slate-400 font-bold mt-1">Respondent ID: #{resp.id} • {resp.surveyName}</span>
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-slate-900">
                          <span className="bg-slate-100 py-1 px-2 border border-slate-200 rounded">
                            NCO {codeDetailVal.code}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-800 max-w-xs leading-normal">
                          <ReasonPopover reason={codeDetailVal.reason}>
                            <span className="font-bold underline decoration-dotted decoration-sky-500 cursor-help block">
                              {codeDetailVal.label}
                            </span>
                          </ReasonPopover>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {/* Matching confidence bar */}
                          <div className="flex flex-col items-center gap-1 min-w-[90px]">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black ${
                              codeDetailVal.confidence >= 80 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                            }`}>
                              {codeDetailVal.confidence}% match
                            </span>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${codeDetailVal.confidence >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                style={{ width: `${codeDetailVal.confidence}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {/* Source badge toggle checks */}
                          {codeDetailVal.confidence >= 80 ? (
                            <span className="inline-flex items-center gap-1 text-[9px] py-0.5 px-2 font-black rounded-full bg-sky-50 border border-sky-100 text-sky-800">
                              MoSPI NIC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] py-0.5 px-2 font-black rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                              Local
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                api.updateResponseCoding(resp.id, qKey, codeDetailVal.code, codeDetailVal.label);
                                triggerToast(`Verified and approved ${codeDetailVal.code} classification allocation.`);
                                loadDPDData();
                              }}
                              className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 font-extrabold flex items-center gap-1 shadow-sm"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve suggestion
                            </button>
                            <button
                              onClick={() => {
                                setCodePickerTarget({ responseId: resp.id, questionId: qKey });
                                setIsCodePickerOpen(true);
                              }}
                              className="px-3 py-1.5 border border-indigo-200 text-indigo-700 hover:bg-slate-50 font-bold rounded-lg"
                            >
                              Manually Change Code
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>

          <div className="text-center text-[10px] text-slate-400 py-2 border-t border-slate-100 font-bold uppercase tracking-wider">
            Recommendations generated through structural MoSPI semantic classification registries.
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 8.4: EXCEPTIONS AND DATA QUALITY */}
      {/* ======================================= */}
      {activeTab === 'exceptions' && (
        <div className="space-y-6 text-left">
          
          {/* Header information banner */}
          <div className="bg-white border-2 border-indigo-150 p-5 rounded-2xl shadow-sm">
            <h2 className="text-sm font-black text-slate-900 uppercase">National Data Quality Exception Analysis & Health Metrics</h2>
            <p className="text-[11px] text-slate-550 mt-1">Cross-check outstanding anomalies, review validation distribution profiles, and structural tables.</p>
          </div>

          {/* Master layout split exception cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left 40%: Exceptions queue */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-indigo-50">
                <h3 className="font-extrabold text-xs text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
                  Prioritized Outlier Exceptions
                </h3>
                <span className="text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-100 rounded-full px-2 py-0.5">
                  {countExceptions} urgent alert items
                </span>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {responses
                  .filter(r => r.validation.layer5_cross.status === 'fail' || r.validation.layer3_bayesian.status === 'fail')
                  .map(r => (
                    <div 
                      key={r.id}
                      onClick={() => {
                        setSelectedResponseId(r.id);
                        setActiveTab('flag_review');
                      }}
                      className="p-3 bg-rose-50/50 hover:bg-rose-50/80 cursor-pointer border border-rose-200 rounded-xl space-y-1.5 text-xs font-semibold"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-slate-800 block">#{r.id} ({r.householdId})</span>
                        <TrustBadge score={r.confidenceScore} band={r.trustBand} isColorBlind={isColorBlind} />
                      </div>
                      <p className="text-rose-900 text-[11px] leading-relaxed font-sans font-medium">
                        FAIL Layers check: {r.validation.layer5_cross.status === 'fail' ? 'Cross-field conflict' : 'Bayesian Strata outlier anomalies'}
                      </p>
                      <span className="block text-[10px] text-rose-400 font-bold uppercase tracking-wider text-right hover:underline">
                        Investigate drilldown &rarr;
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Right 80%: Detailed charts dashboards */}
            <div className="lg:col-span-8 bg-white border border-slate-205 rounded-2xl p-5 shadow-sm space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Confidence Histogram */}
                <div className="space-y-3">
                  <span className="text-[10.5px] font-black text-slate-400 uppercase tracking-widest block">Response Quality rating Histogram</span>
                  <div className="h-44 w-full bg-slate-50/50 p-2 rounded-xl border border-slate-110">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[
                          { range: '0-20', count: 0 },
                          { range: '21-40', count: 1 },
                          { range: '41-60', count: 2 },
                          { range: '61-80', count: 0 },
                          { range: '81-100', count: 3 }
                        ]}
                        margin={{ top: 10, right: 10, left: -30, bottom: 0 }}
                      >
                        <XAxis dataKey="range" style={{ fontSize: 9, fill: '#64748b' }} />
                        <YAxis style={{ fontSize: 9, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ fontSize: 9 }} />
                        <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Flag-rate by enumerator */}
                <div className="space-y-3">
                  <span className="text-[10.5px] font-black text-slate-400 uppercase tracking-widest block">Quality Flag-rate by Surveyor</span>
                  <div className="h-44 w-full bg-slate-50/50 p-2 rounded-xl border border-slate-110">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        layout="vertical"
                        data={[
                          { name: 'Karthik S.', rates: 75, fill: '#ef4444' },
                          { name: 'Lakshmi R.', rates: 5, fill: '#10b981' },
                          { name: 'Ravi K.', rates: 20, fill: '#f59e0b' }
                        ]}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <XAxis type="number" style={{ fontSize: 9 }} />
                        <YAxis dataKey="name" type="category" style={{ fontSize: 9, fill: '#475569', fontWeight: 'bold' }} width={70} />
                        <Tooltip contentStyle={{ fontSize: 9 }} />
                        <Bar dataKey="rates" fill="#1e3a8a" radius={[0, 4, 4, 0]}>
                          <Cell fill="#ef4444" />
                          <Cell fill="#10b981" />
                          <Cell fill="#f59e0b" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Rule-failure matrix heat Map */}
              <div className="space-y-3 pt-2">
                <span className="text-[10.5px] font-black text-slate-400 uppercase tracking-widest block">Answering Validation Rule Failure Heat matrix</span>
                <div className="border border-slate-205 rounded-xl overflow-hidden shadow-inner">
                  <div className="grid grid-cols-6 bg-slate-50 hover:bg-slate-100 font-black text-[9px] text-slate-500 text-center uppercase tracking-wider py-2.5 border-b border-slate-200">
                    <div className="text-left pl-3">Field code</div>
                    <div>L1: Structural</div>
                    <div>L2: Geographic</div>
                    <div>L3: Bayesian</div>
                    <div>L4: Pacing</div>
                    <div>L5: Logical</div>
                  </div>

                  <div className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700 text-center font-bold">
                    {[
                      { code: 'Q_INCOME', l1: '✓', l2: '✓', l3: 'High', l4: '✓', l5: 'High' },
                      { code: 'Q_OCCUPATION', l1: '✓', l2: '✓', l3: '✓', l4: '✓', l5: '✓' },
                      { code: 'Q_AGE', l1: '✓', l2: '✓', l3: '✓', l4: '✓', l5: '✓' },
                      { code: 'Q_MOBILE', l1: '✓', l2: '✓', l3: '✓', l4: '✓', l5: '✓' }
                    ].map((row, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-6 py-3 hover:bg-slate-100/50 items-center">
                        <div className="text-left font-bold pl-3 text-slate-500 font-sans">{row.code}</div>
                        <div className="bg-emerald-50 text-emerald-800 text-[10px] py-1 rounded mx-1">{row.l1}</div>
                        <div className="bg-emerald-50 text-emerald-800 text-[10px] py-1 rounded mx-1">{row.l2}</div>
                        <div className={`text-[10px] py-1 rounded mx-1 ${row.l3 === 'High' ? 'bg-rose-50 text-rose-800 animate-pulse font-black' : 'bg-emerald-50 text-emerald-800'}`}>{row.l3}</div>
                        <div className="bg-emerald-50 text-emerald-800 text-[10px] py-1 rounded mx-1">{row.l4}</div>
                        <div className={`text-[10px] py-1 rounded mx-1 ${row.l5 === 'High' ? 'bg-rose-50 text-rose-800 animate-pulse font-black' : 'bg-emerald-50 text-emerald-800'}`}>{row.l5}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* NMDS Quality Export Buttons */}
              <div className="flex border-t border-slate-150 pt-4 justify-end gap-3 font-bold text-xs">
                <button
                  onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + "Response_ID,Enumerator,Validation_L1,Validation_L2,Validation_L3,Validation_L4,Validation_L5,Confidence_Quality_Score\n"
                      + "resp_1,Lakshmi R.,pass,pass,pass,pass,pass,94\n"
                      + "resp_2,Karthik S.,pass,pass,fail,fail,fail,46\n";
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "satark_national_quality_metadata_report.csv");
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    triggerToast('Quality audit NMDS-compliant CSV logs extracted and downloaded successfully!');
                  }}
                  className="px-4 py-2 bg-indigo-950 font-extrabold text-white rounded-xl shadow-md flex items-center gap-1.5 hover:bg-indigo-900 transition-colors"
                >
                  <FileText className="w-4 h-4" /> Download National SQAF Metadata logs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DIALOG: (WHY) TRUST EXPLAINABILITY MODAL */}
      {/* ======================================= */}
      {isTrustExplainOpen && selectedResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsTrustExplainOpen(false)} />
          
          <div className="relative bg-white rounded-2xl max-w-lg w-full p-6 text-left shadow-2xl border border-slate-205 animate-slideUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase">Audit Trust Formula decomposition</h3>
              <button 
                onClick={() => setIsTrustExplainOpen(false)}
                className="p-1 px-2 text-slate-400 hover:text-slate-900 rounded font-black text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs font-semibold text-slate-700">
              <p className="leading-relaxed">
                The **SATARK quality score** evaluates surveyor paradata and data compliance on a 4-component weighted formula strictly:
              </p>

              {/* Mathematical display boxes */}
              <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl space-y-2 font-mono text-[10.5px]">
                <p className="text-indigo-950 font-black">Weighted Confidence calculation formula:</p>
                <p className="bg-indigo-50 p-2.5 rounded text-indigo-900 text-[10px] font-black border border-indigo-150">
                  Confidence = (0.40 &times; Validation) + (0.30 &times; Fraud_Score) + (0.15 &times; Evidence) + (0.15 &times; Behaviour)
                </p>
              </div>

              {/* Sliders breakdown values */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>1. Validation Checkpoints (0.40 weight)</span>
                    <span>100% (Pass rate: 5/5)</span>
                  </div>
                  <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>2. Anti-fraud Completion timers (0.30 weight)</span>
                    <span>{selectedResponse.trustBand === 'Red' ? '60%' : '100%'}</span>
                  </div>
                  <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                    <div className={`h-full ${selectedResponse.trustBand === 'Red' ? 'bg-rose-500' : 'bg-emerald-500'} rounded-full`} style={{ width: selectedResponse.trustBand === 'Red' ? '60%' : '100%' }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>3. Geotag / Evidence Proof Completeness (0.15 weight)</span>
                    <span>100% (JPG metadata matched)</span>
                  </div>
                  <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>4. Engagement fatigue metrics (0.15 weight)</span>
                    <span>{selectedResponse.behaviorScores.quality}%</span>
                  </div>
                  <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: `${selectedResponse.behaviorScores.quality}%` }} />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-150 pt-3 text-slate-500 italic text-[11px]">
                Target Confidence of response #{selectedResponse.id} yields **{selectedResponse.confidenceScore}%** total index.
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-150">
              <button 
                onClick={() => setIsTrustExplainOpen(false)}
                className="py-1.5 px-4 bg-indigo-950 hover:bg-slate-900 border text-white text-xs font-bold rounded-lg"
              >
                Clear explanation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DIALOG: TAXONOMIC CODE PICKER POPUP */}
      {/* ======================================= */}
      {isCodePickerOpen && codePickerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="relative bg-white rounded-2xl max-w-xl w-full p-6 text-left shadow-2xl border border-slate-205 flex flex-col justify-between h-[520px] animate-slideUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase">National NCO/NIC Classification Picker</h3>
              <button 
                onClick={() => setIsCodePickerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-900 font-black"
                aria-label="Close taxonomy picker dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live picker search input */}
            <div className="py-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter taxonomies by keywords or official registry code digits..."
                  value={taxonSearchTerm}
                  onChange={e => setTaxonSearchTerm(e.target.value.toLowerCase())}
                  className="w-full text-xs p-2 pl-9 border border-slate-200 rounded-xl bg-slate-50 focus:outline-indigo-500 font-semibold"
                />
              </div>
            </div>

            {/* Cascading Taxonomy Tree */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin text-xs text-slate-700">
              {TAXONOMY_TREE.filter(node => searchTaxonNode(node, taxonSearchTerm)).map(major => (
                <div key={major.code} className="space-y-2">
                  <div className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg flex justify-between items-center font-bold">
                    <span>{major.name}</span>
                  </div>

                  {major.children && major.children.map(submajor => (
                    <div key={submajor.code} className="pl-4 space-y-2">
                      <p className="text-[11px] font-bold text-slate-500">{submajor.name}</p>

                      {submajor.children && submajor.children.map(unitGroup => {
                        const isMatchWord = unitGroup.name.toLowerCase().includes(taxonSearchTerm) || unitGroup.code.includes(taxonSearchTerm);
                        if (taxonSearchTerm && !isMatchWord) return null;

                        return (
                          <div 
                            key={unitGroup.code}
                            onClick={() => applyTaxonCode(unitGroup.code, unitGroup.name.split(' Unit ')[1] || unitGroup.name)}
                            className="pl-4 p-3 hover:bg-indigo-50 cursor-pointer border border-slate-100 rounded-xl hover:border-indigo-300 transition-all space-y-1 relative group"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-extrabold text-indigo-950 font-mono text-[11px]">NCO Group: {unitGroup.code}</span>
                              <span className="text-[9px] text-indigo-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Select Code &rarr;</span>
                            </div>
                            <p className="font-extrabold text-slate-800 text-[11px]">{unitGroup.name}</p>
                            
                            {unitGroup.inclusions && (
                              <p className="text-[10px] text-slate-500 leading-normal font-sans"><span className="text-slate-400 font-bold">Inclusions:</span> {unitGroup.inclusions}</p>
                            )}
                            {unitGroup.exclusions && (
                              <p className="text-[10px] text-slate-500 leading-normal font-sans"><span className="text-slate-400 font-bold">Exclusions:</span> {unitGroup.exclusions}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button 
                onClick={() => setIsCodePickerOpen(false)}
                className="py-1.5 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg"
              >
                Close classifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DIALOG: SUPERVISOR DECISION NOTES MODAL */}
      {/* ======================================= */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="relative bg-white rounded-2xl max-w-md w-full p-6 text-left shadow-2xl border border-slate-205 animate-slideUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="font-black text-sm text-slate-900 uppercase">Supervisor Audit clearance checklist</h3>
              <button 
                onClick={() => setActionModal(null)}
                className="p-1 px-2 text-slate-400 hover:text-slate-900 font-black text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs font-semibold text-slate-700">
              <p className="leading-relaxed">
                Clearance action: <strong className="text-indigo-900 uppercase">{actionModal.type}</strong> for response record <strong className="font-mono">#{actionModal.responseId}</strong>.
              </p>

              {/* Mandatory reasons checks */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-500">Provide required verification audit notes justifications:</label>
                <textarea
                  required
                  placeholder="Verbatim explanations logs (e.g. Household verified manually, GPS tolerances acceptable, etc.)"
                  value={supervisorNote}
                  onChange={e => setSupervisorNote(e.target.value)}
                  className="w-full h-24 p-2.5 border border-slate-200 rounded-xl focus:outline-indigo-500 bg-slate-50 text-[11px] font-medium"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-lg text-amber-900 border border-amber-200 text-[10px] leading-relaxed">
                * Note: Approved returns are released directly to the national publication database. This action is irreversible.
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setActionModal(null)}
                className="py-2 px-4 border border-slate-300 hover:bg-slate-50 font-bold text-slate-700 text-xs rounded-xl"
              >
                Go Back
              </button>
              <button 
                onClick={submitSupervisorAction}
                disabled={!supervisorNote.trim()}
                className="py-2 px-4 bg-indigo-950 disabled:opacity-40 hover:bg-slate-900 font-extrabold text-white text-xs rounded-xl shadow-md"
              >
                Confirm Verification audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DIALOG: PHOTO OR WAV AUDIO LIGHTBOX */}
      {/* ======================================= */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setLightboxMedia(null)} />
          
          <div className="relative max-w-xl w-full text-center space-y-4 animate-slideDown z-10 p-4">
            <button 
              onClick={() => setLightboxMedia(null)}
              className="absolute -top-12 right-0 p-2 bg-white/20 hover:bg-white text-white hover:text-slate-900 rounded-xl shadow-xl font-black text-xs flex items-center gap-1 transition-all"
            >
              <X className="w-4 h-4" /> Close Viewer
            </button>

            {lightboxMedia.type === 'photo' ? (
              <img 
                src={lightboxMedia.src} 
                alt="Audit visual"
                className="mx-auto rounded-2xl max-h-[440px] w-auto border-4 border-white/10 shadow-2xl" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="bg-slate-900/90 border border-slate-800 p-8 rounded-2xl text-white space-y-4 shadow-2xl max-w-md mx-auto">
                <Volume2 className="w-12 h-12 text-indigo-500 animate-pulse mx-auto" strokeWidth={1} />
                <span className="block text-sm font-extrabold">Audio Ground Trace playback</span>
                <div className="h-6 w-full bg-slate-850 rounded-full flex overflow-hidden items-center p-1 border border-slate-800">
                  <div className="h-full bg-indigo-500 animate-pulse rounded-full w-[65%]" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-450 font-mono">
                  <span>0:04</span>
                  <span>0:15 sec</span>
                </div>
              </div>
            )}

            <p className="text-white font-semibold text-xs leading-relaxed max-w-md mx-auto">
              {lightboxMedia.caption}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
