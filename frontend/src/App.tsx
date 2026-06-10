/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { api } from './api';
import { User, UserRole } from './types';
import { translations } from './i18n';
import { SDRDWorkspace } from './components/SDRDWorkspace';
import { FODWorkspace } from './components/FODWorkspace';
import { DPDWorkspace } from './components/DPDWorkspace';
import { SCDWorkspace } from './components/SCDWorkspace';
import { CollectionClient } from './components/CollectionClient';
import { 
  ShieldAlert, 
  Globe, 
  Eye, 
  HelpCircle, 
  LogOut, 
  LayoutDashboard, 
  Settings, 
  Users, 
  SlidersHorizontal, 
  ClipboardCheck, 
  FolderLock,
  Lock,
  UserCheck2,
  ChevronRight,
  Search,
  Bell,
  User as UserIcon
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(api.getCurrentUser());
  const [lang, setLang] = useState<'en' | 'hi' | 'ta'>('en');
  const [isColorBlind, setIsColorBlind] = useState<boolean>(false);
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'extra'>('normal');

  // Input states for Login Page
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Active Workspace / Tab within Router Session
  // Available tabs: 'scd' (National Monitor), 'sdrd' (Survey Design), 'fod' (Field Ops), 'dpd' (Coding review), 'collect' (Conversational Interview client)
  const [activeTab, setActiveTab] = useState<string>('collect');

  // New states for the right-hand cluster in the masthead header
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const t = translations[lang];

  // Grouped search query mock results database
  const getSearchResults = () => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    
    const results = [];
    
    // Search surveys
    if ('periodic labour force survey plfs'.includes(query)) {
      results.push({ type: 'Survey', label: 'Periodic Labour Force Survey (PLFS)', action: () => { setActiveTab('sdrd'); setSearchQuery(''); } });
    }
    if ('household consumer expenditure survey hces'.includes(query)) {
      results.push({ type: 'Survey', label: 'Household Consumer Expenditure Survey (HCES)', action: () => { setActiveTab('sdrd'); setSearchQuery(''); } });
    }
    
    // Search Enumerators
    if ('lakshmi r'.includes(query)) {
      results.push({ type: 'Enumerator', label: 'Lakshmi R. (Tamil Nadu Cluster)', action: () => { setActiveTab('fod'); setSearchQuery(''); } });
    }
    if ('karthik s'.includes(query)) {
      results.push({ type: 'Enumerator', label: 'Karthik S. (Audit profile flag active)', action: () => { setActiveTab('fod'); setSearchQuery(''); } });
    }

    // Search responses/incidents
    if ('tamil nadu'.includes(query) || 'chennai'.includes(query)) {
      results.push({ type: 'Exception Group', label: 'Chennai District LGD Outliers', action: () => { setActiveTab('scd'); setSearchQuery(''); } });
    }
    if ('outlier'.includes(query) || 'flagged'.includes(query)) {
      results.push({ type: 'Anomalies', label: 'NCO Code 8322 Discrepancies', action: () => { setActiveTab('dpd'); setSearchQuery(''); } });
    }

    return results;
  };

  const handleRoleSwitch = (newRole: UserRole) => {
    if (currentUser) {
      const updatedUser = { ...currentUser, role: newRole };
      setCurrentUser(updatedUser);
      // Auto-route by authorized role
      if (newRole === 'admin') setActiveTab('scd');
      else if (newRole === 'sdrd') setActiveTab('sdrd');
      else if (newRole === 'fod') setActiveTab('fod');
      else if (newRole === 'dpd') setActiveTab('dpd');
      else if (newRole === 'scd') setActiveTab('scd');
      else setActiveTab('collect');
      setIsUserMenuOpen(false);
    }
  };

  const handleLogin = async (prefilledUser?: string) => {
    const loginTarget = prefilledUser || username;
    if (!loginTarget.trim()) {
      setLoginError('Username identifier required');
      return;
    }
    
    try {
      const u = await api.login(loginTarget);
      setCurrentUser(u);
      setLoginError('');
      
      // Auto-route by authorized role
      if (u.role === 'admin') setActiveTab('scd');
      else if (u.role === 'sdrd') setActiveTab('sdrd');
      else if (u.role === 'fod') setActiveTab('fod');
      else if (u.role === 'dpd') setActiveTab('dpd');
      else if (u.role === 'scd') setActiveTab('scd');
      else setActiveTab('collect');
    } catch (e) {
      setLoginError('Authentication verification failed');
    }
  };

  const handleSignout = async () => {
    await api.logout();
    setCurrentUser(null);
    setUsername('');
    setPassword('');
    setActiveTab('collect');
  };

  const applyTextSizeClass = () => {
    if (textSize === 'large') return 'text-[1.1rem]';
    if (textSize === 'extra') return 'text-[1.2rem] pb-4';
    return '';
  };

  return (
    <div className={`min-h-screen bg-[#F7F8FA] flex flex-col font-sans transition-all selection:bg-indigo-100 ${applyTextSizeClass()}`}>
      
      {/* Tricolor GoI portal decoration line (exactly 3px) */}
      <div className="h-[3px] w-full bg-gradient-to-r from-gov-saffron via-white to-gov-green shrink-0" role="presentation" />

      {/* Bilingual Utility Bar (32px) */}
      <div className="bg-slate-900 text-slate-300 text-[11px] h-8 px-6 flex items-center justify-between font-medium border-b border-slate-800 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">भारत सरकार</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Government of India</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#app-workspace-shell" className="hover:text-white transition-all hidden md:inline">Skip to main content</a>
          <span className="text-slate-800 hidden md:inline">|</span>
          
          {/* Custom Font Sizers */}
          <div className="flex items-center gap-2">
            <button onClick={() => setTextSize('normal')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight transition-all uppercase ${textSize === 'normal' ? 'bg-gov-navy text-white font-extrabold' : 'hover:text-white text-slate-400'}`}>A-</button>
            <button onClick={() => setTextSize('large')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight transition-all uppercase ${textSize === 'large' ? 'bg-gov-navy text-white font-extrabold' : 'hover:text-white text-slate-400'}`}>A</button>
            <button onClick={() => setTextSize('extra')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight transition-all uppercase ${textSize === 'extra' ? 'bg-gov-navy text-white font-extrabold' : 'hover:text-white text-slate-400'}`}>A+</button>
          </div>
          
          <span className="text-slate-800">|</span>

          {/* Colorblindness / High Contrast Mode Toggle */}
          <button 
            onClick={() => setIsColorBlind(!isColorBlind)}
            className={`p-1 hover:text-white transition-colors duration-150 flex items-center gap-1.5 ${isColorBlind ? 'text-gov-saffron' : 'text-slate-400'}`}
            title="Toggle contrast & color blind assistance guidelines"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-extrabold hidden sm:inline">Contrast Assist</span>
          </button>

          <span className="text-slate-800">|</span>

          {/* Language selection toggles */}
          <div className="flex items-center gap-1 bg-slate-855 p-0.5 rounded border border-slate-800">
            <button onClick={() => setLang('en')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${lang === 'en' ? 'bg-gov-navy text-white font-extrabold' : 'hover:text-white text-slate-400'}`}>EN</button>
            <button onClick={() => setLang('hi')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${lang === 'hi' ? 'bg-gov-navy text-white font-extrabold' : 'hover:text-white text-slate-400'}`}>हिं</button>
            <button onClick={() => setLang('ta')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${lang === 'ta' ? 'bg-gov-navy text-white font-extrabold' : 'hover:text-white text-slate-400'}`}>த</button>
          </div>
        </div>
      </div>

      {/* Masthead 64px: emblem+ministry | SATARK wordmark | user */}
      <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shadow-sm shrink-0 relative z-40">
        
        {/* Left Side: Ashoka emblem (40px) + 2 line ministry text */}
        <div className="flex items-center gap-3.5">
          <div className="w-8 h-10 border border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-0.5 rounded shadow-inner shrink-0" aria-label="Government Emblem Representation">
            <div className="w-1.5 h-1.5 bg-[#FF9933] rounded-full mb-0.5" />
            <div className="w-3.5 h-4 border border-slate-400 bg-white flex flex-col items-center justify-between flex-1">
              <span className="text-[4px] text-slate-500 uppercase font-black leading-none scale-75">MoSPI</span>
              <div className="w-3 h-1 bg-gov-navy rounded-t" />
            </div>
            <div className="w-5 h-0.5 bg-[#138808] rounded-sm mt-0.5" />
          </div>

          <div className="flex flex-col text-left">
            <span className="text-[9px] sm:text-[11px] font-bold text-[#5A6577] uppercase tracking-wide leading-none">Ministry of Statistics & Programme Implementation</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-base font-black text-[#0B2E5E] tracking-tight leading-none">SATARK</span>
              <span className="text-[10px] text-slate-450 tracking-tight border-l border-slate-300 pl-2 leading-none font-medium hidden sm:inline">
                Adaptive Survey Intelligence & Validation Layer
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Search, Notifications, Language indicator, Avatar User cluster */}
        <div className="flex items-center gap-4">
          
          {/* Global search input (expands on focus, matches items) */}
          {currentUser && (
            <div className="relative hidden md:block">
              <div className={`flex items-center border rounded-xl bg-slate-50 transition-all duration-250 ${
                isSearchFocused ? 'w-80 border-gov-blue ring-1 ring-indigo-100 bg-white' : 'w-64 border-slate-250'
              }`}>
                <Search className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Search surveys / enumerators / codes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => { setIsSearchFocused(true); setIsNotificationOpen(false); setIsUserMenuOpen(false); }}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
                  className="w-full p-2 pl-2 bg-transparent text-xs text-slate-800 focus:outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded mr-1">
                    ×
                  </button>
                )}
              </div>

              {/* Grouped Search Results absolute overlay */}
              {isSearchFocused && searchQuery.trim() && (
                <div className="absolute top-11 right-0 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-55 max-h-[300px] overflow-y-auto p-2 divide-y divide-slate-100">
                  <div className="p-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 rounded-lg">
                    Matching register files
                  </div>
                  {getSearchResults().length === 0 ? (
                    <p className="p-3 text-xs text-slate-450 italic text-center">No record indexes found</p>
                  ) : (
                    getSearchResults().map((res, index) => (
                      <button
                        key={index}
                        onClick={res.action}
                        className="w-full text-left p-2.5 hover:bg-indigo-50/40 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors mt-1"
                      >
                        <span className="text-slate-800">{res.label}</span>
                        <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold uppercase text-slate-500 font-mono">
                          {res.type}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notifications alerts dropdown (with red dot indicator) */}
          {currentUser && (
            <div className="relative">
              <button 
                onClick={() => { setIsNotificationOpen(!isNotificationOpen); setIsUserMenuOpen(false); }}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 relative border border-slate-200/60 transition-colors"
                title="System notifications and safety warnings"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              </button>

              {isNotificationOpen && (
                <div className="absolute right-0 top-11 w-80 bg-white border-2 border-slate-350 rounded-xl shadow-xl z-55 overflow-hidden">
                  <div className="bg-slate-900 p-3 flex justify-between justify-items-center text-white border-b border-slate-800">
                    <span className="text-[10px] uppercase font-black tracking-widest font-mono text-slate-300">MoSPI Incidents Monitor</span>
                    <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 rounded animate-pulse uppercase">3 Warnings</span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100">
                    {/* Notification 1 */}
                    <div className="p-3 hover:bg-slate-50/50 text-left text-xs space-y-1">
                      <div className="flex justify-between font-bold text-rose-800 uppercase tracking-tight text-[9px]">
                        <span>⚠ High velocity speed warning</span>
                        <span>Chennai</span>
                      </div>
                      <p className="text-slate-705 font-medium leading-relaxed">
                        Surveyor Lakshmi R. returns registered <strong className="font-mono text-rose-700">median speed of &lt;5s</strong> representing potential straightline data.
                      </p>
                      <span className="text-[9px] text-slate-400 block font-semibold">2 minutes ago</span>
                    </div>

                    {/* Notification 2 */}
                    <div className="p-3 hover:bg-slate-50/50 text-left text-xs space-y-1">
                      <div className="flex justify-between font-bold text-amber-700 uppercase tracking-tight text-[9px]">
                        <span>⚠ Logical crosscheck error</span>
                        <span>HH-TN-43</span>
                      </div>
                      <p className="text-slate-705 font-medium leading-relaxed">
                        Unemployed household member reported monthly self-employment salary of <strong className="font-mono text-slate-700">₹45,000</strong>.
                      </p>
                      <span className="text-[9px] text-slate-400 block font-semibold">12 minutes ago</span>
                    </div>

                    {/* Notification 3 */}
                    <div className="p-3 hover:bg-slate-50/50 text-left text-xs space-y-1">
                      <div className="flex justify-between font-bold text-indigo-750 uppercase tracking-tight text-[9px]">
                        <span>✔ Rule published successfully</span>
                        <span>SDRD</span>
                      </div>
                      <p className="text-slate-705 font-medium leading-relaxed">
                        Periodic Labour Force Survey (PLFS) questionnaire draft version 1.0.2 compiled and synced.
                      </p>
                      <span className="text-[9px] text-slate-400 block font-semibold">1 hour ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User initials circle + dropdown menu */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => { setIsUserMenuOpen(!isUserMenuOpen); setIsNotificationOpen(false); }}
                className="w-8 h-8 rounded-full bg-gov-navy text-white text-xs font-black flex items-center justify-center border border-slate-350 hover:ring-2 hover:ring-indigo-100 transition-all font-mono uppercase shadow-inner"
              >
                {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('') : 'U'}
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-11 w-64 bg-white border-2 border-slate-300 rounded-xl shadow-xl z-55 p-3.5 space-y-3.5">
                  <div className="border-b pb-2 text-left">
                    <div className="text-xs font-bold text-slate-900">{currentUser.name}</div>
                    <span className="text-[9px] uppercase font-bold text-[#5A6577] block font-mono">UID: #{currentUser.id}</span>
                    <span className="inline-block bg-indigo-50 border border-indigo-150 text-indigo-700 rounded px-1.5 py-0.5 mt-1 text-[9px] font-black uppercase">
                      {currentUser.role} Account
                    </span>
                  </div>

                  {/* Switch Role block */}
                  <div className="space-y-1.5 text-left">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">
                      Role switcher console
                    </span>
                    <div className="grid grid-cols-2 gap-1 bg-slate-50 p-1 rounded-lg border">
                      {[
                        { role: 'sdrd', label: 'SDRD' },
                        { role: 'fod', label: 'FOD' },
                        { role: 'dpd', label: 'DPD' },
                        { role: 'scd', label: 'SCD' }
                      ].map((r) => (
                        <button
                          key={r.role}
                          onClick={() => handleRoleSwitch(r.role as UserRole)}
                          className={`py-1 px-1.5 rounded text-[10px] font-bold font-mono transition-colors border ${
                            currentUser.role === r.role 
                              ? 'bg-[#0B2E5E] text-white border-[#0B2E5E] shadow-sm' 
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sign out */}
                  <button 
                    onClick={handleSignout}
                    className="w-full py-1.5 px-3 bg-rose-50 hover:bg-rose-105 text-rose-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border border-rose-100 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {t.logOut}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 font-mono tracking-tight flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
              Not Authenticated
            </div>
          )}

        </div>
      </header>

      {/* IF GATED: Login Portal layout page */}
      {!currentUser ? (
        <section className="flex-1 flex flex-col justify-center items-center py-10 px-4 bg-slate-50/50">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 space-y-6 shadow-md relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-700" />
            
            <div className="text-center space-y-1.5">
              <span className="text-xs font-black tracking-widest text-indigo-700 uppercase font-mono block">Ministry Credentials Verification</span>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">{t.loginTitle}</h1>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">{t.tagline}</p>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-100 rounded-lg text-xs font-medium flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Login Fields Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="username">{t.username}</label>
                <input 
                  id="username"
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g., sdrd, fod, dpd, scd, admin" 
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1" htmlFor="password">{t.password}</label>
                <input 
                  id="password"
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-indigo-500 transition-colors"
                />
              </div>

              <button 
                onClick={() => handleLogin()}
                className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
              >
                {t.signIn}
              </button>
            </div>

            <hr className="border-slate-100" />

            {/* Role Chips prefill helper (Critical for quick demo scoring) */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                <UserCheck2 className="w-3.5 h-3.5" />
                {t.roleChipHelp}
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {['Admin', 'SDRD', 'FOD', 'DPD', 'SCD'].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      const userStr = r.toLowerCase();
                      setUsername(userStr);
                      setPassword('demo_password');
                      handleLogin(userStr);
                    }}
                    className="py-1 px-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold font-mono shadow-sm transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom DPDP security citation */}
            <div className="border-t border-slate-150 pt-4 text-center">
              <p className="text-[9px] text-slate-400 tracking-tight font-medium uppercase">
                {t.secureNotice}
              </p>
            </div>
          </div>
        </section>
      ) : (
        /* ROUTED CONTEXT APP BAR & WORKSPACES SIDEBAR NAVIGATION */
        <div className="flex-1 flex flex-col md:flex-row items-stretch" id="app-workspace-shell">
          
          {/* LEFT Sidebar navigation panel */}
          <nav className="w-full md:w-64 bg-white border-r border-slate-200 py-4 px-3 flex flex-col gap-5 justify-between shrink-0">
            <div className="space-y-5">
              
              {/* Authorized Badge tag */}
              <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Workspace access</span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <FolderLock className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span>
                    {currentUser.role === 'admin' ? t.role_admin :
                     currentUser.role === 'sdrd' ? t.role_sdrd :
                     currentUser.role === 'fod' ? t.role_fod :
                     currentUser.role === 'dpd' ? t.role_dpd : t.role_scd
                    }
                  </span>
                </div>
              </div>

              {/* Navigation Options Group list shifting by authorized profile */}
              <div className="space-y-1.5" role="tablist">
                
                {/* National Monitor SCD (Authorized roles: admin, scd) */}
                {(currentUser.role === 'admin' || currentUser.role === 'scd') && (
                  <button 
                    onClick={() => setActiveTab('scd')} 
                    className={`w-full text-left py-2 px-3.5 rounded-lg flex items-center justify-between transition-colors ${
                      activeTab === 'scd' ? 'bg-indigo-750 text-white font-bold shadow' : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs'
                    }`}
                    role="tab"
                    aria-selected={activeTab === 'scd'}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <LayoutDashboard className="w-4 h-4" />
                      {t.nationalMonitor}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                )}

                {/* Survey Builder SDRD (Authorized roles: admin, sdrd) */}
                {(currentUser.role === 'admin' || currentUser.role === 'sdrd') && (
                  <button 
                    onClick={() => setActiveTab('sdrd')} 
                    className={`w-full text-left py-2 px-3.5 rounded-lg flex items-center justify-between transition-colors ${
                      activeTab === 'sdrd' ? 'bg-indigo-750 text-white font-bold shadow' : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs'
                    }`}
                    role="tab"
                    aria-selected={activeTab === 'sdrd'}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <Settings className="w-4 h-4" />
                      {t.surveyBuilder}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                )}

                {/* Enumerator FOD (Authorized roles: admin, fod) */}
                {(currentUser.role === 'admin' || currentUser.role === 'fod') && (
                  <button 
                    onClick={() => setActiveTab('fod')} 
                    className={`w-full text-left py-2 px-3.5 rounded-lg flex items-center justify-between transition-colors ${
                      activeTab === 'fod' ? 'bg-indigo-750 text-white font-bold shadow' : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs'
                    }`}
                    role="tab"
                    aria-selected={activeTab === 'fod'}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <Users className="w-4 h-4" />
                      {t.enumeratorOps}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                )}

                {/* Data Coding review DPD (Authorized roles: admin, dpd) */}
                {(currentUser.role === 'admin' || currentUser.role === 'dpd') && (
                  <button 
                    onClick={() => setActiveTab('dpd')} 
                    className={`w-full text-left py-2 px-3.5 rounded-lg flex items-center justify-between transition-colors ${
                      activeTab === 'dpd' ? 'bg-indigo-750 text-white font-bold shadow' : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs'
                    }`}
                    role="tab"
                    aria-selected={activeTab === 'dpd'}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <ClipboardCheck className="w-4 h-4" />
                      {t.dataCoding}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                )}

                {/* SHARED Survey collection client (Available to ALL authenticated users) */}
                <button 
                  onClick={() => setActiveTab('collect')} 
                  className={`w-full text-left py-2 px-3.5 rounded-lg flex items-center justify-between transition-colors ${
                    activeTab === 'collect' ? 'bg-indigo-750 text-white font-bold shadow animate-pulse' : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs'
                  }`}
                  role="tab"
                  aria-selected={activeTab === 'collect'}
                >
                  <span className="flex items-center gap-2 text-xs">
                    <SlidersHorizontal className="w-4 h-4" />
                    {t.role_enumerator}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                </button>

              </div>
            </div>

            {/* Signout Mobile bar helper and credentials */}
            <div className="pt-3 border-t border-slate-100 flex md:hidden items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800">{currentUser.name}</div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{currentUser.role} office</span>
              </div>
              <button 
                onClick={handleSignout} 
                className="px-3 py-1 bg-rose-50 text-rose-600 rounded text-xs font-semibold"
              >
                {t.logOut}
              </button>
            </div>
          </nav>

          {/* MAIN WORKING PANELS CONTAINER */}
          <div className="flex-1 p-4 md:p-6 overflow-y-auto">
            {activeTab === 'scd' && <SCDWorkspace lang={lang} isColorBlind={isColorBlind} />}
            {activeTab === 'sdrd' && <SDRDWorkspace lang={lang} isColorBlind={isColorBlind} onSurveyPublished={() => {}} />}
            {activeTab === 'fod' && <FODWorkspace lang={lang} isColorBlind={isColorBlind} />}
            {activeTab === 'dpd' && <DPDWorkspace lang={lang} isColorBlind={isColorBlind} />}
            {activeTab === 'collect' && <CollectionClient lang={lang} isColorBlind={isColorBlind} onResponseStored={() => {}} />}
          </div>

        </div>
      )}

    </div>
  );
}
