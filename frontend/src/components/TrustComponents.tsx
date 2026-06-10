/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Radio, HelpCircle, WifiOff, RefreshCw } from 'lucide-react';

interface TrustBadgeProps {
  score: number;
  band: 'Green' | 'Amber' | 'Red';
  isColorBlind?: boolean;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ score, band, isColorBlind = false }) => {
  const styles = {
    Green: {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      text: 'Trusted (High Quality)',
      icon: CheckCircle2,
      symbol: '[✔] '
    },
    Amber: {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      text: 'Scrutiny Alert',
      icon: AlertTriangle,
      symbol: '[▲] '
    },
    Red: {
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      text: 'Fabrication Risk',
      icon: AlertCircle,
      symbol: '[✘] '
    }
  };

  const current = styles[band];
  const Icon = current.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${current.bg}`} role="status">
      <Icon className="w-3.5 h-3.5" />
      <span>
        {isColorBlind ? current.symbol : ''}
        {current.text} ({score}%)
      </span>
    </div>
  );
};

interface ReasonPopoverProps {
  reason: string;
  ruleSource?: string;
  timestamp?: string;
  children: React.ReactNode;
}

export const ReasonPopover: React.FC<ReasonPopoverProps> = ({ 
  reason, 
  ruleSource = 'Validation Rule PLFS-26_V1', 
  timestamp = '2026-06-10 05:47:59', 
  children 
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <div className="cursor-help flex items-center gap-0.5">
        {children}
        <span className="text-[10px] text-slate-400 select-none hover:text-indigo-600 font-bold ml-1">ⓘ</span>
      </div>
      
      {visible && (
        <div 
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-[280px] bg-slate-900 text-white text-xs rounded-xl p-3.5 shadow-2xl border border-slate-750 text-left animate-fadeIn font-sans" 
          role="tooltip"
        >
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest text-[#56dbff] pb-1.5 border-b border-slate-800/80">
              <span>Rule / Source</span>
              <span className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[8px] font-mono">{ruleSource}</span>
            </div>
            
            <p className="mt-2 text-slate-205 leading-relaxed font-medium">
              "{reason}"
            </p>
            
            <div className="mt-2.5 pt-1.5 border-t border-slate-800/80 text-[9px] text-slate-450 font-mono flex justify-between items-center">
              <span>System Verified</span>
              <span>{timestamp}</span>
            </div>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-slate-755" />
        </div>
      )}
    </div>
  );
};

interface ConfidenceGaugeProps {
  score: number;
}

export const ConfidenceGauge: React.FC<ConfidenceGaugeProps> = ({ score }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let color = 'stroke-rose-500';
  let bgColor = 'bg-rose-50';
  let textColor = 'text-rose-800';
  let label = 'Unreliable';

  if (score >= 80) {
    color = 'stroke-emerald-600';
    bgColor = 'bg-emerald-50';
    textColor = 'text-emerald-800';
    label = 'Verified';
  } else if (score >= 50) {
    color = 'stroke-amber-500';
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-800';
    label = 'Flagged';
  }

  return (
    <div className={`p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center ${bgColor}`}>
      <div className="relative w-24 h-24">
        {/* SVG gauge arc */}
        <svg className="w-full h-full -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            className="stroke-slate-200"
            strokeWidth="8"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            className={`transition-all duration-1000 ease-out ${color}`}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold font-mono tracking-tight ${textColor}`}>{score}%</span>
          <span className="text-[10px] uppercase font-semibold text-slate-500">Quality</span>
        </div>
      </div>
      <div className={`mt-2 font-semibold text-sm ${textColor}`} aria-label={`Confidence evaluation is ${label}`}>
        {label}
      </div>
    </div>
  );
};

interface ScoreBarProps {
  label: string;
  value: number; // 0-100
  colorClass?: string;
  description: string;
}

export const ScoreBar: React.FC<ScoreBarProps> = ({ label, value, colorClass = "bg-sky-600", description }) => {
  return (
    <div className="space-y-1 py-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-600 font-medium">{label}</span>
        <ReasonPopover reason={description}>
          <span className="font-mono font-bold text-slate-800">{value}%</span>
        </ReasonPopover>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

interface StatusChipProps {
  status: 'pass' | 'fail' | 'warn';
  label: string;
  reason: string;
  isColorBlind?: boolean;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, label, reason, isColorBlind = false }) => {
  const configs = {
    pass: {
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-100',
      icon: CheckCircle2,
      char: '✔'
    },
    fail: {
      bg: 'bg-rose-50 text-rose-800 border-rose-100',
      icon: AlertCircle,
      char: '✘'
    },
    warn: {
      bg: 'bg-amber-50 text-amber-800 border-amber-100',
      icon: AlertTriangle,
      char: '▲'
    }
  };

  const config = configs[status];
  const Icon = config.icon;

  return (
    <ReasonPopover reason={reason}>
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold ${config.bg}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {isColorBlind && <span className="opacity-70 font-mono mr-0.5">[{config.char}]</span>}
        <span>{label}</span>
      </div>
    </ReasonPopover>
  );
};

interface OfflineBannerProps {
  isOffline: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline }) => {
  if (!isOffline) return null;

  return (
    <div className="bg-amber-500 text-white py-2 px-4 shadow-sm text-center font-semibold text-xs flex items-center justify-center gap-2 animate-bounce">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Working offline — responses will queue in local cache (IndexedDB) and sync automatically when network stabilizes.</span>
    </div>
  );
};

interface SyncIndicatorProps {
  offlineCount: number;
  isSyncing: boolean;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ offlineCount, isSyncing }) => {
  if (offlineCount === 0 && !isSyncing) return null;

  return (
    <div className="bg-slate-800 text-white py-1.5 px-3 rounded-lg flex items-center gap-2 text-xs font-mono shadow-md">
      {isSyncing ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>Synchronizing cached returns...</span>
        </>
      ) : (
        <>
          <Radio className="w-3.5 h-3.5 animate-pulse text-amber-400" />
          <span>{offlineCount} surveys queued offline</span>
        </>
      )}
    </div>
  );
};
