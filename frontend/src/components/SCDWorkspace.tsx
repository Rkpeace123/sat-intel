/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api, db } from '../api';
import { SurveyResponse, NationalMetrics, Enumerator } from '../types';
import { translations } from '../i18n';
import { TrustBadge, ConfidenceGauge, ReasonPopover } from './TrustComponents';
import { LeafletMap } from './LeafletMap';
import { 
  LayoutDashboard, 
  Radio, 
  TrendingUp, 
  AlertTriangle, 
  Users, 
  BookOpen, 
  Download, 
  HelpCircle, 
  MapPin, 
  ChevronRight, 
  ChevronLeft, 
  RefreshCw, 
  Search, 
  FileText, 
  Clock, 
  ArrowRight, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Database, 
  Sliders, 
  Calendar, 
  Lock, 
  Check, 
  Wifi, 
  WifiOff, 
  User, 
  ExternalLink, 
  ChevronUp, 
  ChevronDown,
  Sparkles,
  Info
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
  AreaChart, 
  Area, 
  Cell
} from 'recharts';

interface SCDWorkspaceProps {
  lang: 'en' | 'hi' | 'ta';
  isColorBlind: boolean;
}

interface LiveIncident {
  id: string;
  enumeratorName: string;
  surveyName: string;
  reason: string;
  confidence: number;
  timestamp: string;
}

interface MapRegion {
  id: string;
  name: string;
  confidence: number;
  responses: number;
  flagRate: number;
  topEnumerators: string[];
}

interface ExportTask {
  id: string;
  filename: string;
  survey: string;
  region: string;
  threshold: number;
  count: number;
  author: string;
  timestamp: string;
  certified: boolean;
}

