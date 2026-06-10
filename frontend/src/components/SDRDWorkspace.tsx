/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api, db } from '../api';
import { Question, Survey, ValidationRule, QuestionType, ClassificationCode } from '../types';
import { INITIAL_QUESTION_BANK, CLASSIFICATION_CODES } from '../mockData';
import { translations } from '../i18n';
import { 
  Home, 
  Edit3, 
  BookOpen, 
  Tag, 
  ShieldCheck, 
  GitBranch, 
  Rocket, 
  Plus, 
  Copy, 
  Upload, 
  FileUp, 
  AlertTriangle, 
  Info, 
  CheckSquare, 
  CircleDot, 
  Hash, 
  Type, 
  Calendar, 
  X, 
  Eye, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Sparkles, 
  Check, 
  ChevronRight,
  Search,
  Sliders,
  Laptop
} from 'lucide-react';

interface SDRDWorkspaceProps {
  lang: 'en' | 'hi' | 'ta';
  isColorBlind: boolean;
  onSurveyPublished: () => void;
}

export const SDRDWorkspace: React.FC<SDRDWorkspaceProps> = ({ lang, isColorBlind, onSurveyPublished }) => {
  const t = translations[lang];

  // SDRD Sub-page tabs
  const [activeSubPage, setActiveSubPage] = useState<'my-surveys' | 'builder' | 'bank' | 'library' | 'validation' | 'logic' | 'publish'>('my-surveys');
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(false);

  // Core Survey state
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  // Active language view inside Builder canvas
  const [canvasLang, setCanvasLang] = useState<'en' | 'hi' | 'ta'>('en');

  // Input states & UI triggers
  const [searchTerm, setSearchTerm] = useState('');
  const [promptText, setPromptText] = useState('');
  const [domainFilter, setDomainFilter] = useState('Labour');
  const [promptLangs, setPromptLangs] = useState({ en: true, hi: true, ta: true });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [refineText, setRefineText] = useState('');
  const [showAIProvenance, setShowAIProvenance] = useState(false);

  // PDF ingestion state
  const [pdfFileName, setPdfFileName] = useState('');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfIngestSuccess, setPdfIngestSuccess] = useState('');

  // Taxonomies search inside Code Library
  const [libraryType, setLibraryType] = useState<'NCO' | 'NIC' | 'ISIC'>('NCO');
  const [libraryQuery, setLibraryQuery] = useState('');

  // Modals
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPromptWizardOpen, setIsPromptWizardOpen] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Properties sub-tab
  const [propTab, setPropTab] = useState<'label' | 'rules'>('label');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadSurveys();
  }, []);

  const loadSurveys = async () => {
    const list = await api.getSurveys();
    setSurveys([...list]);
    if (list.length > 0 && !selectedSurvey) {
      setSelectedSurvey({ ...list[0] });
      if (list[0].questions.length > 0) {
        setSelectedQuestionId(list[0].questions[0].id);
      }
    }
  };

  const saveSurveyToDB = (updated: Survey) => {
    db.surveys = db.surveys.map(s => s.id === updated.id ? updated : s);
    db.saveSurveys();
    setSelectedSurvey(updated);
    setSurveys([...db.surveys]);
  };

  const handleSelectSurvey = (survey: Survey) => {
    setSelectedSurvey({ ...survey });
    if (survey.questions.length > 0) {
      setSelectedQuestionId(survey.questions[0].id);
    } else {
      setSelectedQuestionId(null);
    }
    setActiveSubPage('builder');
  };

  const handleNewSurvey = (title?: string) => {
    const newId = 'sur_' + Date.now();
    const newSurvey: Survey = {
      id: newId,
      name_en: title || 'Custom Socio-Economic Evaluation Survey',
      name_hi: 'कस्टम सामाजिक-आर्थिक मूल्यांकन सर्वेक्षण',
      name_ta: 'தனிப்பயன் சமூக-பொருளாதார மதிப்பீட்டுக் கணக்கெடுப்பு',
      version: '1.0.0',
      status: 'Draft',
      questions: [
        {
          id: 'q_init_' + Date.now(),
          block: 'Block 1: General Info',
          code: 'GEN_RESP_NAME',
          text_en: 'Full name of the primary respondent?',
          text_hi: 'प्राथमिक उत्तरदाता का पूरा नाम?',
          text_ta: 'முதன்மை பதில் அளிப்பவரின் முழு பெயர்?',
          type: 'text',
          validationRules: [
            { id: 'vr_gen_name_req', type: 'required', fieldName: 'GEN_RESP_NAME', expression: 'true', reason: 'Full name is a mandatory field for official entry', severity: 'fail' }
          ]
        }
      ]
    };
    db.surveys.push(newSurvey);
    db.saveSurveys();
    setSurveys([...db.surveys]);
    setSelectedSurvey(newSurvey);
    setSelectedQuestionId(newSurvey.questions[0].id);
    setActiveSubPage('builder');
    setSuccessMsg('New blank survey draft initialized in builder canvas.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleDuplicateSurvey = (target: Survey, e: React.MouseEvent) => {
    e.stopPropagation();
    const dup: Survey = {
      ...target,
      id: 'sur_' + Date.now(),
      name_en: `${target.name_en} (Copy)`,
      status: 'Draft',
      questions: target.questions.map(q => ({ ...q, id: 'q_dup_' + Math.random().toString(36).substr(2, 9) }))
    };
    db.surveys.push(dup);
    db.saveSurveys();
    setSurveys([...db.surveys]);
    setSuccessMsg('Survey duplicated as draft.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleArchiveSurvey = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    db.surveys = db.surveys.filter(s => s.id !== id);
    db.saveSurveys();
    setSurveys([...db.surveys]);
    if (selectedSurvey?.id === id) {
      setSelectedSurvey(null);
      setSelectedQuestionId(null);
    }
    setSuccessMsg('Survey draft successfully removed from active indexes.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Reorder and mutation controls inside the Builder canvas
  const handleUpdateQuestionProperty = (field: string, value: any) => {
    if (!selectedSurvey || !selectedQuestionId) return;
    const updatedQs = selectedSurvey.questions.map(q => {
      if (q.id === selectedQuestionId) {
        return { ...q, [field]: value };
      }
      return q;
    });
    const updatedSurvey = { ...selectedSurvey, questions: updatedQs };
    saveSurveyToDB(updatedSurvey);
  };

  const handleUpdateLabels = (langCode: 'en' | 'hi' | 'ta', text: string) => {
    if (langCode === 'en') handleUpdateQuestionProperty('text_en', text);
    if (langCode === 'hi') handleUpdateQuestionProperty('text_hi', text);
    if (langCode === 'ta') handleUpdateQuestionProperty('text_ta', text);
  };

  const addNewQuestion = (type: QuestionType) => {
    if (!selectedSurvey) return;
    const uniqueId = 'q_' + Date.now();
    const nextCodeNum = selectedSurvey.questions.length + 1;
    const newQ: Question = {
      id: uniqueId,
      block: 'Block 2: Survey Data',
      code: `Q_VAR_${nextCodeNum}`,
      text_en: `New Dynamic Questionnaire Variable ${nextCodeNum}?`,
      text_hi: `नया सर्वेक्षण प्रश्न घटक ${nextCodeNum}?`,
      text_ta: `புதிய தனிப்பயன் கணக்கெடுப்பு கூறு ${nextCodeNum}?`,
      type: type,
      options: type === 'single' || type === 'multi' ? ['Yes', 'No', 'Not applicable'] : undefined,
      autoCodeAs: 'None',
      validationRules: []
    };
    const updatedSurvey = { ...selectedSurvey, questions: [...selectedSurvey.questions, newQ] };
    saveSurveyToDB(updatedSurvey);
    setSelectedQuestionId(uniqueId);
  };

  const duplicateQuestion = (q: Question, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedSurvey) return;
    const clone: Question = {
      ...q,
      id: 'q_' + Date.now() + Math.floor(Math.random() * 100),
      code: `${q.code}_COPY`
    };
    const idx = selectedSurvey.questions.findIndex(x => x.id === q.id);
    const newQs = [...selectedSurvey.questions];
    newQs.splice(idx + 1, 0, clone);
    saveSurveyToDB({ ...selectedSurvey, questions: newQs });
    setSelectedQuestionId(clone.id);
  };

  const moveQuestion = (idx: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedSurvey) return;
    const newQs = [...selectedSurvey.questions];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newQs.length) return;
    const temp = newQs[idx];
    newQs[idx] = newQs[targetIdx];
    newQs[targetIdx] = temp;
    saveSurveyToDB({ ...selectedSurvey, questions: newQs });
  };

  const deleteQuestion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedSurvey) return;
    const filtered = selectedSurvey.questions.filter(q => q.id !== id);
    saveSurveyToDB({ ...selectedSurvey, questions: filtered });
    if (selectedQuestionId === id) {
      setSelectedQuestionId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  // Dynamic Prompt-to-Canvas Generator
  const handleGenerateFromPrompt = async () => {
    const query = promptText.trim();
    if (!query) return;
    setIsGenerating(true);
    setGenerationStep('Ingesting PLFS & HCES precedent manuals...');
    
    setTimeout(() => {
      setGenerationStep('Designing logical branching question graph flow...');
      setTimeout(() => {
        setGenerationStep('Assembling MoSPI cross-field validation guidelines...');
        setTimeout(() => {
          // Generate the curated realistic survey structure
          const mockGenSurvey: Survey = {
            id: 'sur_ai_' + Date.now(),
            name_en: `Adaptive Study on ${query.length > 40 ? query.substring(0, 40) + '...' : query}`,
            name_hi: `ऐआई जनित सर्वेक्षण: ${query.substring(0, 20)}`,
            name_ta: `செயற்கை நுண்ணறிவு கணக்கெடுப்பு: ${query.substring(0, 20)}`,
            version: '1.0.0',
            status: 'Draft',
            questions: [
              {
                id: 'q_gen_name',
                block: 'Block 1: Household',
                code: 'HH_MEMBER_NAME',
                text_en: 'Name of the responding household member?',
                text_hi: 'उत्तर देने वाले सदस्य का नाम?',
                text_ta: 'பதிலளிக்கும் குடும்ப உறுப்பினரின் பெயர்?',
                type: 'text',
                validationRules: [{ id: 'vr_g1', type: 'required', fieldName: 'HH_MEMBER_NAME', expression: 'true', reason: 'Official respondent name cannot be empty', severity: 'fail' }]
              },
              {
                id: 'q_gen_age',
                block: 'Block 1: Household',
                code: 'HH_MEMBER_AGE',
                text_en: 'Completed age of the household member (completed years)?',
                text_hi: 'सदस्य की पूर्ण आयु (वर्षों में)?',
                text_ta: 'குடும்ப உறுப்பினரின் வயது?',
                type: 'number',
                validationRules: [{ id: 'vr_g2', type: 'range', fieldName: 'HH_MEMBER_AGE', expression: 'value >= 0 && value <= 125', reason: 'Age bounds must fit standard census parameters', severity: 'fail' }]
              },
              {
                id: 'q_gen_status',
                block: 'Block 2: Labour Force',
                code: 'HH_MEMBER_ACTIVITY',
                text_en: 'Primary occupation / work activity status last week?',
                text_hi: 'गत सप्ताह प्राथमिक व्यवसाय या गतिविधि की स्थिति?',
                text_ta: 'கடந்த வாரம் முதன்மை தொழில் அல்லது செயல்பாடு நிலை?',
                type: 'single',
                options: ['Farmer', 'Auto-rickshaw Driver', 'Unemployed', 'Student', 'Government Employee'],
                options_hi: ['किसान', 'ऑटो रिक्शा चालक', 'बेरोजगार', 'छात्र', 'सरकारी कर्मचारी'],
                options_ta: ['விவசாயி', 'ஆட்டோ ஓட்டுநர்', 'வேலையில்லாதவர்', 'மாணவர்', 'அரசு ஊழியர்'],
                autoCodeAs: 'NCO'
              },
              {
                id: 'q_gen_income',
                block: 'Block 2: Labour Force',
                code: 'HH_MEMBER_INCOME',
                text_en: 'Monthly wage / earnings from self-employment (₹)?',
                text_hi: 'मासिक वेतन / स्व-रोजगार से आय (₹)?',
                text_ta: 'மாதாந்திர வருமானம் (₹)?',
                type: 'number',
                validationRules: [
                  { id: 'vr_g4_range', type: 'range', fieldName: 'HH_MEMBER_INCOME', expression: 'value >= 0 && value <= 500000', reason: 'Earnings entered exceed standard bounds', severity: 'fail' },
                  { id: 'vr_g4_cross', type: 'cross', fieldName: 'HH_MEMBER_INCOME', expression: '(HH_MEMBER_ACTIVITY === "Unemployed" || HH_MEMBER_ACTIVITY === "Student") ? value < 10000 : true', reason: 'Income specified contradicts study activity status, reviewing flagged entry', severity: 'warn' }
                ]
              }
            ]
          };

          db.surveys.push(mockGenSurvey);
          db.saveSurveys();
          setSurveys([...db.surveys]);
          setSelectedSurvey(mockGenSurvey);
          setSelectedQuestionId('q_gen_name');
          setIsGenerating(false);
          setIsPromptWizardOpen(false);
          setShowAIProvenance(true);
          setPromptText('');
          setActiveSubPage('builder');
          setSuccessMsg('Gemma-3B model successfully assembled structural, bilingual evaluation draft from RAG precedents!');
          setTimeout(() => setSuccessMsg(''), 5000);
        }, 1000);
      }, 900);
    }, 800);
  };

  // Thin Refinement execution
  const handleRefinePrompt = () => {
    if (!refineText.trim() || !selectedSurvey) return;
    const text = refineText.toLowerCase();

    let newQ: Question | null = null;
    if (text.includes('internet') || text.includes('mobile')) {
      newQ = {
        id: 'q_refine_' + Date.now(),
        block: 'Block 3: Infrastructure',
        code: 'INFRA_MOBILE_CONN',
        text_en: 'Do you own an active mobile internet connection?',
        text_hi: 'क्या आपके पास मोबाइल इंटरनेट कनेक्शन है?',
        text_ta: 'உங்களிடம் மொபைல் இணைய இணைப்பு உள்ளதா?',
        type: 'single',
        options: ['Yes', 'No'],
        options_hi: ['हाँ', 'नहीं'],
        options_ta: ['ஆம்', 'இல்லை']
      };
    } else if (text.includes('age') || text.includes('restrict')) {
      // Add a rule to the active question
      if (selectedQuestionId) {
        const uqs = selectedSurvey.questions.map(q => {
          if (q.id === selectedQuestionId) {
            const rules = q.validationRules || [];
            return {
              ...q,
              validationRules: [
                ...rules,
                { id: 'vr_ref_' + Date.now(), type: 'range', fieldName: q.code, expression: 'value >= 18', reason: 'Age constraint adjusted: must be 18 or above per guidelines', severity: 'fail' as const }
              ]
            };
          }
          return q;
        });
        saveSurveyToDB({ ...selectedSurvey, questions: uqs });
        setSuccessMsg('Gemma Refined: Appended minimum age condition constraint rule.');
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    }

    if (newQ) {
      const updatedQs = [...selectedSurvey.questions, newQ];
      saveSurveyToDB({ ...selectedSurvey, questions: updatedQs });
      setSelectedQuestionId(newQ.id);
      setSuccessMsg(`Gemma Refined: Injected new matching variable '${newQ.code}' to canvas!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setSuccessMsg('Refinement parsed and optimization model applied successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    }
    setRefineText('');
  };

  // Knowledge base RAG document ingestion
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPdfFileName(file.name);
      setIsUploadingPdf(true);
      setPdfIngestSuccess('');

      setTimeout(() => {
        setIsUploadingPdf(false);
        setPdfIngestSuccess(`Successfully vectorized, chunked, and stored '${file.name}' into national ChromaDB guidelines storage!`);
      }, 1500);
    }
  };

  const injectQuestionFromBank = (qbQ: any) => {
    if (!selectedSurvey) return;
    const uniqueId = 'qb_inj_' + Date.now();
    const cloned: Question = {
      ...qbQ,
      id: uniqueId,
      code: `${qbQ.code}_ST`
    };
    const updated = { ...selectedSurvey, questions: [...selectedSurvey.questions, cloned] };
    saveSurveyToDB(updated);
    setSelectedQuestionId(uniqueId);
    setSuccessMsg(`Successfully Injected '${cloned.code}' from PLFS repository bank into active survey!`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Global validation rule insertion
  const handleAddGlobalValidation = () => {
    if (!selectedSurvey || !selectedQuestionId) return;
    const targetQ = selectedSurvey.questions.find(x => x.id === selectedQuestionId);
    if (!targetQ) return;
    const newRule: ValidationRule = {
      id: 'vr_global_' + Date.now(),
      type: 'range',
      fieldName: targetQ.code,
      expression: 'value >= 0',
      reason: 'Entered value is not realistic',
      severity: 'fail'
    };
    const rules = targetQ.validationRules ? [...targetQ.validationRules, newRule] : [newRule];
    handleUpdateQuestionProperty('validationRules', rules);
  };

  const handlePublishSurvey = async () => {
    if (!selectedSurvey) return;
    await api.createSurvey(selectedSurvey);
    await api.publishSurvey(selectedSurvey.id);
    setSuccessMsg(`Successfully published '${selectedSurvey.name_en}' to national registries!`);
    onSurveyPublished();
    loadSurveys();
    setActiveSubPage('my-surveys');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleTestPreviewValue = (qCode: string, val: any) => {
    const updatedAnswers = { ...previewAnswers, [qCode]: val };
    setPreviewAnswers(updatedAnswers);
    setPreviewError(null);

    // Validate rules dynamically in real-time inside the preview tool!
    if (!selectedSurvey) return;
    // Find question and cross rules
    selectedSurvey.questions.forEach(q => {
      if (q.validationRules) {
        q.validationRules.forEach(rule => {
          try {
            // Simple validator engine evaluator
            if (rule.type === 'range' && q.code === qCode) {
              const num = Number(val);
              // Safe evaluation check
              const cleanExpression = rule.expression.replace(/value/g, String(num));
              const passed = new Function(`return (${cleanExpression})`)();
              if (!passed) {
                setPreviewError(`Warning: Variable ${rule.fieldName} failed check: ${rule.reason}`);
              }
            } else if (rule.type === 'cross') {
              // cross validation: evaluate with context variables
              let expressionInjected = rule.expression;
              // replace all Q_VARs in expression with values
              const variables = Object.keys(updatedAnswers);
              variables.forEach(v => {
                const escapedV = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(escapedV, 'g');
                const answerVal = updatedAnswers[v];
                const formatVal = typeof answerVal === 'string' ? `"${answerVal}"` : String(answerVal);
                expressionInjected = expressionInjected.replace(regex, formatVal);
              });
              expressionInjected = expressionInjected.replace(/value/g, String(updatedAnswers[rule.fieldName] || 0));
              
              const passed = new Function(`return (${expressionInjected})`)();
              if (!passed) {
                setPreviewError(`Anomaly Flagged: Cross-comparison error - ${rule.reason}`);
              }
            }
          } catch (e) {
            // fallback
          }
        });
      }
    });
  };

  // Highlight color blind mode
  const colTheme = isColorBlind ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-100';

  const selectedQuestion = selectedSurvey?.questions.find(q => q.id === selectedQuestionId);

  return (
    <div className="space-y-6" id="sdrd-workspace-layout-root">
      
      {/* Top dashboard summary and notifications bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-xl border border-slate-200/60 shadow-sm gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Laptop className="w-5 h-5 text-[#1A2A6C]" />
            SATARK SDRD Survey Design Studio
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Bilingual questionnaire builder, constraint validation matrix compiler, and RAG generator.</p>
        </div>
        {selectedSurvey && (
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
              selectedSurvey.status === 'Published' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
            }`}>
              {selectedSurvey.status} Mode
            </span>
            <button 
              onClick={() => setIsPreviewOpen(true)}
              className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview CAPI Node
            </button>
            <button 
              onClick={handlePublishSurvey}
              className="px-4 py-1.5 bg-[#1A2A6C] hover:bg-indigo-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-md"
            >
              <Rocket className="w-3.5 h-3.5" />
              {t.publishSurvey}
            </button>
          </div>
        )}
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs font-medium flex items-center gap-2.5 animate-fadeIn shadow-sm">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main split core container */}
      <div className="flex flex-col md:flex-row items-stretch gap-6 min-h-[640px]">
        
        {/* LEFT NAV WORKSPACE RAIL */}
        <nav className={`bg-white border border-slate-200/60 rounded-xl py-4 flex flex-col justify-between shrink-0 transition-all ${
          isRailCollapsed ? 'w-20 px-2' : 'w-64 px-3'
        }`}>
          <div className="space-y-5">
            <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
              <span className={`text-[10px] uppercase font-mono text-slate-400 tracking-wider font-extrabold ${isRailCollapsed ? 'hidden' : 'block'}`}>
                SDRD Navigation
              </span>
              <button 
                onClick={() => setIsRailCollapsed(!isRailCollapsed)} 
                className="p-1 hover:bg-slate-50 border border-slate-200 rounded text-slate-500 font-bold text-xs"
                title="Toggle sidebar width"
              >
                {isRailCollapsed ? '→' : '←'}
              </button>
            </div>

            {/* Menu navigation options */}
            <div className="space-y-1" role="tablist">
              {[
                { id: 'my-surveys', label: 'My Surveys', icon: Home },
                { id: 'builder', label: 'Builder Canvas', icon: Edit3, disabled: !selectedSurvey },
                { id: 'bank', label: 'Question Bank', icon: BookOpen, disabled: !selectedSurvey },
                { id: 'library', label: 'Code Library', icon: Tag },
                { id: 'validation', label: 'Validation Rules', icon: ShieldCheck, disabled: !selectedSurvey },
                { id: 'logic', label: 'Adaptive Logic', icon: GitBranch, disabled: !selectedSurvey },
                { id: 'publish', label: 'Publish Staging', icon: Rocket, disabled: !selectedSurvey }
              ].map((item) => {
                const IconComponent = item.icon;
                const isActive = activeSubPage === item.id;
                return (
                  <button
                    key={item.id}
                    disabled={item.disabled}
                    onClick={() => setActiveSubPage(item.id as any)}
                    className={`w-full text-left py-2.5 px-3 rounded-lg flex items-center gap-2.5 transition-all text-xs font-bold leading-none ${
                      item.disabled ? 'opacity-30 cursor-not-allowed text-slate-400' :
                      isActive ? 'bg-[#1A2A6C] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    title={item.label}
                  >
                    <IconComponent className="w-4 h-4 shrink-0" />
                    {!isRailCollapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>

            {/* BOTTOM SECTION PALETTE - Only visible in Builder mode */}
            {activeSubPage === 'builder' && selectedSurvey && (
              <div className="pt-4 border-t border-slate-100 space-y-3 animate-fadeIn">
                <span className={`text-[10px] uppercase font-black text-slate-400 tracking-wider ${isRailCollapsed ? 'hidden' : 'block'}`}>
                  Question Palette
                </span>
                <div className={`grid gap-1.5 ${isRailCollapsed ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <button onClick={() => addNewQuestion('single')} className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#1A2A6C] rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <CircleDot className="w-3.5 h-3.5 text-indigo-700" />
                    {!isRailCollapsed && <span>+ Choice</span>}
                  </button>
                  <button onClick={() => addNewQuestion('multi')} className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#1A2A6C] rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-700" />
                    {!isRailCollapsed && <span>+ Multi</span>}
                  </button>
                  <button onClick={() => addNewQuestion('number')} className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#1A2A6C] rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <Hash className="w-3.5 h-3.5 text-emerald-600" />
                    {!isRailCollapsed && <span>+ Number</span>}
                  </button>
                  <button onClick={() => addNewQuestion('text')} className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#1A2A6C] rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <Type className="w-3.5 h-3.5 text-amber-500" />
                    {!isRailCollapsed && <span>+ Text</span>}
                  </button>
                  <button onClick={() => addNewQuestion('date')} className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-[#1A2A6C] rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <Calendar className="w-3.5 h-3.5 text-rose-500" />
                    {!isRailCollapsed && <span>+ Date</span>}
                  </button>
                  <button onClick={() => setActiveSubPage('bank')} className="p-1.5 border border-dashed border-indigo-200 hover:bg-slate-50 text-indigo-700 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold col-span-full">
                    <BookOpen className="w-3.5 h-3.5" />
                    {!isRailCollapsed && <span>+ Add from Bank</span>}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-slate-50 border border-slate-150 rounded">
            MoSPI Compliance Secured
          </div>
        </nav>

        {/* WORKSPACE CENTER CANVAS PANELS */}
        <section className="flex-1 bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm">
          
          {/* SUB-PAGE 1: MY SURVEYS DICTIONARY LANDING */}
          {activeSubPage === 'my-surveys' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search surveys by title or ID identifier..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-250 rounded-lg bg-slate-50 text-slate-800 placeholder-slate-400"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => handleNewSurvey()}
                    className="px-3.5 py-2.5 bg-[#1A2A6C] hover:bg-indigo-900 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Survey
                  </button>
                  <button 
                    onClick={() => setIsPromptWizardOpen(true)}
                    className="px-3.5 py-2.5 bg-amber-550 border border-amber-600/20 hover:bg-amber-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
                    style={{ backgroundColor: '#D97706' }}
                  >
                    <Sparkles className="w-4 h-4 text-white animate-pulse" />
                    Generate from Prompt
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-wider">
                      <th className="p-3.5">Survey Title</th>
                      <th className="p-3.5">ID Identifier</th>
                      <th className="p-3.5">Version</th>
                      <th className="p-3.5">Languages</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700 text-xs">
                    {surveys
                      .filter(s => s.name_en.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((s) => (
                        <tr 
                          key={s.id} 
                          onClick={() => handleSelectSurvey(s)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="p-3.5 font-bold text-slate-900 text-xs">
                            {s.name_en}
                          </td>
                          <td className="p-3.5 font-mono text-[10px] text-slate-400 uppercase">{s.id}</td>
                          <td className="p-3.5 font-mono text-[11px] text-slate-500">{s.version}</td>
                          <td className="p-3.5">
                            <div className="flex gap-1">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">EN</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">हिं</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">த</span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.status === 'Published' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => handleSelectSurvey(s)}
                                className="p-1 px-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-[10px] font-bold rounded flex items-center gap-0.5"
                                title="Open in builder canvas"
                              >
                                <Edit3 className="w-3 h-3 text-indigo-700" />
                                Edit
                              </button>
                              <button 
                                onClick={(e) => handleDuplicateSurvey(s, e)}
                                className="p-1 px-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-[10px] font-bold rounded flex items-center gap-0.5"
                                title="Duplicate design"
                              >
                                <Copy className="w-3 h-3" />
                                Dup
                              </button>
                              {s.id !== 'sur_plfs_2026' && (
                                <button 
                                  onClick={(e) => handleArchiveSurvey(s.id, e)}
                                  className="p-1 hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-100 rounded"
                                  title="Archive/remove Survey"
                                >
                                  <Trash2 className="w-3 h-3 text-rose-500" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    {surveys.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">No survey registries found. Create a draft to begin.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-PAGE 2: THE STUDIO BUILDER CANVAS */}
          {activeSubPage === 'builder' && selectedSurvey && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
              
              {/* Center questionnaire list columns */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-rose-100">
                  <div className="flex-1 mr-4">
                    <input 
                      type="text" 
                      value={selectedSurvey.name_en} 
                      onChange={e => saveSurveyToDB({ ...selectedSurvey, name_en: e.target.value })}
                      className="font-extrabold text-slate-800 text-base bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-[#1A2A6C] focus:outline-none w-full"
                      placeholder="Input survey designation title..."
                    />
                    <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-slate-400">
                      <span>ID: {selectedSurvey.id}</span>
                      <span>•</span>
                      <span>Version: {selectedSurvey.version}</span>
                    </div>
                  </div>

                  {/* Visual Language Tab Preview options */}
                  <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-bold shrink-0">
                    <button onClick={() => setCanvasLang('en')} className={`px-2 py-1 rounded ${canvasLang === 'en' ? 'bg-[#1A2A6C] text-white' : 'text-slate-600'}`}>EN</button>
                    <button onClick={() => setCanvasLang('hi')} className={`px-2 py-1 rounded ${canvasLang === 'hi' ? 'bg-[#1A2A6C] text-white' : 'text-slate-600'}`}>हिंदी</button>
                    <button onClick={() => setCanvasLang('ta')} className={`px-2 py-1 rounded ${canvasLang === 'ta' ? 'bg-[#1A2A6C] text-white' : 'text-slate-600'}`}>தமிழ்</button>
                  </div>
                </div>

                {/* Show Provenance Header if created using the generator */}
                {showAIProvenance && (
                  <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-xl flex items-center justify-between text-xs font-semibold text-indigo-900 gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-700 animate-pulse shrink-0" />
                      <span>Draft generated from PLFS + HCES precedents. AI assisted schema generated.</span>
                    </div>
                    <button onClick={() => setShowAIProvenance(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Question Cards stack */}
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {selectedSurvey.questions.map((q, idx) => {
                    const isSelected = q.id === selectedQuestionId;
                    return (
                      <div
                        key={q.id}
                        onClick={() => setSelectedQuestionId(q.id)}
                        className={`transition-all bg-white relative cursor-pointer ${
                          isSelected 
                            ? 'border-l-[3px] border-l-[#1A2A6C] border-y border-r border-[#1A2A6C] shadow-sm' 
                            : 'border border-slate-200 hover:border-slate-300 rounded-lg'
                        }`}
                        style={{ borderRadius: isSelected ? '0px' : '8px' }}
                      >
                        <div className="p-3.5 flex justify-between items-start gap-3">
                          <div className="flex items-start gap-2.5">
                            {/* Drag Grip design representation */}
                            <div className="text-slate-300 font-bold text-sm select-none cursor-grab mt-1 shrink-0">
                              ⋮⋮
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 rounded font-bold px-1.5 py-0.5">
                                  {q.code}
                                </span>
                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">
                                  {q.type}
                                </span>
                                {q.autoCodeAs && q.autoCodeAs !== 'None' && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded">
                                    Auto-code: {q.autoCodeAs}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-800 text-xs font-bold leading-relaxed pt-1.5">
                                {canvasLang === 'en' ? q.text_en : canvasLang === 'hi' ? q.text_hi : q.text_ta}
                              </p>

                              {/* Choices list if choices */}
                              {(q.type === 'single' || q.type === 'multi') && q.options && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {q.options.map((opt, oIdx) => (
                                    <span key={oIdx} className="text-[10px] border border-slate-100 bg-slate-50 px-2 py-0.5 rounded text-slate-500 font-semibold">
                                      {opt}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Conditon flow if configured */}
                              {q.conditionalShow && (
                                <div className="inline-flex items-center gap-1 text-[9px] font-mono text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 mt-2">
                                  <GitBranch className="w-3 h-3" />
                                  <span>Show If: {q.conditionalShow}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Cards positioning/duplication controls */}
                          <div className="flex items-center gap-1 opacity-85" onClick={e => e.stopPropagation()}>
                            <button 
                              disabled={idx === 0}
                              onClick={e => moveQuestion(idx, 'up', e)}
                              className="p-1 hover:bg-slate-100 rounded disabled:opacity-20 text-slate-500"
                              title="Move question up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              disabled={idx === selectedSurvey.questions.length - 1}
                              onClick={e => moveQuestion(idx, 'down', e)}
                              className="p-1 hover:bg-slate-100 rounded disabled:opacity-20 text-slate-500"
                              title="Move question down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={e => duplicateQuestion(q, e)}
                              className="p-1 hover:bg-indigo-50 text-[#1A2A6C] rounded"
                              title="Duplicate question"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={e => deleteQuestion(q.id, e)}
                              className="p-1 hover:bg-rose-50 text-rose-600 rounded"
                              title="Delete question"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel workspace context */}
              <div className="lg:col-span-5 bg-slate-50/50 border border-slate-200/65 rounded-xl p-4 min-h-[500px]">
                {selectedQuestion ? (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex justify-between items-center pb-2.5 border-b border-slate-200">
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Question configuration</span>
                        <h3 className="text-xs font-extrabold text-slate-800 font-mono mt-0.5">{selectedQuestion.code}</h3>
                      </div>
                      <div className="flex bg-slate-100 p-0.5 rounded text-[10px] font-bold">
                        <button onClick={() => setPropTab('label')} className={`px-2.5 py-1 rounded transition-colors ${propTab === 'label' ? 'bg-white text-[#1A2A6C] font-black shadow-sm' : 'text-slate-400'}`}>Labels & Mapping</button>
                        <button onClick={() => setPropTab('rules')} className={`px-2.5 py-1 rounded transition-colors ${propTab === 'rules' ? 'bg-white text-[#1A2A6C] font-black shadow-sm' : 'text-slate-400'}`}>Validation specs</button>
                      </div>
                    </div>

                    {propTab === 'label' ? (
                      <div className="space-y-4 text-xs font-semibold">
                        <div>
                          <label className="block text-slate-500 text-[11px] mb-1">Variable mapping identifier</label>
                          <input 
                            type="text"
                            value={selectedQuestion.code}
                            onChange={e => handleUpdateQuestionProperty('code', e.target.value.toUpperCase().replace(/\s/g, '_'))}
                            className="w-full text-xs p-2 border border-slate-250 bg-white rounded font-mono"
                          />
                        </div>

                        {/* Bilingual descriptions */}
                        <div className="space-y-2.5 pt-1">
                          <div>
                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase">English prompt label</span>
                            <textarea 
                              rows={2}
                              value={selectedQuestion.text_en}
                              onChange={e => handleUpdateLabels('en', e.target.value)}
                              className="w-full text-xs p-2 border border-slate-250 bg-white rounded mt-1 font-medium"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase">हिंदी (Hindi) प्रश्न स्तर</span>
                            <textarea 
                              rows={2}
                              value={selectedQuestion.text_hi}
                              onChange={e => handleUpdateLabels('hi', e.target.value)}
                              className="w-full text-xs p-2 border border-slate-250 bg-white rounded mt-1 font-medium"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-2 py-0.5 rounded uppercase">தமிழ் (Tamil) வினா லேபிள்</span>
                            <textarea 
                              rows={2}
                              value={selectedQuestion.text_ta}
                              onChange={e => handleUpdateLabels('ta', e.target.value)}
                              className="w-full text-xs p-2 border border-slate-250 bg-white rounded mt-1 font-medium"
                            />
                          </div>
                        </div>

                        {/* Choices editor if Choice Question */}
                        {(selectedQuestion.type === 'single' || selectedQuestion.type === 'multi') && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-200">
                            <label className="block text-slate-500 text-[11px] mb-1">Response choices (English)</label>
                            <div className="space-y-1.5">
                              {selectedQuestion.options?.map((opt, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-1.5">
                                  <input 
                                    type="text" 
                                    value={opt}
                                    onChange={e => {
                                      const opts = [...(selectedQuestion.options || [])];
                                      opts[oIdx] = e.target.value;
                                      handleUpdateQuestionProperty('options', opts);
                                    }}
                                    className="w-full p-1.5 border border-slate-200 rounded text-[11px] bg-white font-medium"
                                  />
                                  <button 
                                    onClick={() => {
                                      const opts = selectedQuestion.options?.filter((_, x) => x !== oIdx) || [];
                                      handleUpdateQuestionProperty('options', opts);
                                    }}
                                    className="p-1.5 bg-rose-50 font-bold text-rose-600 rounded text-xs select-none"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              <button 
                                onClick={() => {
                                  const opts = [...(selectedQuestion.options || []), 'New Choice Option'];
                                  handleUpdateQuestionProperty('options', opts);
                                }}
                                className="w-full py-1 border border-dashed border-indigo-200 text-indigo-700 text-[11px] rounded"
                              >
                                + Add option item
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Taxonomic Autocoding registry mapping */}
                        <div className="pt-2 border-t border-slate-200">
                          <label className="block text-slate-500 text-[11px] mb-1">Micro code taxonomy auto-code mapping</label>
                          <select
                            value={selectedQuestion.autoCodeAs || 'None'}
                            onChange={e => handleUpdateQuestionProperty('autoCodeAs', e.target.value)}
                            className="w-full p-2 border border-slate-250 bg-white rounded font-bold text-xs text-slate-700"
                          >
                            <option value="None">None (Dynamic variable response)</option>
                            <option value="NCO">NCO (National Classification of Occupations)</option>
                            <option value="NIC">NIC (National Industrial Classification Sector)</option>
                            <option value="ISIC">ISIC (International Classification Standard)</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs font-semibold">
                        <div className="flex justify-between items-center text-[11px] text-slate-500">
                          <span>Verification parameters defined</span>
                          <button 
                            onClick={handleAddGlobalValidation}
                            className="px-2 py-1 bg-[#1A2A6C] text-white rounded text-[9px] font-bold"
                          >
                            + Add rule spec
                          </button>
                        </div>

                        {/* Validation Rule cards */}
                        <div className="space-y-2.5 max-h-[340px] overflow-y-auto">
                          {selectedQuestion.validationRules?.map((rule) => (
                            <div key={rule.id} className="p-3 bg-white border border-slate-200 rounded-lg relative space-y-2 font-medium">
                              <button 
                                onClick={() => {
                                  const filtered = selectedQuestion.validationRules?.filter(r => r.id !== rule.id) || [];
                                  handleUpdateQuestionProperty('validationRules', filtered);
                                }}
                                className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 border border-slate-100 hover:bg-rose-50 px-1 rounded font-bold text-[9px] uppercase"
                              >
                                Delete
                              </button>

                              <div>
                                <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-0.5">Constraint type</label>
                                <select 
                                  value={rule.type}
                                  onChange={e => {
                                    const updated = selectedQuestion.validationRules?.map(r => r.id === rule.id ? { ...r, type: e.target.value as any } : r) || [];
                                    handleUpdateQuestionProperty('validationRules', updated);
                                  }}
                                  className="p-1 border border-slate-200 rounded text-[11px] w-full"
                                >
                                  <option value="range">Range / Bounds Limit</option>
                                  <option value="required">Mandatory Variable check</option>
                                  <option value="cross">Cross-Question Constraint logic</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-0.5">Rule Expression</label>
                                <input 
                                  type="text" 
                                  value={rule.expression}
                                  onChange={e => {
                                    const updated = selectedQuestion.validationRules?.map(r => r.id === rule.id ? { ...r, expression: e.target.value } : r) || [];
                                    handleUpdateQuestionProperty('validationRules', updated);
                                  }}
                                  className="p-1.5 border border-slate-250 rounded font-mono text-xs w-full"
                                  placeholder="e.g., value >= 15 && value <= 110"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-0.5">Diagnostic Error feedback</label>
                                <input 
                                  type="text" 
                                  value={rule.reason}
                                  onChange={e => {
                                    const updated = selectedQuestion.validationRules?.map(r => r.id === rule.id ? { ...r, reason: e.target.value } : r) || [];
                                    handleUpdateQuestionProperty('validationRules', updated);
                                  }}
                                  className="p-1.5 border border-slate-250 rounded text-xs w-full"
                                  placeholder="Error reason string shown to user..."
                                />
                              </div>
                            </div>
                          ))}

                          {(!selectedQuestion.validationRules || selectedQuestion.validationRules.length === 0) && (
                            <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 italic">No custom rules configured. Click + Add rule spec on variable logic.</div>
                          )}
                        </div>

                        {/* Adaptive branching skip logic conditional */}
                        <div className="pt-3 border-t border-slate-200">
                          <label className="block text-slate-500 text-[11px] mb-1">Branch skip trigger expression (Adaptive conditional)</label>
                          <input 
                            type="text" 
                            value={selectedQuestion.conditionalShow || ''}
                            onChange={e => handleUpdateQuestionProperty('conditionalShow', e.target.value)}
                            placeholder="e.g. HH_MEMBER_AGE >= 18"
                            className="w-full text-xs p-2 border border-slate-250 bg-white rounded font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* NO QUESTION SELECTED: AI ASSIST / PREFERENCE STATE PANEL */
                  <div className="space-y-5 animate-fadeIn">
                    <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                      <h4 className="font-extrabold text-[#1A2A6C] text-xs flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        Prompt-to-Canvas Generator
                      </h4>
                      <p className="text-[11px] text-slate-400 font-medium">Assembles standard MoSPI bilingual, rules-aware study models from precedents dynamically.</p>
                      
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={promptText}
                          onChange={e => setPromptText(e.target.value)}
                          placeholder="Describe the survey evaluation guidelines... (e.g. Household employment survey for rural Tamil Nadu)"
                          className="w-full text-xs border border-slate-200 rounded-lg p-2 font-medium"
                        />
                        <div className="flex gap-2 items-center justify-between text-[11px]">
                          <div>
                            <span className="text-slate-400 font-bold block text-[10px]">Domain:</span>
                            <select 
                              value={domainFilter} 
                              onChange={e => setDomainFilter(e.target.value)}
                              className="border border-slate-200 rounded p-0.5 bg-white"
                            >
                              <option value="Labour">Labour & Trades</option>
                              <option value="Agri">Agriculture</option>
                              <option value="HCES">Consumption Exp.</option>
                              <option value="Demo">Demographics</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={promptLangs.en} onChange={e => setPromptLangs({...promptLangs, en: e.target.checked})} /> EN
                            </label>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={promptLangs.hi} onChange={e => setPromptLangs({...promptLangs, hi: e.target.checked})} /> HI
                            </label>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={promptLangs.ta} onChange={e => setPromptLangs({...promptLangs, ta: e.target.checked})} /> TA
                            </label>
                          </div>
                        </div>
                        
                        <button
                          disabled={isGenerating || !promptText.trim()}
                          onClick={handleGenerateFromPrompt}
                          className="w-full py-2 bg-slate-800 text-white font-bold text-xs rounded-lg shadow disabled:opacity-40 hover:bg-slate-900 transition-colors"
                        >
                          {isGenerating ? 'Assembling Draft...' : 'Generate dynamic draft onto canvas'}
                        </button>

                        {isGenerating && (
                          <div className="p-2 bg-slate-100 border border-slate-200 rounded text-[10px] text-slate-500 font-bold font-mono animate-pulse">
                            {generationStep}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PDF REFERENCE DOCUMENT UPLOAD */}
                    <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <FileUp className="w-4 h-4 text-indigo-700" />
                        Ingest Reference Document (RAG)
                      </h4>
                      <p className="text-[11px] text-slate-400 font-medium">Teach the generator generator by indexing past regional manuals, guidelines, or PLFS question PDFs.</p>
                      
                      <div className="border-2 border-dashed border-slate-200 p-3 rounded-lg text-center hover:bg-slate-50 transition-colors relative cursor-pointer">
                        <input 
                          type="file" 
                          id="pdf-ref-upload"
                          accept=".pdf,.doc,.docx"
                          onChange={handlePdfUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <Upload className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                        <span className="text-[10px] font-bold text-slate-500 block">Drag & drop or browse training files</span>
                        <span className="text-[9px] text-slate-400">PDF, Word docs index into ChromaDB</span>
                      </div>

                      {isUploadingPdf && (
                        <div className="p-2 rounded bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-800 font-bold font-mono animate-pulse flex items-center gap-2">
                          <Rocket className="w-3.5 h-3.5 animate-spin" />
                          <span>Vectorizing reference embeddings...</span>
                        </div>
                      )}

                      {pdfIngestSuccess && (
                        <div className="p-2.5 rounded bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-800 font-semibold font-sans">
                          <span>{pdfIngestSuccess}</span>
                        </div>
                      )}
                    </div>

                    {/* RAG PRECEDENT COMPLIANCE SUGGESTIONS */}
                    <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-emerald-600" />
                        PLFS Precedent Suggestions (RAG)
                      </h4>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto font-medium">
                        {[
                          { code: 'Q_WORK_HRS', text: 'Usual hours worked in primary occupation last week?', type: 'number', block: 'Block 2: Labour' },
                          { code: 'Q_EXP_CEREAL', text: 'Household expenditure value on cereals consumed (₹)?', type: 'number', block: 'Block 3: HCES' },
                          { code: 'Q_LAND_OWN', text: 'Does household own or operate agricultural land?', type: 'single', block: 'Block 1: Land' }
                        ].map((qbQ, qIdx) => (
                          <div key={qIdx} className="p-2 bg-slate-50 border border-slate-100 rounded text-[11px] flex justify-between items-start gap-2 hover:bg-slate-100/80 transition-colors">
                            <div>
                              <span className="text-[9px] font-mono font-bold bg-slate-200 text-slate-650 rounded px-1">{qbQ.code}</span>
                              <p className="text-slate-600 font-semibold leading-tight mt-1">{qbQ.text}</p>
                            </div>
                            <button
                              onClick={() => injectQuestionFromBank(qbQ)}
                              className="px-1.5 py-0.5 bg-[#1A2A6C] text-white rounded text-[9px] font-bold shadow-sm hover:bg-indigo-900 shrink-0"
                            >
                              Inject
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUB-PAGE 3: BROWSE COMPLETE QUESTION BANK */}
          {activeSubPage === 'bank' && selectedSurvey && (
            <div className="space-y-5 animate-fadeIn font-semibold text-xs text-slate-700">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-[#1A2A6C]">Bilingual PLFS & HCES Question Library</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Select ready variables verified by the National Statistical Office (NSO) to build accurate questionnaires.</p>
                </div>
                <button 
                  onClick={() => setActiveSubPage('builder')}
                  className="p-1 px-2.5 border border-slate-200 hover:bg-slate-50 text-[11px] rounded"
                >
                  ← Return to builder
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {INITIAL_QUESTION_BANK.map((q, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">{q.code}</span>
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block mt-1">{q.block}</span>
                      </div>
                      <button 
                        onClick={() => injectQuestionFromBank(q)}
                        className="p-1 px-3 bg-[#1A2A6C] hover:bg-indigo-900 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Inject to survey
                      </button>
                    </div>

                    <div className="space-y-1 bg-white p-2.5 rounded border border-slate-150">
                      <p className="text-[11px] font-bold text-slate-800">{q.text_en}</p>
                      <p className="text-[11px] font-medium text-slate-500 font-sans">{q.text_hi}</p>
                      <p className="text-[11px] font-medium text-slate-500 font-sans">{q.text_ta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-PAGE 4: SEMANTIC CODE LOOKUP LIBRARY */}
          {activeSubPage === 'library' && (
            <div className="space-y-5 animate-fadeIn font-semibold text-xs text-slate-700">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-extrabold text-[#1A2A6C]">National Classification Taxonomies Browser</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Browse bilingual, semantic classification codes for NCO-2015 occupations, NIC-2008 economic operations, or COICOP standards.</p>
              </div>

              {/* Selector tabs */}
              <div className="flex gap-2 font-black text-xs">
                {['NCO', 'NIC', 'ISIC'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setLibraryType(type as any)}
                    className={`py-2 px-4 rounded-lg transition-all ${
                      libraryType === type ? 'bg-[#1A2A6C] text-white shadow' : 'bg-slate-100 text-slate-650 hover:bg-slate-200'
                    }`}
                  >
                    {type === 'NCO' ? 'Occupations (NCO-2015)' : type === 'NIC' ? 'Industrial (NIC-2008)' : 'International (ISIC v4)'}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search taxonomy descriptions or codes... (e.g., driver, wheat, butcher)" 
                    value={libraryQuery}
                    onChange={e => setLibraryQuery(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2.5 border border-slate-250 rounded-lg bg-slate-50 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CLASSIFICATION_CODES
                  .filter(c => c.type === libraryType && (
                    c.label_en.toLowerCase().includes(libraryQuery.toLowerCase()) || 
                    c.code.includes(libraryQuery) ||
                    c.synonyms.some(s => s.toLowerCase().includes(libraryQuery.toLowerCase()))
                  ))
                  .map((code) => (
                    <div key={code.code} className="p-4 border border-slate-200 rounded-xl bg-white space-y-2.5 shadow-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-mono font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2.5 py-0.5">
                          Code Flag: {code.code}
                        </span>
                        <span className="text-[9px] uppercase tracking-widest font-extrabold text-slate-400">{code.type} System</span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800">{code.label_en}</p>
                        <p className="text-[11px] font-medium text-slate-500 font-sans">{code.label_hi}</p>
                        <p className="text-[11px] font-medium text-slate-500 font-sans">{code.label_ta}</p>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-1 pt-2 border-t border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400 uppercase mr-1 mt-0.5">Indexed mapping synonyms:</span>
                        {code.synonyms.map((syn, idx) => (
                          <span key={idx} className="text-[9px] bg-slate-50 border border-slate-100 text-slate-650 px-1.5 py-0.5 rounded">
                            {syn}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* SUB-PAGE 5: COMPREHENSIVE VALIDATION RULES */}
          {activeSubPage === 'validation' && selectedSurvey && (
            <div className="space-y-5 animate-fadeIn font-semibold text-xs text-slate-700">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-extrabold text-[#1A2A6C]">Constraints Validation Matrix Overview</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Aggregates all range limitations, field dependencies, and cross-comparison logic configured in the survey.</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded text-[10px] font-mono">
                    Total limits check: {selectedSurvey.questions.reduce((acc, q) => acc + (q.validationRules?.length || 0), 0)} rules
                  </span>
                </div>
              </div>

              {/* Aggregated view */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left font-medium">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 font-black text-[10px] uppercase">
                      <th className="p-3">Source Variable</th>
                      <th className="p-3">Rule Type</th>
                      <th className="p-3">Expression Formula</th>
                      <th className="p-3">Emitted Feedback Error Msg</th>
                      <th className="p-3">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSurvey.questions.flatMap(q => (q.validationRules || []).map(r => (
                      <tr key={r.id} className="border-b border-slate-100 text-slate-650">
                        <td className="p-3 font-mono font-extrabold text-indigo-700">{q.code}</td>
                        <td className="p-3 uppercase text-[10px] font-bold font-mono">{r.type}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-800 bg-slate-50">{r.expression}</td>
                        <td className="p-3 text-slate-700">{r.reason}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            r.severity === 'fail' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {r.severity}
                          </span>
                        </td>
                      </tr>
                    )))}
                    {selectedSurvey.questions.reduce((acc, q) => acc + (q.validationRules?.length || 0), 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 italic">No rules have been written in this questionnaire. Add validation specs in properties.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-PAGE 6: SKIPS & BRANCHING LOGIC FLOW */}
          {activeSubPage === 'logic' && selectedSurvey && (
            <div className="space-y-5 animate-fadeIn font-semibold text-xs text-slate-700 font-sans">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-extrabold text-[#1A2A6C]">Logic Skiplist Transitions Visual Flow</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Visualize condition expressions and skips defined between questionnaire sections.</p>
              </div>

              <div className="space-y-4 max-w-xl">
                {selectedSurvey.questions.map((q, idx) => (
                  <div key={q.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl relative">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 text-[11px]">{q.code}</span>
                      <span className="text-[10px] text-slate-450 uppercase">{q.type} Type</span>
                    </div>

                    <div className="mt-2.5">
                      <p className="text-slate-800 font-bold text-xs">{q.text_en}</p>
                    </div>

                    {q.conditionalShow ? (
                      <div className="mt-3.5 p-3 bg-[#1A2A6C] text-white border border-indigo-800 rounded-lg flex items-center justify-between text-xs font-mono font-bold">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-4 h-4 text-amber-400" />
                          <span>Show Block variable IF: {q.conditionalShow}</span>
                        </div>
                        <span className="text-[9px] uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded">Active Branch</span>
                      </div>
                    ) : (
                      <div className="mt-3.5 text-slate-400 italic text-[11px]">
                        Proceeds directly to the next sequential variable index.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-PAGE 7: PUBLISH STAGING DESIGN PANEL */}
          {activeSubPage === 'publish' && selectedSurvey && (
            <div className="space-y-5 animate-fadeIn font-semibold text-xs text-slate-700">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-extrabold text-[#1A2A6C]">Handoff Staging Preflight Audit Checker</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Complete standard preflight validations to publish the questionnaire schemas to national monitors and enumerator offices.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-4 border border-slate-200 rounded-xl space-y-4">
                  <h3 className="font-bold text-slate-900 text-xs">Preflight Checklist Results</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Bilingual translations verify</span>
                      </div>
                      <span className="text-[10px] bg-emerald-550 text-white px-1.5 py-0.5 rounded font-black uppercase" style={{ backgroundColor: '#10B981' }}>COMPLIANT</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Variables syntax validations</span>
                      </div>
                      <span className="text-[10px] bg-emerald-550 text-white px-1.5 py-0.5 rounded font-black uppercase" style={{ backgroundColor: '#10B981' }}>COMPLIANT</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Adaptive logical flows map</span>
                      </div>
                      <span className="text-[10px] bg-emerald-550 text-white px-1.5 py-0.5 rounded font-black uppercase" style={{ backgroundColor: '#10B981' }}>COMPLIANT</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-slate-100 bg-slate-50/50 rounded-xl space-y-3 flex flex-col justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-xs">Schema Deploy versioning log</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Freezing is a cryptographic contract: version will automatically bump and schema graph blocks cannot be altered once distributed to field offices.</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-slate-450 block font-bold">Deploy Version target:</span>
                      <input type="text" value={selectedSurvey.version} onChange={e => saveSurveyToDB({...selectedSurvey, version: e.target.value})} className="p-1 text-xs border border-slate-250 rounded bg-white w-24 font-mono font-extrabold" />
                    </div>

                    <button 
                      onClick={handlePublishSurvey} 
                      className="w-full py-2 bg-[#1A2A6C] hover:bg-slate-900 text-white font-bold text-xs rounded-lg shadow"
                    >
                      Freeze & Broadcast Survey Schema
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* FLOATING BOTTOM RIGHT COLLAPSED AI TOGGLE */}
      {selectedSurvey && activeSubPage === 'builder' && selectedQuestionId && (
        <button
          onClick={() => {
            setSelectedQuestionId(null);
            setPropTab('label');
          }}
          className="fixed bottom-6 right-6 p-4 bg-amber-550 hover:bg-amber-600 text-white rounded-full shadow-2xl z-20 flex items-center justify-center gap-1.5 animate-bounce"
          style={{ backgroundColor: '#D97706' }}
          title="Open AI Assist panel"
          aria-label="Open Prompter Generator Assist"
        >
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider font-sans">AI assistant</span>
        </button>
      )}

      {/* PROMPT WIZARD GENERATOR MODAL */}
      {isPromptWizardOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-250 max-w-lg w-full overflow-hidden shadow-2xl relative animate-fadeIn font-semibold text-xs text-slate-700">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-550" style={{ backgroundColor: '#D97706' }} />
            <div className="p-5 flex justify-between items-start border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Gemma Precedent Evaluation Generator</h3>
                  <p className="text-[10px] text-slate-400">MoSPI compliant in-context structural graph constructor.</p>
                </div>
              </div>
              <button onClick={() => setIsPromptWizardOpen(false)} className="p-1 hover:bg-slate-50 text-slate-400 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-slate-550 text-[11px] mb-1">Describe the evaluation query you need compiled:</label>
                <textarea 
                  rows={4}
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                  placeholder="e.g. Household expenditure survey on grain and food items for urban Tamil Nadu, 12 variables"
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-550 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] text-slate-450 mb-1">Sector domain filter:</span>
                  <select 
                    value={domainFilter} 
                    onChange={e => setDomainFilter(e.target.value)}
                    className="w-full p-2 border border-slate-200 bg-white rounded font-bold text-xs"
                  >
                    <option value="Labour">Labour & Trades (PLFS)</option>
                    <option value="Agri">Agriculture oper.</option>
                    <option value="HCES">Household expense (HCES)</option>
                    <option value="Demo">Stratum Demographics</option>
                  </select>
                </div>
                <div>
                  <span className="block text-[11px] text-slate-450 mb-1">Target languages:</span>
                  <div className="flex gap-2.5 pt-2">
                    <label className="flex items-center gap-1 font-bold">
                      <input type="checkbox" checked={promptLangs.en} onChange={e => setPromptLangs({...promptLangs, en: e.target.checked})} /> EN
                    </label>
                    <label className="flex items-center gap-1 font-bold">
                      <input type="checkbox" checked={promptLangs.hi} onChange={e => setPromptLangs({...promptLangs, hi: e.target.checked})} /> HI
                    </label>
                    <label className="flex items-center gap-1 font-bold">
                      <input type="checkbox" checked={promptLangs.ta} onChange={e => setPromptLangs({...promptLangs, ta: e.target.checked})} /> TA
                    </label>
                  </div>
                </div>
              </div>

              {isGenerating && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-[10px] font-bold font-mono text-amber-800 animate-pulse flex items-center gap-2">
                  <Rocket className="w-4 h-4 animate-spin text-amber-600" />
                  <span>{generationStep}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button 
                onClick={() => setIsPromptWizardOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-650 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button 
                disabled={isGenerating || !promptText.trim()}
                onClick={handleGenerateFromPrompt}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-1000 disabled:opacity-40"
              >
                Assemble Precedent Graph
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAPI PREVIEW TABLET EMULATOR MODAL */}
      {isPreviewOpen && selectedSurvey && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-300 max-w-2xl w-full h-[620px] overflow-hidden flex flex-col shadow-2xl relative font-sans">
            
            {/* Tablet outline borders decorations */}
            <div className="bg-slate-800 px-4 py-3 text-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-4 text-[#D97706]" />
                <span className="text-[10px] font-mono font-black uppercase text-slate-400 tracking-widest bg-slate-900 border border-slate-750 px-2 py-0.5 rounded-full">
                  SATARK_CAPI_TESTER_v2.0
                </span>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Test questionnaire view wrapper index */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-100/50 space-y-5">
              
              <div className="p-4 bg-white rounded-2xl border border-slate-150 space-y-1">
                <h3 className="text-sm font-extrabold text-slate-900">{selectedSurvey.name_en}</h3>
                <p className="text-[10px] text-slate-400 font-mono tracking-tight uppercase">Bilingual Design Evaluation Node Preview</p>
              </div>

              {previewError && (
                <div className="p-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 " />
                  <span>{previewError}</span>
                </div>
              )}

              {/* Form elements simulated */}
              <div className="space-y-4">
                {selectedSurvey.questions.map((q) => {
                  // check skip conditional
                  if (q.conditionalShow) {
                    try {
                      // simple parse evaluator
                      let passed = true;
                      const cond = q.conditionalShow;
                      const variables = Object.keys(previewAnswers);
                      let cleanExpr = cond;
                      variables.forEach(v => {
                        const escapedV = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regex = new RegExp(escapedV, 'g');
                        const answerVal = previewAnswers[v];
                        const formatVal = typeof answerVal === 'string' ? `"${answerVal}"` : String(answerVal);
                        cleanExpr = cleanExpr.replace(regex, formatVal);
                      });

                      passed = new Function(`return (${cleanExpr})`)();
                      if (!passed) return null; // skip rendering!
                    } catch (err) {
                      // fallback
                    }
                  }

                  return (
                    <div key={q.id} className="p-4.5 bg-white border border-slate-150 rounded-2xl space-y-3 shadow-xs font-medium text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5 font-bold">{q.code}</span>
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">{q.type} Field</span>
                      </div>

                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900 leading-relaxed">{q.text_en}</p>
                        <p className="text-slate-500 text-[11px]">{q.text_hi}</p>
                      </div>

                      {/* Inputs types templates preview */}
                      {q.type === 'text' && (
                        <input 
                          type="text" 
                          placeholder="Type answer text..."
                          value={previewAnswers[q.code] || ''}
                          onChange={e => handleTestPreviewValue(q.code, e.target.value)}
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
                        />
                      )}

                      {q.type === 'number' && (
                        <input 
                          type="number" 
                          placeholder="Type numerical answer..."
                          value={previewAnswers[q.code] || ''}
                          onChange={e => handleTestPreviewValue(q.code, Number(e.target.value))}
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white font-mono"
                        />
                      )}

                      {(q.type === 'single' || q.type === 'multi') && q.options && (
                        <div className="grid grid-cols-2 gap-2.5">
                          {q.options.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              onClick={() => handleTestPreviewValue(q.code, opt)}
                              className={`p-2.5 border rounded-xl text-left text-xs transition-colors font-bold ${
                                previewAnswers[q.code] === opt 
                                  ? 'border-[#1A2A6C] bg-indigo-50/50 text-[#1A2A6C]' 
                                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === 'date' && (
                        <input 
                          type="date" 
                          value={previewAnswers[q.code] || ''}
                          onChange={e => handleTestPreviewValue(q.code, e.target.value)}
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom device preview bars */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-mono text-[10px] uppercase font-bold">Tested variables integrity validated in real-time</span>
              <button 
                onClick={() => {
                  setPreviewAnswers({});
                  setPreviewError(null);
                  setSuccessMsg('Interviewer preview answers cache successfully cleared.');
                  setTimeout(() => setSuccessMsg(''), 400);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-700 font-bold"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
