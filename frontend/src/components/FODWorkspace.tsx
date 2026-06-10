/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api, db } from '../api';
import { Enumerator, Survey, SurveyResponse } from '../types';
import { translations } from '../i18n';
import { TrustBadge, ReasonPopover } from './TrustComponents';
import { 
  Users, 
  User, 
  ArrowUpRight, 
  Search, 
  Send, 
  AlertTriangle, 
  CheckCircle, 
  Smartphone, 
  Calendar, 
  MapPin, 
  Layers, 
  Grid, 
  CheckSquare, 
  Map, 
  ClipboardList, 
  FileSpreadsheet, 
  ChevronRight, 
  Info,
  Clock,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Trash2,
  Play,
  Pause,
  AlertCircle
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { LeafletMap } from './LeafletMap';

interface FODWorkspaceProps {
  lang: 'en' | 'hi' | 'ta';
  isColorBlind: boolean;
}

interface FODAssignment {
  id: string;
  surveyId: string;
  surveyName: string;
  region: string;
  hhId: string;
  enumeratorId: string;
  enumeratorName: string;
  status: 'assigned' | 'in_progress' | 'submitted' | 'accepted' | 're_interview';
  startingDate: string;
  dueDate: string;
  trustScore?: number;
  timestamp: string;
}

export const FODWorkspace: React.FC<FODWorkspaceProps> = ({ lang, isColorBlind }) => {
  const t = translations[lang];

  // FOD Sub-navigation Tabs: 'dashboard' | 'enumerators' | 'assignments' | 'monitor' | 'inspections'
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'enumerators' | 'assignments' | 'monitor' | 'inspections'>('dashboard');

  // Shared Core States
  const [enumerators, setEnumerators] = useState<Enumerator[]>([]);
  const [selectedEnumId, setSelectedEnumId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageText, setMessageText] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [flaggedResponses, setFlaggedResponses] = useState<SurveyResponse[]>([]);

  // Persistent FOD Assignments array
  const [assignments, setAssignments] = useState<FODAssignment[]>([]);

  // Wizard (Assignments Step 1/2/3) States
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');
  
  // Wizards Step 2 Selectors
  const [geoState, setGeoState] = useState('Tamil Nadu');
  const [geoDistrict, setGeoDistrict] = useState('Chennai');
  const [geoBlock, setGeoBlock] = useState('Block-A');
  const [geoVillage, setGeoVillage] = useState('Village-X');
  const [directInputTab, setDirectInputTab] = useState<'cascading' | 'lgd' | 'pin' | 'nic'>('cascading');
  const [lgdCode, setLgdCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [nicSector, setNicSector] = useState('Agriculture');

  // Household list for selected village
  const householdPool = [
    { id: 'HH-TN-0042', summary: 'Arun Kumar, Age 34 · Farmer', priorVisits: 1, lat: 13.0827, lng: 80.2707 },
    { id: 'HH-TN-0043', summary: 'Suresh M, Age 45 · Auto-Rickshaw', priorVisits: 0, lat: 13.0890, lng: 80.2780 },
    { id: 'HH-TN-0044', summary: 'Meena R, Age 29 · Tailoring', priorVisits: 2, lat: 13.0760, lng: 80.2640 },
    { id: 'HH-TN-0045', summary: 'Vijay K, Age 52 · Shopkeeper', priorVisits: 1, lat: 13.0910, lng: 80.2820 },
    { id: 'HH-TN-0046', summary: 'Geetha S, Age 38 · Homemaker', priorVisits: 0, lat: 13.0801, lng: 80.2590 },
    { id: 'HH-TN-0047', summary: 'Kavin P, Age 61 · Retired', priorVisits: 3, lat: 13.0850, lng: 80.2730 }
  ];
  const [selectedHouseholds, setSelectedHouseholds] = useState<string[]>(['HH-TN-0042', 'HH-TN-0043']);

  // Wizard Step 3 Enumerators deployment states
  const [assignedEnumeratorIds, setAssignedEnumeratorIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('2026-06-10');
  const [dueDate, setDueDate] = useState('2026-06-25');
  const [isDeployConfirmOpen, setIsDeployConfirmOpen] = useState(false);

  // Board Monitor States
  const [selectedMonitorSurveyId, setSelectedMonitorSurveyId] = useState<string>('sur_plfs_2026');

  // Load basic state and persist elements
  useEffect(() => {
    loadEnumerators();
    loadSurveys();
    loadFODAssignments();
    loadFlaggedResponses();
  }, []);

  const loadEnumerators = async () => {
    const list = await api.getEnumerators();
    setEnumerators(list);
    if (list.length > 0 && !selectedEnumId) {
      setSelectedEnumId(list[0].id);
    }
  };

  const loadSurveys = async () => {
    const list = await api.getSurveys();
    setSurveys(list);
    if (list.length > 0) {
      setSelectedSurveyId(list[0].id);
    }
  };

  const loadFlaggedResponses = async () => {
    const list = await api.getResponses();
    const flagged = list.filter(r => r.trustBand === 'Red' || r.status === 'flagged');
    setFlaggedResponses(flagged);
  };

  const loadFODAssignments = () => {
    const stored = localStorage.getItem('satark_fod_assignments');
    if (stored) {
      setAssignments(JSON.parse(stored));
    } else {
      const initial: FODAssignment[] = [
        { id: 'asg_1', surveyId: 'sur_plfs_2026', surveyName: 'Periodic Labour Force Survey (PLFS-2026)', region: 'Tamil Nadu (Chennai Central)', hhId: 'HH-TN-0042', enumeratorId: 'enum_1', enumeratorName: 'Lakshmi R.', status: 'in_progress', startingDate: '2026-06-01', dueDate: '2026-06-15', trustScore: 92, timestamp: '2026-06-05T10:00:00Z' },
        { id: 'asg_2', surveyId: 'sur_plfs_2026', surveyName: 'Periodic Labour Force Survey (PLFS-2026)', region: 'Tamil Nadu (Chennai Central)', hhId: 'HH-TN-0043', enumeratorId: 'enum_1', enumeratorName: 'Lakshmi R.', status: 'submitted', startingDate: '2026-06-01', dueDate: '2026-06-15', trustScore: 94, timestamp: '2026-06-08T14:30:00Z' },
        { id: 'asg_3', surveyId: 'sur_plfs_2026', surveyName: 'Periodic Labour Force Survey (PLFS-2026)', region: 'Tamil Nadu (Chennai South)', hhId: 'HH-TN-0044', enumeratorId: 'enum_2', enumeratorName: 'Karthik S. (Suspect Profile)', status: 'assigned', startingDate: '2026-06-01', dueDate: '2026-06-15', trustScore: 46, timestamp: '2026-06-08T09:15:00Z' },
        { id: 'asg_4', surveyId: 'sur_plfs_2026', surveyName: 'Periodic Labour Force Survey (PLFS-2026)', region: 'Tamil Nadu (Chennai South)', hhId: 'HH-TN-0045', enumeratorId: 'enum_2', enumeratorName: 'Karthik S. (Suspect Profile)', status: 're_interview', startingDate: '2026-06-01', dueDate: '2026-06-15', trustScore: 35, timestamp: '2026-06-09T17:45:00Z' }
      ];
      setAssignments(initial);
      localStorage.setItem('satark_fod_assignments', JSON.stringify(initial));
    }
  };

  const saveFODAssignments = (updateList: FODAssignment[]) => {
    setAssignments(updateList);
    localStorage.setItem('satark_fod_assignments', JSON.stringify(updateList));
  };

  // Toast Dispatcher Helper
  const triggerToast = (text: string) => {
    setSuccessToast(text);
    setTimeout(() => setSuccessToast(''), 4500);
  };

  // Profile message alert dispatcher
  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedEnumId) return;
    const item = enumerators.find(e => e.id === selectedEnumId);
    triggerToast(`Alert dispatched to ${item?.name} via Bhashini mobile secure push-channel!`);
    setMessageText('');
  };

  const handleToggleHousehold = (id: string) => {
    if (selectedHouseholds.includes(id)) {
      setSelectedHouseholds(selectedHouseholds.filter(h => h !== id));
    } else {
      setSelectedHouseholds([...selectedHouseholds, id]);
    }
  };

  const handleToggleEnumeratorAssign = (id: string) => {
    if (assignedEnumeratorIds.includes(id)) {
      setAssignedEnumeratorIds(assignedEnumeratorIds.filter(e => e !== id));
    } else {
      setAssignedEnumeratorIds([...assignedEnumeratorIds, id]);
    }
  };

  const handleDeployWizardFinish = () => {
    if (selectedHouseholds.length === 0 || assignedEnumeratorIds.length === 0 || !selectedSurveyId) return;

    const chosenSurvey = surveys.find(s => s.id === selectedSurveyId);
    const surveyTextName = chosenSurvey ? chosenSurvey.name_en : 'Socio-Economic Survey 2026';
    
    // Spawn new assignments uniformly distributed
    const newItems: FODAssignment[] = [];
    selectedHouseholds.forEach((hh, index) => {
      // Rotate among selected enumerators
      const enumIndex = index % assignedEnumeratorIds.length;
      const enumId = assignedEnumeratorIds[enumIndex];
      const enumeratorItem = enumerators.find(e => e.id === enumId);

      newItems.push({
        id: `asg_gen_${Date.now()}_${index}`,
        surveyId: selectedSurveyId,
        surveyName: surveyTextName,
        region: `${geoState} (${geoDistrict} ${geoVillage})`,
        hhId: hh,
        enumeratorId: enumId,
        enumeratorName: enumeratorItem?.name || 'Assigned Surveyor',
        status: 'assigned',
        startingDate: startDate,
        dueDate: dueDate,
        timestamp: new Date().toISOString()
      });
    });

    const updated = [...newItems, ...assignments];
    saveFODAssignments(updated);
    setIsDeployConfirmOpen(false);
    triggerToast(`SUCCESS: ${newItems.length} Households assigned successfully balancing work-loads!`);
    
    // Refresh & reset wizard state
    setWizardStep(1);
    setSelectedHouseholds(['HH-TN-0042', 'HH-TN-0043']);
    setAssignedEnumeratorIds([]);
    setActiveSubTab('monitor');
  };

  const handleMonitorAction = (action: 'pause' | 'extend' | 'reassign', item: FODAssignment) => {
    if (action === 'pause') {
      const updated = assignments.map(a => a.id === item.id ? { ...a, status: 'assigned' as const } : a);
      saveFODAssignments(updated);
      triggerToast(`Assignment for ${item.hhId} paused.`);
    } else if (action === 'extend') {
      const updated = assignments.map(a => a.id === item.id ? { ...a, dueDate: '2026-07-15' } : a);
      saveFODAssignments(updated);
      triggerToast(`Extended deadline for ${item.hhId} to 2026-07-15.`);
    } else if (action === 'reassign') {
      const altEnum = enumerators.find(e => e.id !== item.enumeratorId) || enumerators[0];
      const updated = assignments.map(a => a.id === item.id ? { ...a, enumeratorId: altEnum.id, enumeratorName: altEnum.name, status: 'assigned' as const } : a);
      saveFODAssignments(updated);
      triggerToast(`Re-routed household ${item.hhId} queue from ${item.enumeratorName} to ${altEnum.name}.`);
    }
  };

  const handleMarkInspected = (id: string) => {
    setFlaggedResponses(prev => prev.filter(r => r.id !== id));
    triggerToast(`Inspection cleared for response ${id}. Audit record archived.`);
  };

  const handleReinterviewInspected = (id: string, response: SurveyResponse) => {
    setFlaggedResponses(prev => prev.filter(r => r.id !== id));

    // Spawn automatic re-interview assignment
    const reAsg: FODAssignment = {
      id: `asg_re_${Date.now()}`,
      surveyId: response.surveyId,
      surveyName: response.surveyName,
      region: 'Tamil Nadu (Re-interview check)',
      hhId: response.householdId,
      enumeratorId: response.enumeratorId,
      enumeratorName: response.enumeratorName,
      status: 're_interview',
      startingDate: new Date().toISOString().split('T')[0],
      dueDate: '2026-06-30',
      trustScore: response.confidenceScore,
      timestamp: new Date().toISOString()
    };
    saveFODAssignments([reAsg, ...assignments]);
    triggerToast(`Dispatched mandatory re-interview order for household ${response.householdId}!`);
  };

  // Sparkline mini SVG helper
  const renderSparkline = (data: number[]) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * 50;
      const range = max - min || 1;
      const y = 15 - ((val - min) / range) * 12;
      return `${x},${y}`;
    }).join(' ');

    const strokeColor = data[data.length - 1] >= 80 ? '#10b981' : data[data.length - 1] >= 50 ? '#f59e0b' : '#ef4444';

    return (
      <svg className="w-14 h-4 overflow-visible shrink-0" viewBox="0 0 50 15" aria-hidden="true">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          points={points}
        />
        <circle cx="50" cy={15 - ((data[data.length - 1] - min) / (max - min || 1)) * 12} r="2" fill={strokeColor} />
      </svg>
    );
  };

  const selectedEnum = enumerators.find(e => e.id === selectedEnumId);

  // Computations for FOD Dashboard metric values
  const totalActive = assignments.filter(a => a.status === 'assigned' || a.status === 'in_progress' || a.status === 're_interview').length;
  const enumsInField = enumerators.filter(e => e.assignedCount > 0).length;
  const submissionsToday = assignments.filter(a => a.status === 'submitted' || a.status === 'accepted').length;
  const flaggedToday = assignments.filter(a => a.status === 're_interview').length;

  return (
    <div className="space-y-6" id="fod-workspace-container">
      
      {/* Header Panel with Sub-navigation */}
      <header className="flex flex-col gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-700" />
              Field Operations Management
            </h1>
            <p className="text-xs text-slate-500 font-medium">Coordinate, assign bounds, monitor field trust performance indicators and audits</p>
          </div>

          <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl text-xs font-bold gap-1 self-stretch sm:self-auto">
            {(['dashboard', 'enumerators', 'assignments', 'monitor', 'inspections'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSubTab(tab)}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-center transition-colors uppercase text-[10px] tracking-wider ${
                  activeSubTab === tab 
                    ? 'bg-indigo-900 text-white shadow font-black' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab === 'dashboard' ? 'FOD Dashboard' :
                 tab === 'enumerators' ? 'Enumerators' :
                 tab === 'assignments' ? 'Deploy Surveys' :
                 tab === 'monitor' ? 'Field Monitor' : 'Inspections'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-sm">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 6.1: FOD DASHBOARD TAB */}
      {/* ======================================= */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Row 1: Metrics */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm text-left relative overflow-hidden">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Active Assignments</span>
              <div className="text-3xl font-black text-slate-900 font-mono tracking-tight">{totalActive}</div>
              <p className="text-[10px] text-slate-500 mt-1">Pending physical verification bounds</p>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm text-left relative overflow-hidden">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Enumerators In Field</span>
              <div className="text-3xl font-black text-slate-900 font-mono tracking-tight">{enumsInField}</div>
              <p className="text-[10px] text-slate-500 mt-1">Active CAPI mobile network connections</p>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm text-left relative overflow-hidden">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Submissions Today</span>
              <div className="text-3xl font-black text-indigo-750 font-mono tracking-tight">{submissionsToday}</div>
              <p className="text-[10px] text-slate-500 mt-1">Grounded interviews pushed to cloud</p>
            </div>

            <div className={`border p-5 rounded-2xl shadow-sm text-left relative overflow-hidden transition-colors ${
              flaggedToday > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200/80'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-widest block mb-2 ${
                flaggedToday > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}>Flagged Today</span>
              <div className={`text-3xl font-black font-mono tracking-tight ${
                flaggedToday > 0 ? 'text-rose-700' : 'text-slate-900'
              }`}>{flaggedToday}</div>
              <p className="text-[10px] text-slate-500 mt-1">Interviews sent back for re-interview</p>
              {flaggedToday > 0 && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
            </div>
          </section>

          {/* Row 2: Progress map & trust snapshot split */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 2/3: Field Progress Board list */}
            <div className="lg:col-span-8 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">Live Field Progress Channels</h3>
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Auto-cleared hourly
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left" role="presentation">
                  <thead className="bg-slate-50 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-3">Survey Name</th>
                      <th className="px-3 py-3">Assigned Region</th>
                      <th className="px-3 py-3 text-center">Multi-state Proportions</th>
                      <th className="px-3 py-3 text-right">Targets / Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="px-3 py-4 font-semibold text-slate-800">PLFS-2026 Household Wage Census</td>
                      <td className="px-3 py-4 font-mono text-slate-500">Tamil Nadu (Chennai)</td>
                      <td className="px-3 py-4">
                        {/* 4-Segment Progress Bar represent proportions of statuses: assigned, in_progress, submitted, accepted/high-trust */}
                        <div className="flex bg-slate-100 h-2.5 rounded-full overflow-hidden shadow-inner max-w-md mx-auto" title="Progress mix: Gray(Assigned), Amber(In-progress), Indigo(Submitted), Emerald(Accepted)">
                          <div className="h-full bg-slate-350" style={{ width: '15%' }} />
                          <div className="h-full bg-amber-400 animate-pulse" style={{ width: '35%' }} />
                          <div className="h-full bg-indigo-600" style={{ width: '25%' }} />
                          <div className="h-full bg-emerald-500" style={{ width: '25%' }} />
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-450 mt-1 font-semibold max-w-md mx-auto">
                          <span>Assigned (15%)</span>
                          <span>In field (35%)</span>
                          <span>Submitted (25%)</span>
                          <span>Passed (25%)</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <span className="font-mono text-slate-700 block font-bold">120 / 350 HHs</span>
                        <span className="text-[10px] text-rose-500 font-semibold font-mono">2026-06-30</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 1/3: Enumerator Trust Snapshot */}
            <div className="lg:col-span-4 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">High / Low Trust Roster</h3>
                <button 
                  onClick={() => setActiveSubTab('enumerators')}
                  className="text-[10px] text-indigo-700 font-extrabold hover:underline"
                >
                  View all
                </button>
              </div>

              <div className="space-y-4">
                {/* High Trust */}
                <div className="space-y-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Top Trusted Performers</span>
                  {enumerators.filter(e => e.trustScore >= 80).slice(0, 2).map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[9px] uppercase flex items-center justify-center">
                          {e.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-slate-700">{e.name}</span>
                      </div>
                      <TrustBadge score={e.trustScore} band="Green" isColorBlind={isColorBlind} />
                    </div>
                  ))}
                </div>

                {/* Low Trust Scrutiny */}
                <div className="space-y-2 pt-2 border-t border-slate-50">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-600">Active High Risk Vigilance</span>
                  {enumerators.filter(e => e.trustScore < 80).slice(0, 2).map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-rose-50 text-rose-700 font-bold text-[9px] uppercase flex items-center justify-center">
                          {e.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-slate-700 truncate max-w-[120px]">{e.name}</span>
                      </div>
                      <TrustBadge 
                        score={e.trustScore} 
                        band={e.trustScore >= 50 ? 'Amber' : 'Red'} 
                        isColorBlind={isColorBlind} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Row 3: Live GIS Assignment Pins Map Card */}
          <section className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="text-left">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                <Map className="w-4 h-4 text-slate-500" />
                Live Assignment Gis Map Monitor
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Real-time GPS pins synced dynamically with active paradata network telemetry layers</p>
            </div>

            {/* Real Interactive Leaflet Map for active surveys */}
            <div className="relative w-full h-[320px] rounded-2xl overflow-hidden shadow-inner">
              <LeafletMap 
                center={[13.0827, 80.2707]} 
                zoom={12} 
                height="320px"
                markers={assignments.map((asg, idx) => {
                  let badgeColor = '#5A6577'; // Gray/Assigned
                  if (asg.status === 'in_progress') badgeColor = '#BA7517'; // Amber/In Progress
                  else if (asg.status === 'submitted') badgeColor = '#14387F'; // Gov Blue/Submitted
                  else if (asg.status === 'accepted') badgeColor = '#1D9E75'; // Trust Green/Passed
                  else if (asg.status === 're_interview') badgeColor = '#E24B4A'; // Trust Red/Re-interview

                  // Scatter slightly to avoid perfect superposition in mock dataset coordinates
                  const latSeed = 13.0827 + (idx * 0.006 - 0.015);
                  const lngSeed = 80.2707 + (idx * 0.007 - 0.012);

                  return {
                    id: asg.id,
                    lat: latSeed,
                    lng: lngSeed,
                    title: `Household ${asg.hhId}`,
                    subtitle: `Collector: ${asg.enumeratorName} | Prior visits: 1`,
                    badge: asg.status.toUpperCase().replace('_', ' '),
                    badgeColor: badgeColor
                  };
                })}
              />

              {/* Legend overlay block */}
              <div className="absolute bottom-4 left-4 bg-white/95 border border-slate-300 shadow-md p-3 rounded-lg text-[9px] font-bold text-slate-650 grid grid-cols-2 gap-2 z-20">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-slate-300" />
                  <span>Assigned</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-trust-amber border border-amber-300" />
                  <span>In Progress</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gov-blue border border-indigo-300" />
                  <span>Submitted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-trust-green border border-emerald-300" />
                  <span>Passed</span>
                </div>
                <div className="flex items-center gap-1.5 col-span-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-trust-red border border-rose-300 animate-pulse" />
                  <span>Re-interview (Flagged)</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 6.2: ENUMERATORS ROSTER TAB */}
      {/* ======================================= */}
      {activeSubTab === 'enumerators' && (
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left table view */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-4 space-y-4">
            <div className="flex justify-between items-center gap-4 flex-wrap">
              <h2 className="font-bold text-xs text-slate-400 uppercase tracking-wider">{t.enumeratorRoster}</h2>
              <div className="relative max-w-xs w-full sm:w-auto">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search enumerators..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full sm:w-60 text-xs p-1.5 pl-8 border border-slate-250 rounded-xl focus:outline-indigo-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left" role="grid">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Zone/Region</th>
                    <th className="px-3 py-2.5 text-center">Assigned</th>
                    <th className="px-3 py-2.5 text-center">Completed</th>
                    <th className="px-3 py-2.5">7-Day Trajectory</th>
                    <th className="px-3 py-2.5 text-right">Trust Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enumerators
                    .filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((e) => {
                      const isSelected = e.id === selectedEnumId;
                      const band = e.trustScore >= 80 ? 'Green' : e.trustScore >= 50 ? 'Amber' : 'Red';
                      
                      return (
                        <tr 
                          key={e.id}
                          onClick={() => setSelectedEnumId(e.id)}
                          className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50/20 font-semibold text-slate-900' : 'text-slate-600'
                          }`}
                          role="row"
                          aria-selected={isSelected}
                        >
                          <td className="px-3 py-3 font-medium flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold uppercase text-[10px]">
                              {e.name.charAt(0)}
                            </div>
                            <span>{e.name}</span>
                          </td>
                          <td className="px-3 py-3 font-mono">{e.region}</td>
                          <td className="px-3 py-3 text-center font-mono">{e.assignedCount}</td>
                          <td className="px-3 py-3 text-center font-mono">{e.completedCount}</td>
                          <td className="px-3 py-3" aria-label="Visual sparkline trend over 7 days">
                            {renderSparkline(e.sparkline)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <TrustBadge score={e.trustScore} band={band} isColorBlind={isColorBlind} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right Selected Enumerator Detail card */}
          <section className="lg:col-span-5 space-y-4">
            {selectedEnum ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-5">
                {/* Header card with details */}
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-100 rounded-lg text-slate-700">
                        <User className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">{selectedEnum.name}</h3>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold font-mono">ID: {selectedEnum.id.toUpperCase()}</p>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{selectedEnum.region}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Live status</span>
                    <TrustBadge 
                      score={selectedEnum.trustScore} 
                      band={selectedEnum.trustScore >= 80 ? 'Green' : selectedEnum.trustScore >= 50 ? 'Amber' : 'Red'} 
                      isColorBlind={isColorBlind} 
                    />
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* 90-days trajectory line chart */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-400">{t.trustTrajectory} (90 Days)</label>
                  <div className="h-40 w-full bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={selectedEnum.sparkline.map((val, idx) => ({ day: `D-${7-idx}`, Score: val }))}
                        margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                      >
                        <XAxis dataKey="day" style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                        <YAxis domain={[0, 100]} style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: 10, background: '#1e293b', color: '#fff', borderRadius: '6px' }} />
                        <Line 
                          type="monotone" 
                          dataKey="Score" 
                          stroke="#1e3a8a" 
                          strokeWidth={2.5} 
                          dot={{ r: 4, strokeWidth: 1 }} 
                          activeDot={{ r: 6 }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent flags list */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    {selectedEnum.recentFlags.length === 0 ? 'Recent Verification Incidents (Clear)' : 'Recent Paradata Violation Warnings'}
                  </label>
                  
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {selectedEnum.recentFlags.map((flag, idx) => (
                      <div key={idx} className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-mono text-[9px] py-0.5 px-1.5 bg-rose-200/50 text-rose-800 rounded font-bold uppercase mr-1">
                            {flag.flagType}
                          </span>
                          <p className="text-rose-900 leading-relaxed font-sans">{flag.reason}</p>
                          <span className="block text-[9px] text-rose-400 font-mono font-semibold">{new Date(flag.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}

                    {selectedEnum.recentFlags.length === 0 && (
                      <div className="p-4 text-center bg-slate-50 border border-slate-100 rounded-xl text-slate-400 italic text-[11px]">
                        Zero data anomalies captured for this surveyor profile. Highly compliant.
                      </div>
                    )}
                  </div>
                </div>

                {/* Assignments Sub-table */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider">Assignments list</label>
                  <div className="overflow-x-auto max-h-40 border border-slate-100 rounded-xl">
                    <table className="w-full text-left text-[11px]" role="presentation">
                      <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px]">
                        <tr>
                          <th className="px-2 py-1.5">HH ID</th>
                          <th className="px-2 py-1.5">Status</th>
                          <th className="px-2 py-1.5 text-right">Due Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {assignments.filter(a => a.enumeratorId === selectedEnum.id).map(a => (
                          <tr key={a.id} className="text-slate-600">
                            <td className="px-2 py-1.5 font-bold">{a.hhId}</td>
                            <td className="px-2 py-1.5"><span className="text-[9px] uppercase font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">{a.status}</span></td>
                            <td className="px-2 py-1.5 text-right">{a.dueDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Actions bottom */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setActiveSubTab('assignments')}
                      className="flex-1 py-2 px-3 bg-indigo-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Assign Survey
                    </button>
                    <button 
                      onClick={handleSendMessage}
                      disabled={!messageText.trim()}
                      className="flex-1 py-2 px-3 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {t.messageEnumerator}
                    </button>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Type supervisor push message..." 
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 rounded-xl focus:outline-indigo-500 bg-slate-50"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-100">
                Select an enumerator to view trajectory and alert paradata histories.
              </div>
            )}
          </section>
        </main>
      )}

      {/* ======================================= */}
      {/* SECTION 6.3: DEPLOYMENT SURVEYS WIZARD */}
      {/* ======================================= */}
      {activeSubTab === 'assignments' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 max-w-4xl mx-auto">
          
          {/* Stepper Wizard Top Layout */}
          <div className="flex items-center justify-center gap-2 max-w-md mx-auto" role="navigation">
            <div className={`flex items-center gap-1.5 text-xs font-bold ${
              wizardStep === 1 ? 'text-indigo-900 font-extrabold' : 'text-slate-400'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                wizardStep === 1 ? 'bg-indigo-900 text-white' : 'bg-slate-100 text-slate-400'
              }`}>1</div>
              <span>Pick Survey</span>
            </div>
            
            <ChevronRight className="w-4 h-4 text-slate-350" />

            <div className={`flex items-center gap-1.5 text-xs font-bold ${
              wizardStep === 2 ? 'text-indigo-900 font-extrabold' : 'text-slate-400'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                wizardStep === 2 ? 'bg-indigo-900 text-white' : 'bg-slate-100 text-slate-400'
              }`}>2</div>
              <span>Boundaries</span>
            </div>

            <ChevronRight className="w-4 h-4 text-slate-350" />

            <div className={`flex items-center gap-1.5 text-xs font-bold ${
              wizardStep === 3 ? 'text-indigo-900 font-extrabold' : 'text-slate-400'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                wizardStep === 3 ? 'bg-indigo-900 text-white' : 'bg-slate-100 text-slate-400'
              }`}>3</div>
              <span>Deploy</span>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* STEP 1: Survey Picker Cards */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-slate-800">Step 1 — Choose Published Survey Block</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {surveys.map(s => {
                  const isSelected = selectedSurveyId === s.id;
                  return (
                    <div 
                      key={s.id}
                      onClick={() => setSelectedSurveyId(s.id)}
                      className={`p-4 rounded-2xl border-2 cursor-pointer text-left transition-all ${
                        isSelected ? 'bg-indigo-50/10 border-indigo-900 shadow' : 'bg-white border-slate-205 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 rounded-md font-mono">
                          v{s.version}
                        </span>
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          s.status === 'Published' ? 'bg-emerald-500' : 'bg-slate-400'
                        }`} />
                      </div>
                      <h4 className="font-bold text-slate-800 text-xs mt-2">{s.name_en}</h4>
                      <p className="text-[10.5px] text-slate-500 mt-1">{s.questions.length} questions block · English, Hindi, Tamil formats</p>
                    </div>
                  );
                })}
              </div>

              <div className="text-right pt-4">
                <button 
                  onClick={() => setWizardStep(2)}
                  className="px-4 py-2 bg-indigo-950 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 ml-auto"
                >
                  Next: Region Bounds
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Boundaries cascading & Households map sync */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">Step 2 — Define Geography Bounds</h3>
              
              {/* Tabs: Cascading Selectors vs Direct LGD/Pin code */}
              <div className="flex border-b border-slate-200 text-xs font-bold">
                <button 
                  onClick={() => setDirectInputTab('cascading')}
                  className={`py-2 px-3 border-b-2 transition-colors ${directInputTab === 'cascading' ? 'border-indigo-900 text-indigo-900 font-extrabold' : 'border-transparent text-slate-400'}`}
                >
                  LGD Hierarchy Cascading
                </button>
                <button 
                  onClick={() => setDirectInputTab('lgd')}
                  className={`py-2 px-3 border-b-2 transition-colors ${directInputTab === 'lgd' ? 'border-indigo-900 text-indigo-900 font-extrabold' : 'border-transparent text-slate-400'}`}
                >
                  Direct LGD Code
                </button>
                <button 
                  onClick={() => setDirectInputTab('pin')}
                  className={`py-2 px-3 border-b-2 transition-colors ${directInputTab === 'pin' ? 'border-indigo-900 text-indigo-900 font-extrabold' : 'border-transparent text-slate-400'}`}
                >
                  Pin Code Input
                </button>
                <button 
                  onClick={() => setDirectInputTab('nic')}
                  className={`py-2 px-3 border-b-2 transition-colors ${directInputTab === 'nic' ? 'border-indigo-900 text-indigo-900 font-extrabold' : 'border-transparent text-slate-400'}`}
                >
                  NIC Sectors (Enterprise)
                </button>
              </div>

              {/* Cascading selectors row */}
              {directInputTab === 'cascading' && (
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">State</label>
                    <select value={geoState} onChange={e => setGeoState(e.target.value)} className="w-full p-2 border border-slate-200 bg-white rounded-lg">
                      <option>Tamil Nadu</option>
                      <option>Kerala</option>
                      <option>Karnataka</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">District</label>
                    <select value={geoDistrict} onChange={e => setGeoDistrict(e.target.value)} className="w-full p-2 border border-slate-200 bg-white rounded-lg">
                      <option>Chennai</option>
                      <option>Coimbatore</option>
                      <option>Madurai</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Block</label>
                    <select value={geoBlock} onChange={e => setGeoBlock(e.target.value)} className="w-full p-2 border border-slate-200 bg-white rounded-lg">
                      <option>Block-A</option>
                      <option>Block-B</option>
                      <option>Block-C</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Village</label>
                    <select value={geoVillage} onChange={e => setGeoVillage(e.target.value)} className="w-full p-2 border border-slate-200 bg-white rounded-lg">
                      <option>Village-X</option>
                      <option>Village-Y</option>
                      <option>Village-Z</option>
                    </select>
                  </div>
                </div>
              )}

              {directInputTab === 'lgd' && (
                <div className="max-w-xs text-xs space-y-1">
                  <label className="block text-[10.5px] uppercase font-bold text-slate-400">Direct National LGD Code</label>
                  <input type="text" placeholder="e.g., LGD-3302001" value={lgdCode} onChange={e => setLgdCode(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg bg-slate-5" />
                </div>
              )}

              {directInputTab === 'pin' && (
                <div className="max-w-xs text-xs space-y-1">
                  <label className="block text-[10.5px] uppercase font-bold text-slate-400">Enter Postal PIN code</label>
                  <input type="text" placeholder="e.g., 600001" value={pinCode} onChange={e => setPinCode(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg bg-slate-5" />
                </div>
              )}

              {directInputTab === 'nic' && (
                <div className="max-w-xs text-xs space-y-1">
                  <label className="block text-[10.5px] uppercase font-bold text-slate-400">Enterprise NIC Classification</label>
                  <select value={nicSector} onChange={e => setNicSector(e.target.value)} className="w-full p-2 border border-slate-200 bg-white rounded-lg">
                    <option>Agriculture & Allied Fields</option>
                    <option>Manufacturing & Heavy Industry</option>
                    <option>Retail Trade and Cab services</option>
                  </select>
                </div>
              )}

              {/* Split layout: Households table VS Map view (50% each sync) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch border-t border-slate-100 pt-3">
                {/* Household choosing table */}
                <div className="space-y-2 text-left">
                  <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg text-[10px] text-slate-500 font-bold">
                    <span>Target households pool ({geoVillage})</span>
                    <button 
                      onClick={() => setSelectedHouseholds(householdPool.map(h => h.id))}
                      className="text-indigo-805 text-[10px] hover:underline"
                    >
                      Select all
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {householdPool.map(hh => {
                      const isChecked = selectedHouseholds.includes(hh.id);
                      return (
                        <div 
                          key={hh.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                            isChecked ? 'bg-indigo-50/20 border-indigo-200' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => handleToggleHousehold(hh.id)}
                              className="w-3.5 h-3.5 rounded text-indigo-900 border-slate-300"
                            />
                            <div>
                              <span className="font-mono text-xs font-black block">{hh.id}</span>
                              <p className="text-[10.5px] text-slate-500 leading-tight font-sans">{hh.summary}</p>
                            </div>
                          </div>
                          
                          <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 py-0.5 px-1.5 rounded">
                            {hh.priorVisits} prior visits
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Shaded GIS local households map */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl flex flex-col p-3 relative h-64 md:h-auto min-h-60 animate-fadeIn justify-between">
                  <span className="text-[10px] text-slate-550 font-bold uppercase tracking-wider block mb-1">Region GIS local household selector</span>
                  
                  <div className="w-full flex-1 relative h-[180px]">
                    <LeafletMap 
                      center={[13.0827, 80.2707]} 
                      zoom={13} 
                      height="180px"
                      markers={householdPool.map((hh) => {
                        const isSelected = selectedHouseholds.includes(hh.id);
                        return {
                          id: hh.id,
                          lat: hh.lat,
                          lng: hh.lng,
                          title: `Household ${hh.id}`,
                          subtitle: hh.summary,
                          badge: isSelected ? 'Selected' : 'Click to Select',
                          badgeColor: isSelected ? '#14387F' : '#64748B'
                        };
                      })}
                      onMarkerClick={(id) => handleToggleHousehold(id)}
                    />
                  </div>

                  <div className="text-[9px] text-slate-400 font-bold mt-1 text-center">
                    <span>* Click pins on the live tiles to toggle selector sync</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4">
                <button 
                  onClick={() => setWizardStep(1)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button 
                  onClick={() => setWizardStep(3)}
                  disabled={selectedHouseholds.length === 0}
                  className="px-4 py-2 bg-indigo-950 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-40"
                >
                  Next: Assign Enumerators
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Assign Surveyors & deployments timeline */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-slate-800">Step 3 — Deploy & Balance Workload</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                
                {/* Left 2 cols: Enumerators selection with current workload bars */}
                <div className="md:col-span-2 space-y-3 text-left">
                  <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase block">Selected survey region area surveyors ({geoDistrict})</span>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {enumerators.map(e => {
                      const isChecked = assignedEnumeratorIds.includes(e.id);
                      return (
                        <div 
                          key={e.id}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                            isChecked ? 'bg-indigo-50/20 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => handleToggleEnumeratorAssign(e.id)}
                              className="w-3.5 h-3.5 rounded text-indigo-900 border-slate-300"
                            />
                            <div>
                              <span className="font-bold block text-slate-800">{e.name}</span>
                              {/* Current Workload Progression Bar */}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-slate-450 font-medium">Workload:</span>
                                <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${
                                      e.assignedCount > 150 ? 'bg-rose-500' : e.assignedCount > 100 ? 'bg-amber-400' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, (e.assignedCount / 200) * 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[9px] font-bold text-slate-500">{e.assignedCount} / 200 HHs</span>
                              </div>
                            </div>
                          </div>

                          <TrustBadge score={e.trustScore} band={e.trustScore >= 80 ? 'Green' : 'Amber'} isColorBlind={isColorBlind} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Balancing Auto Suggest Alert box */}
                  {assignedEnumeratorIds.length > 0 && (
                    <div className="p-3 bg-indigo-50 border border-indigo-150 rounded-xl text-[11px] text-indigo-900 flex items-center gap-2">
                      <Info className="w-4 h-4 text-indigo-705 shrink-0" />
                      <span>
                        <strong>MoSPI Load Equalizer:</strong> Allocating {selectedHouseholds.length} Households across {assignedEnumeratorIds.length} surveyors. Distributing evenly (~{Math.round(selectedHouseholds.length / assignedEnumeratorIds.length)} HHs per field collector, completely equalized).
                      </span>
                    </div>
                  )}
                </div>

                {/* Right col: Timeline dates & final summary ticket card */}
                <div className="space-y-4">
                  {/* Timeline Date pickers */}
                  <div className="p-4 bg-slate-50 border border-slate-205 rounded-2xl space-y-3 text-left">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Deployment schedule</span>
                    
                    <div className="text-xs space-y-1">
                      <label className="block font-bold text-slate-600">Starting date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg bg-white" />
                    </div>

                    <div className="text-xs space-y-1">
                      <label className="block font-bold text-slate-600">Expected due date</label>
                      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg bg-white" />
                    </div>
                  </div>

                  {/* Deploy Ticket Summary block */}
                  <div className="p-4 bg-indigo-950 text-white rounded-2xl text-left space-y-3 shadow shadow-indigo-900/40">
                    <span className="text-[9px] font-black uppercase text-indigo-250 tracking-widest block">Deployment summary ticket</span>
                    <hr className="border-indigo-900" />
                    <ul className="text-xs space-y-1 font-mono text-indigo-150">
                      <li>• Households target: <strong className="text-white font-sans">{selectedHouseholds.length}</strong></li>
                      <li>• Survey collectors: <strong className="text-white font-sans">{assignedEnumeratorIds.length}</strong></li>
                      <li>• Survey block version: <strong className="text-white uppercase font-sans">Emp-2026 v2.4</strong></li>
                    </ul>

                    <button 
                      onClick={() => setIsDeployConfirmOpen(true)}
                      disabled={assignedEnumeratorIds.length === 0}
                      className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-805 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-2 shadow"
                    >
                      <CheckSquare className="w-4 h-4" />
                      Deploy Field Force
                    </button>
                  </div>
                </div>

              </div>

              <div className="flex justify-between items-center pt-2">
                <button 
                  onClick={() => setWizardStep(2)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
              </div>

            </div>
          )}

          {/* Deploy Confirmation overlay dialog modal */}
          {isDeployConfirmOpen && (
            <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fadeIn" role="dialog" aria-modal="true">
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-100 text-center animate-scaleIn">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-full flex items-center justify-center mx-auto">
                  <Sliders className="w-6 h-6 text-indigo-700" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-extrabold text-slate-800 text-sm">Deploy Survey Operation?</h4>
                  <p className="text-xs text-slate-500">This will immediately sync selected socio-economic targets to corresponding surveyors' CAPI terminals over active local sync channels.</p>
                </div>
                <div className="flex gap-2.5">
                  <button 
                    onClick={() => setIsDeployConfirmOpen(false)}
                    className="flex-1 py-2 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDeployWizardFinish}
                    className="flex-1 py-2 px-3 bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-extrabold rounded-xl"
                  >
                    Deploy Surveyors
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 6.4: FIELD MONITOR AND DEPLOYMENT KANBAN */}
      {/* ======================================= */}
      {activeSubTab === 'monitor' && (
        <div className="space-y-6">
          
          {/* Header filter options */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100/80 shadow-sm flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
              <span>Active Survey Module:</span>
              <select 
                value={selectedMonitorSurveyId} 
                onChange={e => setSelectedMonitorSurveyId(e.target.value)}
                className="p-1 px-3.5 border border-slate-200 bg-slate-50 rounded-lg focus:outline-indigo-500 font-serif text-slate-900 font-bold"
              >
                <option value="sur_plfs_2026">Periodic Labour Force Survey (PLFS-2026)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-black uppercase">Operation Board</span>
            </div>
          </div>

          {/* Kanban Columns (counts, non-draggable cards, scored trust indicator) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            
            {/* COLUMN 1: ASSIGNED (or re_interview) */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-4 space-y-3 self-stretch">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-slate-450 uppercase tracking-wider block bg-slate-200 px-2 py-0.5 rounded">Assigned / Re-interview</span>
                <span className="font-mono text-xs font-bold text-slate-400">
                  {assignments.filter(a => a.status === 'assigned' || a.status === 're_interview').length}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                {assignments
                  .filter(a => a.status === 'assigned' || a.status === 're_interview')
                  .map(item => (
                    <div key={item.id} className="bg-white p-3.5 rounded-xl border border-slate-202 shadow-sm text-left relative overflow-hidden space-y-2 group transition-shadow hover:shadow">
                      {item.status === 're_interview' && (
                        <span className="absolute top-0 left-0 w-full h-[3px] bg-rose-500 inline-block" />
                      )}
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-mono text-xs font-extrabold text-slate-800">{item.hhId}</span>
                        <span className={`text-[8.5px] uppercase font-black px-1 rounded font-mono ${
                          item.status === 're_interview' ? 'bg-rose-50 text-rose-800' : 'bg-slate-50 text-slate-450'
                        }`}>{item.status}</span>
                      </div>
                      
                      <div className="text-[10px] text-slate-450 leading-relaxed font-sans">
                        <p>Collector: <strong>{item.enumeratorName}</strong></p>
                        <p>D: {item.startingDate} &rarr; <strong className="text-slate-800">{item.dueDate}</strong></p>
                      </div>

                      {/* Controls to expand, pause or reassign surveys */}
                      <div className="flex gap-1 border-t border-slate-50 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button 
                          onClick={() => handleMonitorAction('pause', item)}
                          className="p-1 hover:bg-slate-50 text-slate-650 rounded border border-slate-100" 
                          title="Pause"
                        >
                          <Pause className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => handleMonitorAction('extend', item)}
                          className="p-1 hover:bg-slate-50 text-indigo-650 rounded border border-slate-100 text-[9px] font-sans font-bold" 
                        >
                          Due+
                        </button>
                        <button 
                          onClick={() => handleMonitorAction('reassign', item)}
                          className="p-1 hover:text-white hover:bg-indigo-900 border border-slate-200 hover:border-indigo-950 text-indigo-705 text-[9px] rounded font-semibold whitespace-nowrap"
                        >
                          Reassign
                        </button>
                      </div>
                    </div>
                  ))}

                {assignments.filter(a => a.status === 'assigned' || a.status === 're_interview').length === 0 && (
                  <div className="text-center p-6 text-slate-400 italic text-[11px]">No assigned items.</div>
                )}
              </div>
            </div>

            {/* COLUMN 2: IN PROGRESS */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-4 space-y-3 self-stretch">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded block">In Progress</span>
                <span className="font-mono text-xs font-bold text-amber-500">
                  {assignments.filter(a => a.status === 'in_progress').length}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                {assignments
                  .filter(a => a.status === 'in_progress')
                  .map(item => (
                    <div key={item.id} className="bg-white p-3.5 rounded-xl border border-slate-202 shadow-sm text-left relative overflow-hidden space-y-1.5 group transition-shadow hover:shadow">
                      <span className="absolute top-0 left-0 w-full h-[3px] bg-amber-400 inline-block animate-pulse" />
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-mono text-xs font-extrabold text-slate-800">{item.hhId}</span>
                        <span className="text-[8.5px] uppercase font-bold text-slate-400 font-mono">active</span>
                      </div>
                      
                      <div className="text-[10px] text-slate-450 leading-relaxed font-sans">
                        <p>Collector: <strong>{item.enumeratorName}</strong></p>
                        <p>Start: {item.startingDate}</p>
                      </div>
                    </div>
                  ))}

                {assignments.filter(a => a.status === 'in_progress').length === 0 && (
                  <div className="text-center p-6 text-slate-400 italic text-[11px]">No active field interviews.</div>
                )}
              </div>
            </div>

            {/* COLUMN 3: SUBMITTED */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-4 space-y-3 self-stretch">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded block">Submitted</span>
                <span className="font-mono text-xs font-bold text-indigo-500">
                  {assignments.filter(a => a.status === 'submitted').length}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                {assignments
                  .filter(a => a.status === 'submitted')
                  .map(item => (
                    <div key={item.id} className="bg-white p-3.5 rounded-xl border border-slate-202 shadow-sm text-left relative overflow-hidden space-y-1.5 group transition-shadow hover:shadow">
                      <span className="absolute top-0 left-0 w-full h-[3px] bg-indigo-650 inline-block" />
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-mono text-xs font-extrabold text-slate-800">{item.hhId}</span>
                        <span className="text-[8.5px] uppercase font-bold text-indigo-700 bg-indigo-50 px-1 rounded font-mono">pushed</span>
                      </div>
                      
                      <div className="text-[10px] text-slate-450 leading-relaxed font-sans">
                        <p>Collector: <strong>{item.enumeratorName}</strong></p>
                        {item.trustScore && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-[10px] font-semibold">Live scored trust:</span>
                            <TrustBadge score={item.trustScore} band={item.trustScore >= 80 ? 'Green' : 'Red'} isColorBlind={isColorBlind} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                {assignments.filter(a => a.status === 'submitted').length === 0 && (
                  <div className="text-center p-6 text-slate-400 italic text-[11px]">No submitted surveys awaiting approval.</div>
                )}
              </div>
            </div>

            {/* COLUMN 4: ACCEPTED */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-4 space-y-3 self-stretch">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-emerald-850 bg-emerald-50 px-2 py-0.5 rounded block">Accepted</span>
                <span className="font-mono text-xs font-bold text-emerald-500">
                  {assignments.filter(a => a.status === 'accepted').length}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                {assignments
                  .filter(a => a.status === 'accepted')
                  .map(item => (
                    <div key={item.id} className="bg-white p-3.5 rounded-xl border border-slate-202 shadow-sm text-left relative overflow-hidden space-y-1.5 group transition-shadow hover:shadow">
                      <span className="absolute top-0 left-0 w-full h-[3px] bg-emerald-500 inline-block" />
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-mono text-xs font-extrabold text-slate-800">{item.hhId}</span>
                        <span className="text-[8.5px] uppercase font-bold text-emerald-800 bg-emerald-50 px-1 rounded font-mono">cleared</span>
                      </div>
                      
                      <div className="text-[10px] text-slate-450 leading-relaxed font-sans">
                        <p>Collector: <strong>{item.enumeratorName}</strong></p>
                        {item.trustScore && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-[10px] font-semibold">Quality trust:</span>
                            <TrustBadge score={item.trustScore} band="Green" isColorBlind={isColorBlind} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                {assignments.filter(a => a.status === 'accepted').length === 0 && (
                  <div className="text-center p-6 text-slate-400 italic text-[11px]">No accepted records cleared under threshold rules.</div>
                )}
              </div>
            </div>

          </section>
        </div>
      )}

      {/* ======================================= */}
      {/* SECTION 6.5: FIELD INSPECTIONS QUEUE */}
      {/* ======================================= */}
      {activeSubTab === 'inspections' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
          <div className="text-left">
            <h3 className="font-extrabold text-sm text-slate-805 flex items-center gap-1.5">
              <ClipboardList className="w-5 h-5 text-rose-600 shrink-0" />
              Incidents & Inspections Audit Queue
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Scrutinizing anomalous paradata alerts requiring supervisory field check clearances</p>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-xs text-left" role="presentation">
              <thead className="bg-slate-50 text-[10px] text-slate-550 font-bold uppercase tracking-wider border-b border-slate-150">
                <tr>
                  <th className="px-3 py-3">Incident / Response ID</th>
                  <th className="px-3 py-3">Flagged Surveyor</th>
                  <th className="px-3 py-3">Survey Unit</th>
                  <th className="px-3 py-3">Primary Alert Conflict Reason</th>
                  <th className="px-3 py-3 text-center">Scored Quality</th>
                  <th className="px-3 py-3 text-right">Scrutineer Decisions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flaggedResponses.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-4 font-mono font-bold text-slate-900">{item.id.toUpperCase()}</td>
                    <td className="px-3 py-4 font-sans font-medium">{item.enumeratorName}</td>
                    <td className="px-3 py-4 font-semiformal text-slate-600 truncate max-w-[150px]">{item.surveyName}</td>
                    <td className="px-3 py-4 text-slate-600 text-[11px] leading-snug">
                      <div className="space-y-0.5 max-w-xs">
                        <span className="font-mono text-[9px] font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded uppercase">
                          CROSS LAYER VIOLATION ✗
                        </span>
                        <p>{item.validation.layer5_cross.status === 'fail' 
                          ? item.validation.layer5_cross.reason 
                          : item.validation.layer4_behavior.reason}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="font-mono font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded py-1 px-2">
                        {item.confidenceScore}% (RED)
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => handleMarkInspected(item.id)}
                          className="px-2.5 py-1 bgColor bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[10.5px] font-bold rounded-md"
                        >
                          Mark Inspected
                        </button>
                        <button 
                          onClick={() => handleReinterviewInspected(item.id, item)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-md flex items-center gap-1 font-mono uppercase tracking-wider"
                        >
                          Send for re-interview
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {flaggedResponses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-slate-400 italic text-[11px]">
                      Zero incident anomalies reported today. All survey paradata holds pristine compliance metrics.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