export const SCDWorkspace: React.FC<SCDWorkspaceProps> = ({ lang, isColorBlind }) => {
  const t = translations[lang];

  // High-level subtabs for the overall command layout
  const [activeSubTab, setActiveSubTab] = useState<'command' | 'map' | 'analytics' | 'exports'>('command');

  // Interactive Live websocket simulation states
  const [isWebSocketActive, setIsWebSocketActive] = useState(true);
  const [wsTriggerCount, setWsTriggerCount] = useState(0);

  // States to store db data
  const [metrics, setMetrics] = useState<NationalMetrics>({
    responsesToday: 0,
    flaggedCount: 0,
    avgConfidence: 0,
    activeEnumerators: 0
  });
  
  const [minConfSlider, setMinConfSlider] = useState(40);
  const [incidents, setIncidents] = useState<LiveIncident[]>([
    {
      id: 'resp_1',
      enumeratorName: 'Karthik S. (Suspect profile)',
      surveyName: 'PLFS-2026',
      reason: "Income ₹2,00,000 exceeds ₹10,000 boundary for Unemployed occupation state.",
      confidence: 46,
      timestamp: new Date(Date.now() - 30000).toISOString()
    },
    {
      id: 'resp_2',
      enumeratorName: 'Rajesh G. (High Velocity)',
      surveyName: 'HCES-2026',
      reason: "Answering speed (<3s median per question) points to keyboard straightline script simulation.",
      confidence: 32,
      timestamp: new Date(Date.now() - 120000).toISOString()
    },
    {
      id: 'resp_3',
      enumeratorName: 'Meena K.',
      surveyName: 'PLFS-2026',
      reason: "Geographic coordinate delta: device located 82km away from specified LGD ward.",
      confidence: 58,
      timestamp: new Date(Date.now() - 400000).toISOString()
    }
  ]);

  const [leaderboard, setLeaderboard] = useState<Enumerator[]>([]);
  const [filteredResponses, setFilteredResponses] = useState<SurveyResponse[]>([]);
  const [dbResponses, setDbResponses] = useState<SurveyResponse[]>([]);
  const [successToast, setSuccessToast] = useState('');

  // 9.1 Drilled down read-only response detail sidebar or modal state
  const [drilledResponse, setDrilledResponse] = useState<SurveyResponse | null>(null);

  // 9.2 Geographic state-zoom variables
  const [zoomLevel, setZoomLevel] = useState<'country' | 'state' | 'district'>('country');
  const [selectedState, setSelectedState] = useState<string>('Tamil Nadu');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('Chennai');
  const [pinFilter, setPinFilter] = useState('');
  const [nicFilter, setNicFilter] = useState('ALL');

  // Interactive Live websocket mock trigger
  const triggerMockWebSocketFlag = () => {
    const surveyors = ['Suresh Nair', 'Ketan Mehta', 'Ramya Krishnan', 'Arvinder Singh', 'Amit Sen'];
    const surveys = ['PLFS-2026', 'HCES-2026', 'ASI-2026'];
    const reasons = [
      'Required household census registry index left blank during validation step.',
      'Anomalous rent expense entered (₹95,000) sits outside 99.4th percentile bounds for class.',
      'Multiple back-navigation swaps (x24) detected on high-impact income fields.',
      'Device biometric voice pattern mismatch detected against assigned profile.'
    ];

    const randomSurveyor = surveyors[Math.floor(Math.random() * surveyors.length)];
    const randomSurvey = surveys[Math.floor(Math.random() * surveys.length)];
    const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
    const randomConf = Math.floor(Math.random() * 40) + 25; // 25-65% confidence

    const newAlert: LiveIncident = {
      id: 'resp_ws_' + Date.now().toString().slice(-4),
      enumeratorName: randomSurveyor,
      surveyName: randomSurvey,
      reason: randomReason,
      confidence: randomConf,
      timestamp: new Date().toISOString()
    };

    setIncidents(prev => [newAlert, ...prev].slice(0, 10)); // keep 10 max
    setSuccessToast(`Live WebSocket Inflow: Critical Quality flag dispatched for ${randomSurveyor}!`);
    setWsTriggerCount(c => c + 1);
    setTimeout(() => setSuccessToast(''), 4500);
  };

  // 9.2 Mock geographical statistics
  const stateStats: Record<string, MapRegion> = {
    'Tamil Nadu': { id: 'TN', name: 'Tamil Nadu', confidence: 84, responses: 5420, flagRate: 2.1, topEnumerators: ['Lakshmi P.', 'Suresh Kumar'] },
    'Maharashtra': { id: 'MH', name: 'Maharashtra', confidence: 89, responses: 4120, flagRate: 1.4, topEnumerators: ['Amit V.', 'Priya Deshmukh'] },
    'Rajasthan': { id: 'RJ', name: 'Rajasthan', confidence: 76, responses: 2400, flagRate: 5.2, topEnumerators: ['Arjun S.', 'Kiran B.'] },
    'Uttar Pradesh': { id: 'UP', name: 'Uttar Pradesh', confidence: 61, responses: 6200, flagRate: 9.4, topEnumerators: ['Sanjay D.', 'Rajesh Yadav'] },
    'Odisha': { id: 'OD', name: 'Odisha', confidence: 78, responses: 1950, flagRate: 4.1, topEnumerators: ['Nitin Mohanty', 'Binod P.'] },
    'Karnataka': { id: 'KA', name: 'Karnataka', confidence: 85, responses: 3800, flagRate: 1.9, topEnumerators: ['Girish M.', 'Divya S.'] },
    'Kerala': { id: 'KL', name: 'Kerala', confidence: 91, responses: 1650, flagRate: 0.8, topEnumerators: ['Nikhil J.', 'Anjali Panicker'] },
    'Gujarat': { id: 'GJ', name: 'Gujarat', confidence: 83, responses: 2900, flagRate: 2.6, topEnumerators: ['Parth Patel', 'Hetal Modi'] },
    'West Bengal': { id: 'WB', name: 'West Bengal', confidence: 72, responses: 3500, flagRate: 5.9, topEnumerators: ['Subrata D.', 'Mimi Roy'] },
    'Andhra Pradesh': { id: 'AP', name: 'Andhra Pradesh', confidence: 81, responses: 2750, flagRate: 3.2, topEnumerators: ['Chandra B.', 'Prasad K.'] }
  };

  const districtStatsTN: Record<string, MapRegion> = {
    'Chennai': { id: 'TN_CH', name: 'Chennai Central', confidence: 86, responses: 1420, flagRate: 1.8, topEnumerators: ['Lakshmi P.', 'Amit V.'] },
    'Coimbatore': { id: 'TN_CO', name: 'Coimbatore Sub', confidence: 81, responses: 1100, flagRate: 2.5, topEnumerators: ['Suresh Kumar', 'Karthik S.'] },
    'Madurai': { id: 'TN_MA', name: 'Madurai East', confidence: 74, responses: 980, flagRate: 4.8, topEnumerators: ['Rajesh Nair', 'Meena K.'] },
    'Salem': { id: 'TN_SA', name: 'Salem Block', confidence: 68, responses: 750, flagRate: 6.2, topEnumerators: ['Kumar G.', 'Arvind S.'] }
  };

  // Live sidebar syncing region info based on drill-down click
  const getCurrentRegionInfo = () => {
    if (zoomLevel === 'state') {
      return stateStats[selectedState] || stateStats['Tamil Nadu'];
    } else if (zoomLevel === 'district') {
      return districtStatsTN[selectedDistrict] || districtStatsTN['Chennai'];
    }
    // Summary view general India
    return {
      id: 'IND',
      name: 'All India Baseline',
      confidence: 80,
      responses: 33640,
      flagRate: 3.8,
      topEnumerators: ['Lakshmi P.', 'Priya Deshmukh', 'Amit V.']
    };
  };

  // 9.3 Custom Exports Builder state management
  const [selectedSurvey, setSelectedSurvey] = useState('PLFS-2026');
  const [selectedExportRegion, setSelectedExportRegion] = useState('Tamil Nadu');
  const [selectedDate, setSelectedDate] = useState('June 2026');
  const [exportThreshold, setExportThreshold] = useState(80);
  const [exportHistory, setExportHistory] = useState<ExportTask[]>([
    {
      id: 'EXP-42',
      filename: 'PLFS_TN_JUNE_CONF80_CLEANSED.csv',
      survey: 'PLFS-2026',
      region: 'Tamil Nadu',
      threshold: 80,
      count: 1204,
      author: 'Amit Verma (SCD Administrator)',
      timestamp: '2026-06-09 11:24:02',
      certified: true
    },
    {
      id: 'EXP-41',
      filename: 'HCES_MH_MAY_CONF70_AUDITED.csv',
      survey: 'HCES-2026',
      region: 'Maharashtra',
      threshold: 70,
      count: 2840,
      author: 'Amit Verma (SCD Administrator)',
      timestamp: '2026-06-05 16:48:15',
      certified: true
    }
  ]);

  const [generatingExport, setGeneratingExport] = useState(false);

  const handleGenerateExport = () => {
    setGeneratingExport(true);
    setTimeout(() => {
      const computedCount = Math.round(Math.random() * 2000) + 500;
      const fileCode = selectedSurvey.slice(0,4) + '_' + selectedExportRegion.replace(' ', '').toUpperCase().slice(0,3) + '_' + Date.now().toString().slice(-4);
      const newTask: ExportTask = {
        id: 'EXP-' + (exportHistory.length + 41),
        filename: `${fileCode}_CONF${exportThreshold}_SQAF_NMDS.csv`,
        survey: selectedSurvey,
        region: selectedExportRegion,
        threshold: exportThreshold,
        count: computedCount,
        author: 'Amit Verma (SCD Administrator)',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        certified: true
      };
      setExportHistory(prev => [newTask, ...prev]);
      setGeneratingExport(false);
      setSuccessToast(`Dataset generated! Cleansed format compiled inside files registry.`);
      setTimeout(() => setSuccessToast(''), 4000);
    }, 1500);
  };

  // Load from local model APIs
  useEffect(() => {
    loadSCDData();

    // Redis / WebSocket dynamic simulations
    const timer = setInterval(() => {
      if (isWebSocketActive) {
        // Randomly simulate real time additions to today's response counts
        setMetrics(prev => ({
          ...prev,
          responsesToday: prev.responsesToday + (Math.random() > 0.8 ? 1 : 0)
        }));
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [isWebSocketActive, minConfSlider]);

  const loadSCDData = async () => {
    // Re-verify responses against slider logic
    const res = await api.getNationalMetrics(minConfSlider);
    setMetrics({
      responsesToday: res.responsesToday,
      flaggedCount: res.flaggedCount,
      avgConfidence: res.avgConfidence,
      activeEnumerators: res.activeEnumerators
    });
    setFilteredResponses(res.filteredResponses);

    const raw = await api.getResponses();
    setDbResponses(raw);

    const enums = await api.getEnumerators();
    setLeaderboard(enums);
  };

  const forceWSReconnect = () => {
    setIsWebSocketActive(true);
    setSuccessToast('Real-time WebSocket socket pipeline established successfully!');
    setTimeout(() => setSuccessToast(''), 3000);
  };

  // Computations for 9.1 sliding limits recomputes
  // Let's emulate 1204 responses total scaling factor for realistic high-volume displays
  const scaleRatio = 12.5; 
  const totalSimulated = Math.round(dbResponses.length * scaleRatio);
  const includedSimulated = Math.round(filteredResponses.length * scaleRatio);
  const excludedSimulated = Math.max(0, totalSimulated - includedSimulated);

  // 9.3 CSV charts download helper
  const handleDownloadChartCSV = (chartTitle: string, payload: any[]) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Label,Count/Value\n";
    payload.forEach(row => {
      csvContent += `"${row.name || row.range || row.name_en || row.id}","${row.count || row.TrustScore || row.confidenceScore || 0}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SATARK_Export_${chartTitle.replace(' ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setSuccessToast(`CSV dataset exported for: ${chartTitle}`);
    setTimeout(() => setSuccessToast(''), 3500);
  };

  return (
    <div className="space-y-6 text-left" id="scd-workspace-main">
      
      {/* SVG Pattern Definitions for color-blind accessibilities */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          <pattern id="diagonal-stripes-red" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="2.5" />
            <rect width="8" height="8" fill="#fef2f2" className="opacity-40" />
          </pattern>
          <pattern id="cross-stripes-amber" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#f59e0b" strokeWidth="2" />
            <rect width="10" height="10" fill="#fffbeb" className="opacity-40" />
          </pattern>
          <pattern id="dotted-matrix-green" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.5" fill="#10b981" />
            <rect width="6" height="6" fill="#f0fdf4" className="opacity-40" />
          </pattern>
        </defs>
      </svg>

      {/* Global GoI Style Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-150 flex items-center justify-center font-black text-indigo-700 shadow-inner">
              <LayoutDashboard className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-950 tracking-tight flex items-center gap-1.5">
                {t.scd_command_title}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">National survey assurance live terminal & high-volume policy filtering</p>
            </div>
          </div>
        </div>

        {/* Global tab controllers */}
        <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-xl gap-1.5 text-xs font-bold w-full md:w-auto">
          <button
            onClick={() => setActiveSubTab('command')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-center font-bold tracking-tight text-[10px] uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'command' 
                ? 'bg-indigo-950 text-white shadow-md' 
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
            }`}
          >
            Live Command Feed
          </button>
          <button
            onClick={() => setActiveSubTab('map')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-center font-bold tracking-tight text-[10px] uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'map' 
                ? 'bg-indigo-950 text-white shadow-md' 
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
            }`}
          >
            Geographic Coverage Map
          </button>
          <button
            onClick={() => setActiveSubTab('analytics')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-center font-bold tracking-tight text-[10px] uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'analytics' 
                ? 'bg-indigo-950 text-white shadow-md' 
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
            }`}
          >
            Trust Analytics
          </button>
          <button
            onClick={() => setActiveSubTab('exports')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-lg text-center font-bold tracking-tight text-[10px] uppercase transition-all whitespace-nowrap ${
              activeSubTab === 'exports' 
                ? 'bg-indigo-950 text-white shadow-md' 
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
            }`}
          >
            Cleansed Data Exports
          </button>
        </div>
      </header>

      {/* Toast Notification Alert Area (Green UI Banner) */}
      {successToast && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-250 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-slideDown">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast('')} className="text-emerald-700 hover:text-emerald-900 font-bold font-mono">×</button>
        </div>
      )}

      {/* ======================================================== */}
      {/* KPI METRICS HEADER ROW (WS/REDIS COMPLIANT - ROW 1) */}
      {/* ======================================================== */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden text-left">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.metricsResponses}</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-950 font-mono tracking-tight gap-1.5 flex items-baseline">
            {metrics.responsesToday}
            <span className="text-[10px] text-emerald-600 font-bold font-sans animate-pulse">● Live</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">WS telemetry streaming from 32 field regions</p>
        </div>

        {/* KPI 2 */}
        <div className={`p-5 rounded-2xl border shadow-sm relative transition-all text-left ${
          metrics.flaggedCount > 0 ? 'bg-rose-50/70 border-rose-220 text-rose-950' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-1">
            <span className={`text-[10px] font-black uppercase tracking-widest ${
              metrics.flaggedCount > 0 ? 'text-rose-700' : 'text-slate-400'
            }`}>{t.metricsFlagged}</span>
            <AlertTriangle className={`w-4 h-4 ${metrics.flaggedCount > 0 ? 'text-rose-600 animate-bounce' : 'text-slate-400'}`} />
          </div>
          <div className="text-3xl font-extrabold font-mono tracking-tight">{metrics.flaggedCount}</div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">Critical anomalies routed to validation queues</p>
          {metrics.flaggedCount > 0 && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          )}
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.metricsAvgConfidence}</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-950 font-mono tracking-tight">{metrics.avgConfidence}%</div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">National weighted safety score average</p>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.metricsActive}</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-950 font-mono tracking-tight">244</div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">Device sessions reporting active today</p>
        </div>

      </section>

      {/* ======================================================== */}
      {/* SECTION 9.1: LIVE COMMAND FEED & LEADERBOARD MAIN TAB */}
      {/* ======================================================== */}
      {activeSubTab === 'command' && (
        <div className="space-y-6">
          
          {/* Row 2 split: Left flag feed 55%, Right trust leaderboard 45% */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Live Flag feed panel (55% width) */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 tracking-tight flex items-center gap-1.5 uppercase">
                    <Radio className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
                    Live Quality Flag Feed
                  </h3>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">Continuous validation telemetry from national database stream</p>
                </div>

                {/* Websocket system indicators & controllers */}
                <div className="flex items-center gap-1.5">
                  {!isWebSocketActive ? (
                    <button 
                      onClick={forceWSReconnect}
                      className="px-2.5 py-1 bg-amber-500/10 border border-amber-300 text-amber-700 text-[10px] rounded-lg font-black animate-pulse flex items-center gap-1"
                    >
                      <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      Reconnecting — polling every 3s
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                        <Wifi className="w-3 h-3 text-emerald-600" /> WebSockets Connected
                      </span>
                      <button 
                        onClick={() => triggerMockWebSocketFlag()}
                        className="p-1 text-slate-500 hover:text-indigo-800 hover:bg-slate-50 rounded-lg text-[9px] border font-bold flex items-center gap-1"
                        title="Force mock WebSocket incident event ingestion"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-500 animate-spin" /> Ingest Flag
                      </button>
                    </div>
                  )}

                  {/* Controller toggle */}
                  <button
                    onClick={() => setIsWebSocketActive(!isWebSocketActive)}
                    className="p-1 border border-slate-205 rounded hover:bg-slate-50 font-bold text-[9px]"
                    title="Toggle simulated client socket connection status"
                  >
                    {isWebSocketActive ? "Kill WS" : "Boots WS"}
                  </button>
                </div>
              </div>

              {/* Incidents feed stack */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {incidents.map((inc, index) => (
                  <div
                    key={inc.id + index}
                    onClick={() => {
                      // Lookup database response to load DPD drilldown modal format
                      const foundResp = dbResponses.find(r => r.id === inc.id) || dbResponses[0];
                      setDrilledResponse(foundResp);
                    }}
                    className={`p-3 bg-slate-50/60 hover:bg-indigo-50/15 border border-slate-200 hover:border-indigo-900 rounded-xl cursor-pointer text-xs flex gap-3 items-start transition-all animate-fadeIn ${
                      index === 0 ? 'border-l-4 border-l-rose-500' : ''
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 mt-1.5 animate-pulse" />
                    
                    <div className="space-y-1.5 flex-1">
                      <div className="flex justify-between items-start gap-4">
                        <span className="font-black text-slate-800">
                          {inc.enumeratorName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 font-mono">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {index === 0 ? 'Just now' : index === 1 ? '2 mins ago' : '5 mins ago'}
                        </div>
                      </div>

                      <p className="text-slate-600 leading-relaxed font-medium">"{inc.reason}"</p>
                      
                      <div className="flex justify-between items-center text-[10px] border-t border-slate-100/80 pt-1.5 mt-1 font-semibold">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 border border-slate-150 py-0.5 px-2 rounded-full font-mono text-[9px]">
                            {inc.surveyName}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500 font-mono text-[9px]">ID: #{inc.id}</span>
                        </div>

                        {/* ReasonPopover triggers custom popup */}
                        <ReasonPopover 
                          reason={inc.reason} 
                          ruleSource={`${inc.surveyName}-QUALITY-Z2`} 
                          timestamp={inc.timestamp}
                        >
                          <span className={`px-2 py-0.5 rounded font-black uppercase text-[9px] ${
                            inc.confidence >= 80 ? 'bg-emerald-50 text-emerald-800' :
                            inc.confidence >= 50 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800 animate-pulse'
                          }`}>
                            Confidence: {inc.confidence}%
                          </span>
                        </ReasonPopover>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-100/50 p-2 text-center rounded-lg text-[10.5px] text-slate-500 font-medium italic">
                * Click any card row above to deploy the read-only DPD Drilldown validation console.
              </div>
            </div>

            {/* Enumerator Trust Leaderboard (45% width) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 tracking-tight uppercase">
                  Enumerator Trust Leaderboard
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Regional active enumerators. Bottom-5 marked with fabrication warnings</p>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {leaderboard.map((enumItem, idx) => {
                  // Pre-program bottom list identifiers for testing
                  const isBottomFive = enumItem.trustScore < 70; 

                  return (
                    <div 
                      key={enumItem.id}
                      className={`p-2.5 rounded-xl border flex justify-between items-center text-xs transition-all ${
                        isBottomFive 
                          ? 'bg-rose-50/45 border-rose-200/60 shadow-inner' 
                          : 'bg-white border-slate-150'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 font-mono text-[10px] font-black rounded-full flex items-center justify-center ${
                          idx < 3 ? 'bg-indigo-950 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          #{idx + 1}
                        </span>
                        
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {enumItem.name}
                            {isBottomFive && (
                              <span className="bg-rose-200 text-rose-800 text-[8px] font-black uppercase px-1 rounded animate-pulse">
                                Auditing
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold">{enumItem.region}</div>
                        </div>
                      </div>

                      {/* Sparkline visualization column */}
                      <div className="w-16 h-8 text-right font-medium">
                        <svg className="w-full h-full stroke-indigo-650 stroke-2 fill-none" viewBox="0 0 50 20">
                          <polyline 
                            points={enumItem.sparkline.map((val, key) => `${(key / 6) * 45 + 2.5},${20 - (val / 100) * 16 - 2}`).join(' ')} 
                            stroke={isBottomFive ? '#f43f5e' : '#4f46e5'}
                          />
                        </svg>
                      </div>

                      <div className="text-right">
                        <TrustBadge 
                          score={enumItem.trustScore} 
                          band={enumItem.trustScore >= 80 ? 'Green' : enumItem.trustScore >= 50 ? 'Amber' : 'Red'} 
                          isColorBlind={isColorBlind} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-right text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Total surveyed: 24 active sessions in progress
              </div>
            </div>

          </section>

          {/* Row 3: Live GIS mapping + Slider aggregates integration */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-left">
            
            {/* Slider aggregations control */}
            <div className="p-4 bg-indigo-950/5 border border-indigo-200/50 rounded-xl space-y-3.5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-indigo-100/50 pb-2.5">
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">National Trust Filtering Threshold</h4>
                  <p className="text-[10px] text-slate-500 font-semibold italic mt-0.5">Instantly adjust minimum acceptable confidence limits for state aggregates</p>
                </div>
                
                {/* Dynamically recalculated aggregate stats */}
                <span className="bg-indigo-950 text-white font-mono text-[11px] font-black px-3 py-1.5 rounded-lg shadow-sm">
                  At ≥{minConfSlider}% Confidence: {includedSimulated} included · {excludedSimulated} excluded
                </span>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-slate-400">0%</span>
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={minConfSlider}
                  onChange={e => setMinConfSlider(Number(e.target.value))}
                  className="flex-1 accent-indigo-950 cursor-ew-resize h-2 bg-slate-200 rounded-lg appearance-none"
                />
                <span className="font-mono text-xs text-slate-400">100%</span>
                
                <div className="bg-white border border-slate-250 py-1.5 px-3 rounded-lg text-xs font-mono font-black shadow-sm shrink-0">
                  Cutoff Limit: {minConfSlider}%
                </div>
              </div>

              <p className="text-[10.5px] text-slate-500 font-semibold italic">
                Caption constraint: <strong className="text-slate-800">"Untrusted data excluded by construction."</strong>
              </p>
            </div>

            {/* Quick interactive shortcut mapping preview */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-3 items-center">
              
              <div className="md:col-span-8 p-3 bg-slate-50 rounded-xl border flex flex-col justify-between relative overflow-hidden animate-fadeIn" style={{ minHeight: '280px' }}>
                <div className="z-10 text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded font-bold font-mono self-start border flex items-center gap-1.5 mb-2">
                  <span className="p-1 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                  National GIS coordinate plot coordinates
                </div>

                <div className="w-full relative h-[180px] mb-2">
                  <LeafletMap 
                    center={[13.0827, 80.2707]} 
                    zoom={11} 
                    height="180px"
                    markers={filteredResponses.slice(0, 15).map((gps, idx) => ({
                      id: gps.id || `home-${idx}`,
                      lat: gps.paradata.gpsLat || (13.0827 + (idx * 0.005 - 0.035)),
                      lng: gps.paradata.gpsLng || (80.2707 + (idx * 0.006 - 0.042)),
                      title: `Household ${gps.id}`,
                      subtitle: `NIC Sector Code: ${gps.nicCode} | Occupation: ${gps.occupation}`,
                      badge: gps.trustBand === 'Red' ? '⚠ Quality Warning' : '✓ Verified Secure',
                      badgeColor: gps.trustBand === 'Red' ? '#E24B4A' : '#1D9E75'
                    }))}
                    onMarkerClick={(id) => {
                      const found = dbResponses.find(r => r.id === id);
                      if (found) setDrilledResponse(found);
                    }}
                  />
                </div>

                <div className="z-10 flex justify-between items-center text-[10.5px] text-slate-500 font-mono font-bold">
                  <span>Tamil Nadu Stratum Zone bounds: 13.08° N / 80.27° E</span>
                  <button 
                    onClick={() => setActiveSubTab('map')}
                    className="text-xs text-[#14387F] hover:underline font-bold flex items-center gap-1"
                  >
                    Load GIS Map view <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 p-4 bg-white border border-slate-205 rounded-xl space-y-3">
                <span className="text-[9px] font-black text-rose-600 tracking-wider uppercase block">Anomalous Outlier Coordinates</span>
                
                <div className="space-y-2 text-[11px]">
                  <div className="p-2 bg-rose-50/50 border border-thin border-rose-150 rounded flex justify-between justify-items-center">
                    <span className="font-bold text-rose-900 font-mono">HH-TN-43-A1</span>
                    <span className="text-slate-500">Mismatched LGD cell ID (Red)</span>
                  </div>
                  <div className="p-2 bg-rose-50/50 border border-thin border-rose-150 rounded flex justify-between justify-items-center">
                    <span className="font-bold text-rose-900 font-mono">HH-TN-44-C3</span>
                    <span className="text-slate-500">Speeding straight-line alert</span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  * GIS telemetry is stored cryptographically to comply with regional and National GoI security standards.
                </p>
              </div>

            </div>

          </section>

        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 9.2: INTERACTIVE GEOGRAPHIC COVERAGE ZOOM MAP */}
      {/* ======================================================== */}
      {activeSubTab === 'map' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="map-workspace-tab">
          
          {/* Main Map Box & filters (65% width) */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            
            {/* Map Filters bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-150">
              <div className="flex flex-wrap items-center gap-3">
                
                {/* Pincode search filter */}
                <div className="relative text-xs">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Enter pincode (e.g. 600001)..."
                    value={pinFilter}
                    onChange={e => setPinFilter(e.target.value)}
                    className="p-1.5 pl-7 border border-slate-205 rounded-lg text-[11px] font-bold focus:outline-indigo-500 bg-white"
                  />
                </div>

                {/* Industry filtering uses NIC descriptions */}
                <div className="text-xs">
                  <select
                    value={nicFilter}
                    onChange={e => setNicFilter(e.target.value)}
                    className="p-1.5 border border-slate-205 rounded-lg text-[11px] font-bold bg-white focus:outline-indigo-500"
                  >
                    <option value="ALL">All NIC Industry Sectors</option>
                    <option value="NIC_A">Section A: Agriculture, Forestry & Fishing</option>
                    <option value="NIC_C">Section C: Manufacturing Industries</option>
                    <option value="NIC_G">Section G: Wholesale & Retail Trade</option>
                    <option value="NIC_I">Section I: Accommodation & Food Services</option>
                  </select>
                </div>
              </div>

              {/* Breadcrumb path indicator */}
              <div className="flex items-center text-[10px] font-black text-indigo-950 uppercase tracking-wider font-mono">
                <span 
                  className="cursor-pointer hover:underline"
                  onClick={() => { setZoomLevel('country'); }}
                >
                  India
                </span>
                {(zoomLevel === 'state' || zoomLevel === 'district') && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 inline mx-1" />
                    <span 
                      className="cursor-pointer hover:underline"
                      onClick={() => { setZoomLevel('state'); }}
                    >
                      {selectedState}
                    </span>
                  </>
                )}
                {zoomLevel === 'district' && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 inline mx-1" />
                    <span 
                      className="cursor-pointer hover:underline"
                    >
                      {selectedDistrict}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Render Map SVGs based on current zoomLevel */}
            <div className="border border-slate-150 rounded-xl bg-slate-50/50 p-4 relative min-h-[380px] flex items-center justify-center">
              
              {zoomLevel === 'country' && (
                <div className="w-full text-center space-y-3">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Interactive National Choropleth Map (Avg Confidence Rating)
                  </div>
                  
                  {/* Styled geographical polygon bounds represent states of India */}
                  <div className="max-w-[420px] mx-auto">
                    <svg viewBox="0 0 400 400" className="w-full h-auto drop-shadow-xl" role="img" aria-label="India National map choropleth view">
                      {/* State definitions */}
                      {Object.entries(stateStats).map(([stateName, info]) => {
                        // Coordinates map simple polygons
                        let points = "";
                        if (stateName === 'Rajasthan') points = "100,105 135,110 145,145 105,155 85,130";
                        else if (stateName === 'Gujarat') points = "65,155 95,155 105,185 80,195 55,175";
                        else if (stateName === 'Maharashtra') points = "95,195 155,195 165,245 125,245 95,225";
                        else if (stateName === 'Uttar Pradesh') points = "145,115 210,105 225,135 175,155 145,135";
                        else if (stateName === 'West Bengal') points = "265,145 285,145 295,195 275,205 255,175";
                        else if (stateName === 'Odisha') points = "205,195 245,185 260,235 220,245";
                        else if (stateName === 'Karnataka') points = "105,245 145,245 145,315 115,315";
                        else if (stateName === 'Tamil Nadu') points = "135,315 175,315 165,385 130,375";
                        else if (stateName === 'Kerala') points = "115,315 135,315 130,375 110,365";
                        else points = "145,245 195,245 175,315 145,315"; // Andhra Pradesh

                        // Flat Fill logic vs colorblind pattern fill logic
                        let strokeColor = "#cbd5e1";
                        let fillVal = "#10b981"; // high conf (green)
                        
                        if (info.confidence < 70) {
                          // Red
                          fillVal = isColorBlind ? "url(#diagonal-stripes-red)" : "#ef4444";
                        } else if (info.confidence < 80) {
                          // Amber
                          fillVal = isColorBlind ? "url(#cross-stripes-amber)" : "#fbbf24";
                        } else {
                          // Green
                          fillVal = isColorBlind ? "url(#dotted-matrix-green)" : "#10b981";
                        }

                        const isSelected = selectedState === stateName;

                        return (
                          <g key={stateName} className="cursor-pointer group" onClick={() => {
                            setSelectedState(stateName);
                            setZoomLevel('state');
                          }}>
                            <polygon
                              points={points}
                              fill={fillVal}
                              stroke={isSelected ? "#1e1b4b" : strokeColor}
                              strokeWidth={isSelected ? "3" : "1"}
                              className="transition-all duration-150 hover:opacity-85 hover:stroke-indigo-950"
                            />
                            
                            {/* Simple text centroid coordinates */}
                            <text 
                              x={Number(points.split(' ')[0].split(',')[0]) + 15}
                              y={Number(points.split(' ')[0].split(',')[1]) + 15}
                              className="fill-slate-900 font-mono text-[8px] font-black pointer-events-none text-center"
                            >
                              {info.id}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <p className="text-[10px] text-slate-500 max-w-sm mx-auto font-medium">
                    * Interactive Vector graphic displaying 10 baseline survey territories. Click any state boundary to drill-down into district grids.
                  </p>
                </div>
              )}

              {zoomLevel === 'state' && (
                <div className="w-full text-center space-y-4">
                  <div className="text-[10.5px] font-black text-slate-700 tracking-wide uppercase">
                    Districts inside {selectedState} Region (Choropleth Mode)
                  </div>

                  <div className="max-w-[340px] mx-auto grid grid-cols-2 gap-4">
                    {Object.entries(districtStatsTN).map(([distName, info]) => {
                      let bg = "bg-emerald-50 border-emerald-300 text-emerald-950";
                      
                      if (info.confidence < 70) bg = "bg-rose-50 border-rose-300 text-rose-950";
                      else if (info.confidence < 80) bg = "bg-amber-50 border-amber-300 text-amber-950";

                      return (
                        <div
                          key={distName}
                          onClick={() => {
                            setSelectedDistrict(distName);
                            setZoomLevel('district');
                          }}
                          className={`p-4 border-2 rounded-2xl cursor-pointer text-left shadow-sm hover:ring-2 hover:ring-indigo-950 transition-all ${
                            selectedDistrict === distName ? 'border-indigo-950 ring-2 ring-indigo-200' : ''
                          } ${bg}`}
                        >
                          <span className="font-mono text-[9px] font-black block text-slate-500 uppercase tracking-widest">
                            LGD ID: {info.id}
                          </span>
                          <h4 className="text-xs font-black mt-1 font-sans">{info.name}</h4>
                          <p className="text-[10px] mt-2 font-bold">Conf: <strong className="font-mono">{info.confidence}%</strong></p>
                          <p className="text-[9.5px] text-slate-500 mt-1 font-semibold">{info.responses} active returns</p>
                        </div>
                      );
                    })}
                  </div>

                  <button 
                    onClick={() => setZoomLevel('country')}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10.5px] font-extrabold rounded-lg inline-flex items-center gap-1.5 transition-colors border"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back to India map
                  </button>
                </div>
              )}

              {zoomLevel === 'district' && (
                <div className="w-full text-center space-y-4 animate-fadeIn">
                  <div className="text-[11px] font-black text-indigo-950 uppercase tracking-wide">
                    Respondent LGD Dot Map: {selectedState} &rarr; {selectedDistrict}
                  </div>

                  {/* Leaflet Live Map Integration */}
                  <div className="w-full relative h-[320px]">
                    <LeafletMap 
                      center={[13.0827, 80.2707]} 
                      zoom={13} 
                      height="320px"
                      markers={dbResponses
                        .filter(item => !pinFilter || item.id.includes(pinFilter))
                        .map((item, idx) => ({
                          id: item.id,
                          lat: item.paradata.gpsLat || (13.0827 + (idx * 0.007 - 0.035)),
                          lng: item.paradata.gpsLng || (80.2707 + (idx * 0.008 - 0.042)),
                          title: `Respondent #${item.id}`,
                          subtitle: `Trust Score: ${item.confidenceScore}% | Occupation: ${item.occupation}`,
                          badge: item.trustBand === 'Red' ? '⚠ Quality Flag' : '✓ Verified Secure',
                          badgeColor: item.trustBand === 'Red' ? '#E24B4A' : '#1D9E75'
                        }))}
                      onMarkerClick={(id) => {
                        const found = dbResponses.find(r => r.id === id);
                        if (found) setDrilledResponse(found);
                      }}
                    />
                  </div>

                  <div className="text-[10.5px] text-slate-500 font-medium">
                    * Interactive OpenStreetMap Layer. Live telemetry is encrypted to secure regional GoI respondent identities.
                  </div>

                  <div className="flex gap-2 justify-center">
                    <button 
                      onClick={() => setZoomLevel('state')}
                      className="px-3 py-1.2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Back to {selectedState} districts
                    </button>
                    <button 
                      onClick={() => setZoomLevel('country')}
                      className="px-3 py-1.2 bg-[#0B2E5E] hover:opacity-90 text-white text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-opacity"
                    >
                      India Overview
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>

          {/* Right Rail Info column syncing selected region (35% width) */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-left">
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Geographic telemetry</span>
              <h3 className="font-extrabold text-sm text-slate-950 font-mono tracking-tight flex items-center gap-1.5 mt-0.5 border-b pb-2">
                <MapPin className="w-4 h-4 text-slate-405 shrink-0" />
                {getCurrentRegionInfo().name}
              </h3>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3.5">
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Cumulative returns</span>
                  <span className="text-base font-extrabold text-slate-900 font-mono">{getCurrentRegionInfo().responses.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Avg scale rating</span>
                  <span className="text-base font-extrabold text-[#10b981] font-mono">{getCurrentRegionInfo().confidence}%</span>
                </div>
              </div>

              <div className="p-3 bg-rose-50/20 border border-rose-100 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-[9px] text-rose-800 font-bold block uppercase">Verification Flag rate</span>
                  <span className="font-mono text-rose-700 font-bold text-center">{getCurrentRegionInfo().flagRate}%</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                  <div className="bg-rose-500 h-full rounded-full" style={{ width: `${getCurrentRegionInfo().flagRate * 10}%` }} />
                </div>
              </div>

              {/* Active enumerators in selection */}
              <div className="space-y-2">
                <span className="text-[9px] text-slate-400 font-black uppercase block tracking-wider">Top Regional Enumerators</span>
                <div className="space-y-1.5">
                  {getCurrentRegionInfo().topEnumerators.map((name, k) => (
                    <div key={k} className="p-2 border border-slate-150 rounded-lg flex items-center justify-between text-[11px] bg-slate-50/50">
                      <div className="flex items-center gap-1.5 text-slate-705 font-bold">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{name}</span>
                      </div>
                      <span className="text-[9.5px] font-mono text-slate-400">Rating: 94%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inter-routing link */}
              <div className="pt-3 border-t">
                <button
                  onClick={() => setActiveSubTab('analytics')}
                  className="w-full py-2 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> View in analytics link
                </button>
              </div>
            </div>
          </aside>

        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 9.3: TRUST ANALYTICS TRAJECTORIES & GRAPHS TAB */}
      {/* ======================================================== */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-6" id="scd-trust-analytics">
          
          <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-950 uppercase">Quality Trajectory Analytics</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Statistical distributions, geographical intervals, and fraud indicators</p>
              </div>
              <span className="text-[11px] text-slate-450 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Log: 14 days historical depth
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Chart A: Distribution histogram */}
              <div className="p-4 bg-slate-50 border rounded-xl font-medium relative text-xs">
                <div className="flex justify-between items-center pb-2.5">
                  <span className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">Respondent quality histogram</span>
                  {/* Download csv mini-action */}
                  <button 
                    onClick={() => handleDownloadChartCSV('Quality_Histogram', [
                      { range: '90-100', count: dbResponses.filter(r => r.confidenceScore >= 90).length },
                      { range: '80-89', count: dbResponses.filter(r => r.confidenceScore >= 80 && r.confidenceScore < 90).length },
                      { range: '60-79', count: dbResponses.filter(r => r.confidenceScore >= 60 && r.confidenceScore < 80).length },
                      { range: '0-59', count: dbResponses.filter(r => r.confidenceScore < 60).length }
                    ])}
                    className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded font-bold uppercase text-[9px] border bg-white inline-flex items-center gap-1"
                    title="Download Excel CSV data"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
                
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { range: '90-100%', count: dbResponses.filter(r => r.confidenceScore >= 90).length },
                      { range: '80-89%', count: dbResponses.filter(r => r.confidenceScore >= 80 && r.confidenceScore < 90).length },
                      { range: '60-79%', count: dbResponses.filter(r => r.confidenceScore >= 60 && r.confidenceScore < 80).length },
                      { range: '40-59%', count: dbResponses.filter(r => r.confidenceScore >= 40 && r.confidenceScore < 60).length },
                      { range: '0-39%', count: dbResponses.filter(r => r.confidenceScore < 40).length }
                    ]} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="range" style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                      <YAxis style={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 10, background: '#1e293b', color: '#fff', borderRadius: '6px' }} />
                      <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={30}>
                        <Cell fill="#10b981" />
                        <Cell fill="#34d399" />
                        <Cell fill="#fbbf24" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#ef4444" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart B: Regional trust trajectories */}
              <div className="p-4 bg-slate-50 border rounded-xl text-xs">
                <div className="flex justify-between items-center pb-2.5">
                  <span className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">Regional trust trajectories over time (Line)</span>
                  <button 
                     onClick={() => handleDownloadChartCSV('Trust_Trajectories', stateStats ? Object.values(stateStats) : [])}
                     className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded uppercase text-[9px] border bg-white inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>

                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[
                      { day: '01/06', 'Tamil Nadu': 82, 'Maharashtra': 88, 'Uttar Pradesh': 58 },
                      { day: '03/06', 'Tamil Nadu': 84, 'Maharashtra': 89, 'Uttar Pradesh': 60 },
                      { day: '05/06', 'Tamil Nadu': 81, 'Maharashtra': 86, 'Uttar Pradesh': 59 },
                      { day: '07/06', 'Tamil Nadu': 85, 'Maharashtra': 91, 'Uttar Pradesh': 62 },
                      { day: '09/06', 'Tamil Nadu': 84, 'Maharashtra': 89, 'Uttar Pradesh': 61 }
                    ]} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="day" style={{ fontSize: 9 }} tickLine={false} />
                      <YAxis style={{ fontSize: 9 }} tickLine={false} domain={[40, 100]} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Line type="monotone" dataKey="Tamil Nadu" stroke="#4f46e5" strokeWidth={2.5} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="Maharashtra" stroke="#10b981" strokeWidth={2.5} />
                      <Line type="monotone" dataKey="Uttar Pradesh" stroke="#ef4444" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart C: Stacked area fraud signal breakdown */}
              <div className="p-4 bg-slate-50 border rounded-xl text-xs md:col-span-2">
                <div className="flex justify-between items-center pb-2.5">
                  <span className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">Fraud Signal Anomaly Breakdown (Daily Stacked Area)</span>
                  <button 
                     onClick={() => handleDownloadChartCSV('Anomalous_Breakdowns', [
                       { id: 'Speeding', val: 34 },
                       { id: 'Straightlining', val: 21 },
                       { id: 'Contradiction', val: 45 }
                     ])}
                     className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded uppercase text-[9px] border bg-white inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                      { day: '01/06', Speeding: 12, StraightLining: 8, CrossField: 15 },
                      { day: '03/06', Speeding: 14, StraightLining: 6, CrossField: 18 },
                      { day: '05/06', Speeding: 9, StraightLining: 11, CrossField: 14 },
                      { day: '07/06', Speeding: 18, StraightLining: 15, CrossField: 22 },
                      { day: '09/06', Speeding: 15, StraightLining: 10, CrossField: 19 }
                    ]} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" style={{ fontSize: 9 }} />
                      <YAxis style={{ fontSize: 9 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Area type="monotone" dataKey="Speeding" stackId="1" stroke="#f43f5e" fill="#fecdd3" />
                      <Area type="monotone" dataKey="StraightLining" stackId="1" stroke="#fbbf24" fill="#fef3c7" />
                      <Area type="monotone" dataKey="CrossField" stackId="1" stroke="#6366f1" fill="#e0e7ff" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 9.3: THE EXPORTS BUILDER & COMPLETED LOGS REGISTRY */}
      {/* ======================================================== */}
      {activeSubTab === 'exports' && (
        <div className="space-y-6" id="exports-workspace-tab">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Pick Parameters Export Card (50% width) */}
            <div className="lg:col-span-6 bg-white border border-slate-205 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="border-b pb-2">
                <h3 className="font-extrabold text-sm text-slate-900 tracking-tight flex items-center gap-1.5 uppercase">
                  <Sliders className="w-4.5 h-4.5 text-indigo-750" />
                  National Export Query Builder
                </h3>
                <p className="text-[10px] text-slate-500 italic mt-0.5">Filter questionnaire arrays, apply confidence weights, and output certified bundles</p>
              </div>

              <div className="space-y-3.5 text-xs font-semibold text-slate-700">
                {/* Survey Selector */}
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block">Pick survey class</label>
                  <select 
                    value={selectedSurvey}
                    onChange={e => setSelectedSurvey(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold focus:outline-indigo-500 bg-slate-50/50"
                  >
                    <option value="PLFS-2026">Periodic Labour Force Survey (PLFS-2026)</option>
                    <option value="HCES-2026">Household Consumer Expenditure Survey (HCES-2026)</option>
                    <option value="ASI-2026">Annual Survey of Industries (ASI-2026)</option>
                  </select>
                </div>

                {/* Territory Selector */}
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block">Pick geographical region scope</label>
                  <select 
                    value={selectedExportRegion}
                    onChange={e => setSelectedExportRegion(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold focus:outline-indigo-500 bg-slate-50/50"
                  >
                    <option value="All India">All India (Consolidated baseline)</option>
                    <option value="Tamil Nadu">Tamil Nadu (Southern cluster zone)</option>
                    <option value="Maharashtra">Maharashtra (Western cluster zone)</option>
                    <option value="Uttar Pradesh">Uttar Pradesh (Northern cluster zone)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {/* Date picker */}
                  <div className="space-y-1">
                    <label className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block">Target month cycle</label>
                    <select 
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold focus:outline-indigo-500 bg-slate-50/50"
                    >
                      <option value="June 2026">June 2026 (Operational)</option>
                      <option value="May 2026">May 2026 (Audited)</option>
                      <option value="April 2026">April 2026 (Frozen)</option>
                    </select>
                  </div>

                  {/* Slider limits */}
                  <div className="space-y-1">
                    <label className="text-slate-500 font-bold uppercase tracking-wider text-[9px] block">Confidence Threshold Cutoff: ≥{exportThreshold}%</label>
                    <input 
                      type="range"
                      min="40"
                      max="95"
                      value={exportThreshold}
                      onChange={e => setExportThreshold(Number(e.target.value))}
                      className="w-full accent-indigo-950 mt-1.5"
                    />
                  </div>
                </div>

                {/* Live row query preview box */}
                <div className="p-3 bg-indigo-50/50 border border-thin border-indigo-150 rounded-xl space-y-1">
                  <span className="text-[10px] text-indigo-950 font-black tracking-widest block uppercase">Live Compilation Preview</span>
                  <div className="text-sm font-bold font-mono text-slate-800">
                    Estimated qualifying dataset: <strong className="text-indigo-900">{Math.round((exportThreshold > 80 ? 1204 : 3402) * (selectedExportRegion === 'All India' ? 2.5 : 1))} lines</strong>
                  </div>
                  <p className="text-[9.5px] text-slate-500 italic mt-0.5">Rows processed & cleared according to National GoI SQAF directives</p>
                </div>

                {/* Generate Button */}
                <div className="pt-2">
                  <button
                    onClick={handleGenerateExport}
                    disabled={generatingExport}
                    className="w-full py-2.5 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:bg-slate-350"
                  >
                    {generatingExport ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        Generating certified CSV dataset...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Generate Cleansed Export File
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Past Exports registry table (50% width) */}
            <div className="lg:col-span-6 bg-white border border-slate-205 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 tracking-tight uppercase">
                  Past Certified Exports Registry
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">National NMDS certified CSV downloads for ministries & third-party planners</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left" role="presentation">
                  <thead className="bg-slate-100 text-[9px] text-slate-500 font-black uppercase tracking-wider border-b">
                    <tr>
                      <th className="px-3 py-2.5">File compilation details</th>
                      <th className="px-3 py-2.5">Rows</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-xs text-slate-600">
                    {exportHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-3 space-y-1">
                          <div className="font-bold text-slate-900 tracking-tight font-mono">{item.filename}</div>
                          <div className="flex items-center gap-2 flex-wrap text-[9px] text-slate-400 font-medium">
                            <span className="bg-sky-50 border text-sky-800 py-0.5 px-1.5 rounded uppercase font-black tracking-widest text-[8px]">
                              SQAF/NMDS Badged
                            </span>
                            <span>Region: {item.region}</span>
                            <span>Cutoff: ≥{item.threshold}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-800">
                          {item.count.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => {
                              alert(`Triggering direct download for system archive asset ID: ${item.id}`);
                            }}
                            className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-indigo-950 rounded border text-[10px] font-bold flex items-center justify-center gap-1.5 ml-auto text-end"
                          >
                            <Download className="w-3 h-3" /> Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 12: DRILLDOWN REVEALER CONSOLE MODAL (READONLY) */}
      {/* ======================================================== */}
      {drilledResponse && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border-2 border-slate-350 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scaleUp text-left">
            
            {/* Modal header */}
            <div className="bg-indigo-950 text-white p-4 flex justify-between items-center">
              <div>
                <span className="text-[10px] bg-indigo-805 text-indigo-200 border border-indigo-700 px-2 py-0.5 rounded font-black font-mono uppercase tracking-widest">
                  MoSPI National Incident Audit Console
                </span>
                <h3 className="text-sm font-black font-mono tracking-tight mt-1">
                  Verbatim file review: #{drilledResponse.id} ({drilledResponse.surveyName})
                </h3>
              </div>
              
              <button 
                onClick={() => setDrilledResponse(null)}
                className="w-8 h-8 rounded-full bg-indigo-900/40 text-indigo-200 hover:text-white flex items-center justify-center font-bold font-mono transition-colors border border-indigo-700"
              >
                ×
              </button>
            </div>

            {/* Modal body content */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[500px]">
              
              {/* Meta indicators */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-xl border">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block">Surveyor name</span>
                  <span className="font-bold text-slate-900 truncate block">{drilledResponse.enumeratorName}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block">Household key</span>
                  <span className="font-bold text-slate-900 font-mono block">{drilledResponse.householdId}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block">National rating</span>
                  <span className="font-bold block text-rose-700 font-mono tracking-wide">{drilledResponse.confidenceScore}% {drilledResponse.trustBand}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block">Audit status</span>
                  <span className="inline-block bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-black uppercase">
                    {drilledResponse.status}
                  </span>
                </div>
              </div>

              {/* Answers block */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-405 uppercase tracking-wide">Respondent Answers list</h4>
                
                <div className="border rounded-xl overflow-hidden divide-y text-xs">
                  {Object.entries(drilledResponse.answers).map(([qId, value]) => {
                    const triggeredRules = drilledResponse.validation.layer5_cross.status === 'fail' && qId === 'Q_INCOME';
                    return (
                      <div key={qId} className={`p-2.5 flex justify-between items-center ${
                        triggeredRules ? 'bg-rose-50/50' : 'bg-white'
                      }`}>
                        <div className="space-y-0.5">
                          <span className="font-mono text-[9px] font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded">{qId}</span>
                          <p className="text-slate-505 font-semibold mt-0.5">
                            {qId === 'Q_OCCUPATION' ? 'What is primary labor status last week?' : 
                             qId === 'Q_INCOME' ? 'Est. Monthly wage / stipend (₹)?' : qId}
                          </p>
                        </div>
                        
                        <div className="text-right">
                          <span className="font-mono font-black text-slate-900">{value.toLocaleString()}</span>
                          {triggeredRules && (
                            <span className="block text-[8.5px] bg-rose-220 text-rose-800 font-black uppercase px-1 rounded mt-1">
                              Fails logical crosscheck
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Paradata block */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-405 uppercase tracking-wide">Paradata Analysis list</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50/50 border rounded-xl">
                    <span className="text-[9px] text-slate-450 uppercase block">Answering velocity median</span>
                    <strong className="font-mono text-slate-800">12.5 seconds per field</strong>
                  </div>
                  <div className="p-3 bg-slate-50/50 border rounded-xl">
                    <span className="text-[9px] text-slate-450 uppercase block">Corrections / back-space count</span>
                    <strong className="font-mono text-slate-800">{drilledResponse.paradata.corrections} times</strong>
                  </div>
                </div>
              </div>

              {/* Five grounds checklist list */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-405 uppercase tracking-wide">The Five Grounds Checklist validation status</h4>
                
                <div className="space-y-1.5 text-xs text-slate-750 font-medium">
                  <div className="p-2 border rounded-lg bg-emerald-50/30 flex justify-between">
                    <span>Completeness & Ranges (Layer 1)</span>
                    <strong className="text-emerald-800 font-black">PASS ✔</strong>
                  </div>
                  <div className="p-2 border rounded-lg bg-emerald-50/30 flex justify-between">
                    <span>LGD Ward Boundaries (Layer 2)</span>
                    <strong className="text-emerald-800 font-black">PASS ✔</strong>
                  </div>
                  <div className="p-2 border rounded-lg bg-rose-50/45 border-rose-200 flex justify-between">
                    <span>Bayesian Strata Outliers (Layer 3)</span>
                    <strong className="text-rose-800 font-black">FAIL ✘</strong>
                  </div>
                  <div className="p-2 border rounded-lg bg-emerald-50/30 flex justify-between">
                    <span>Answering behavior speeds (Layer 4)</span>
                    <strong className="text-emerald-800 font-black">PASS ✔</strong>
                  </div>
                  <div className="p-2 border rounded-lg bg-rose-50/45 border-rose-200 flex justify-between">
                    <span>Cross-Field contradictions (Layer 5)</span>
                    <strong className="text-rose-800 font-black font-mono">FAIL ✘</strong>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal sticky actions bottom */}
            <div className="bg-slate-50 p-4 border-t flex justify-end gap-2 text-xs">
              <span className="text-[10px] text-slate-400 italic self-center mr-auto">
                * View-Only profile mode. Direct resolution requires a DPD workspace login.
              </span>
              <button 
                onClick={() => setDrilledResponse(null)}
                className="px-4 py-2 bg-slate-900 border text-white font-extrabold rounded-xl hover:bg-slate-950 transition-colors"
              >
                Close Incidents Inspector
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
