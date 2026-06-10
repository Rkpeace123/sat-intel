/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Survey, Enumerator, ClassificationCode, SurveyResponse } from './types';

export const SEED_USERS = [
  { username: 'admin', role: 'admin', name: 'Dr. G.S. Prasad', region: 'National HQ' },
  { username: 'sdrd', role: 'sdrd', name: 'Priya Sharma', region: 'Kolkata SDRD Branch' },
  { username: 'fod', role: 'fod', name: 'R. K. Swamy', region: 'Chennai FOD Zone' },
  { username: 'dpd', role: 'dpd', name: 'Amit Verma', region: 'New Delhi DPD Wing' },
  { username: 'scd', role: 'scd', name: 'Dr. Meena Iyer', region: 'National HQ' }
];

export const CLASSIFICATION_CODES: ClassificationCode[] = [
  {
    code: '8322',
    type: 'NCO',
    label_en: 'Auto-rickshaw Driver and Taxi Drivers',
    label_hi: 'ऑटो रिक्शा चालक और टैक्सी चालक',
    label_ta: 'ஆட்டோ ரிக்ஷா மற்றும் டாக்ஸி ஓட்டுநர்கள்',
    synonyms: ['auto', 'auto driver', 'taxi driver', 'ஆட்டோ', 'ஆட்டோ ஓட்டுநர்', 'ऑटो ड्राइवर', 'rickshaw', 'cab']
  },
  {
    code: '01111',
    type: 'NIC',
    label_en: 'Growing of wheat',
    label_hi: 'गेहूं की खेती',
    label_ta: 'கோதுமை வளர்ப்பு',
    synonyms: ['wheat', 'farming', 'wheat farmer', 'कृषि', 'गेहूं', 'கோதுமை', 'விவசாயம்']
  },
  {
    code: '49224',
    type: 'NIC',
    label_en: 'Taxi operation / cab services',
    label_hi: 'टैक्सी संचालन / कैब सेवाएं',
    label_ta: 'டாக்ஸி மற்றும் கேப் சேவைகள்',
    synonyms: ['taxi service', 'cab service', 'uber', 'ola', 'டாக்ஸி', 'टैक्सी']
  },
  {
    code: '15110',
    type: 'ISIC',
    label_en: 'Production and processing of meat',
    label_hi: 'मांस का उत्पादन और प्रसंस्करण',
    label_ta: 'இறைச்சி உற்பத்தி மற்றும் பதப்படுத்துதல்',
    synonyms: ['meat', 'butcher', 'slaughterhouse', 'மாமிசம்', 'मांस']
  }
];

export const REFERENCE_STATS = {
  medianIncome: 22000,
  p05Income: 6000,
  p95Income: 80000,
  medianResponseTimeSec: 90
};

export const INITIAL_QUESTION_BANK = [
  {
    id: 'qb_1',
    block: 'Block 1: General Info',
    code: 'Q_NAME',
    text_en: 'Full name of the respondent?',
    text_hi: 'उत्तरदाता का पूरा नाम?',
    text_ta: 'பதில் அளிப்பவரின் முழு பெயர்?',
    type: 'text' as const,
    validationRules: [
      { id: 'v1', type: 'required' as const, fieldName: 'Q_NAME', expression: 'true', reason: 'Respondent name is mandatory', severity: 'fail' as const }
    ]
  },
  {
    id: 'qb_2',
    block: 'Block 1: General Info',
    code: 'Q_AGE',
    text_en: 'Age of the respondent?',
    text_hi: 'उत्तरदाता की आयु?',
    text_ta: 'பதில் அளிப்பவரின் வயது?',
    type: 'number' as const,
    validationRules: [
      { id: 'v2', type: 'range' as const, fieldName: 'Q_AGE', expression: 'value >= 15 && value <= 110', reason: 'Age must be between 15 and 110 for PLFS interview eligibility', severity: 'fail' as const }
    ]
  },
  {
    id: 'qb_3',
    block: 'Block 2: Activity',
    code: 'Q_OCCUPATION',
    text_en: 'Primary occupation or activity status?',
    text_hi: 'प्राथमिक व्यवसाय या गतिविधि की स्थिति?',
    text_ta: 'முக்கிய தொழில் அல்லது செயல்பாடு நிலை?',
    type: 'single' as const,
    options: ['Farmer', 'Auto-rickshaw Driver', 'Unemployed', 'Student', 'Government Service'],
    options_hi: ['किसान', 'ऑटो रिक्शा चालक', 'बेरोजगार', 'छात्र', 'सरकारी नौकरी'],
    options_ta: ['விவசாயி', 'ஆட்டோ ஓட்டுநர்', 'வேலையில்லாதவர்', 'மாணவர்', 'அரசு வேலை'],
    autoCodeAs: 'NCO' as const
  },
  {
    id: 'qb_4',
    block: 'Block 2: Activity',
    code: 'Q_INCOME',
    text_en: 'Monthly income / value of self-consumption (₹)?',
    text_hi: 'मासिक आय / स्व-उपभोग मूल्य (₹)?',
    text_ta: 'மாதாந்திர வருமானம் / சுய-நுகர்வு மதிப்பு (₹)?',
    type: 'number' as const,
    validationRules: [
      { id: 'v3', type: 'range' as const, fieldName: 'Q_INCOME', expression: 'value >= 0 && value <= 500000', reason: 'Income must be within standard national household survey boundary', severity: 'fail' as const },
      { id: 'v4', type: 'cross' as const, fieldName: 'Q_INCOME', expression: '(Q_OCCUPATION === "Unemployed" || Q_OCCUPATION === "Student") ? value < 10000 : true', reason: 'High income (>=₹10,000) contradicts activity status (Unemployed / Student)', severity: 'fail' as const }
    ]
  },
  {
    id: 'qb_5',
    block: 'Block 2: Activity',
    code: 'Q_MOBILE',
    text_en: 'Do you own an active mobile internet connection?',
    text_hi: 'क्या आपके पास मोबाइल इंटरनेट कनेक्शन है?',
    text_ta: 'உங்களிடம் மொபைல் இணைய இணைப்பு உள்ளதா?',
    type: 'single' as const,
    options: ['Yes', 'No'],
    options_hi: ['हाँ', 'नहीं'],
    options_ta: ['ஆம்', 'இல்லை']
  }
];

export const INITIAL_SURVEYS: Survey[] = [
  {
    id: 'sur_plfs_2026',
    name_en: 'Periodic Labour Force Survey (PLFS-2026)',
    name_hi: 'आवधिक श्रम बल सर्वेक्षण (PLFS-2026)',
    name_ta: 'காலமுறை தொழிலாளர் சுழற்சி கணக்கெடுப்பு (PLFS-2026)',
    version: '2.4.0',
    status: 'Published',
    questions: INITIAL_QUESTION_BANK
  }
];

export const INITIAL_ENUMERATORS: Enumerator[] = [
  {
    id: 'enum_1',
    name: 'Lakshmi R.',
    region: 'Tamil Nadu (Chennai Central)',
    assignedCount: 165,
    completedCount: 154,
    trustScore: 92,
    sparkline: [90, 91, 91, 92, 92, 92, 92],
    recentFlags: []
  },
  {
    id: 'enum_2',
    name: 'Karthik S. (Suspect Profile)',
    region: 'Tamil Nadu (Chennai South)',
    assignedCount: 120,
    completedCount: 78,
    trustScore: 48,
    sparkline: [58, 55, 52, 49, 45, 42, 40],
    recentFlags: [
      {
        responseId: 'resp_seed_flagged',
        flagType: 'Speed / Contradiction',
        reason: 'Occupation was marked as Unemployed, but income reported was ₹2,00,000 in only 4 seconds of response time.',
        timestamp: '2026-06-07T10:00:00Z'
      }
    ]
  }
];

export const INITIAL_RESPONSES: SurveyResponse[] = [
  {
    id: 'resp_seed_1',
    surveyId: 'sur_plfs_2026',
    surveyName: 'Periodic Labour Force Survey (PLFS-2026)',
    enumeratorId: 'enum_1',
    enumeratorName: 'Lakshmi R.',
    householdId: 'HH-TN-0042',
    timestamp: '2026-06-07T14:32:00Z',
    answers: {
      Q_NAME: 'Arun Kumar',
      Q_AGE: 34,
      Q_OCCUPATION: 'Auto-rickshaw Driver',
      Q_INCOME: 24500,
      Q_MOBILE: 'Yes'
    },
    codedAnswers: {
      Q_OCCUPATION: {
        code: '8322',
        label: 'Auto-rickshaw Driver',
        confidence: 96,
        reason: "Matched official NCO-2015 dictionary synonym 'auto driver'"
      }
    },
    consentLogged: true,
    consentTimestamp: '2026-06-07T14:30:10Z',
    paradata: {
      timePerQuestion: { Q_NAME: 15400, Q_AGE: 8600, Q_OCCUPATION: 22000, Q_INCOME: 18000, Q_MOBILE: 7200 },
      corrections: 1,
      navBackCount: 0,
      interruptedCount: 0,
      gpsLat: 13.0827,
      gpsLng: 80.2707,
      mode: 'CAPI'
    },
    behaviorScores: {
      engagement: 95,
      fatigue: 12,
      dropout: 5,
      quality: 94
    },
    validation: {
      layer1_rule: { status: 'pass', reason: 'Age eligibility and mandatory fields supplied.' },
      layer2_govt: { status: 'pass', reason: 'LGD State Code and NCO occupation code validated.' },
      layer3_bayesian: { status: 'pass', reason: 'Income at 54th percentile for occupation & geography bounds.' },
      layer4_behavior: { status: 'pass', reason: 'Time-per-question fits Indian household median standard.' },
      layer5_cross: { status: 'pass', reason: 'No cross-field contradictions observed.' }
    },
    confidenceScore: 94,
    trustBand: 'Green',
    status: 'approved'
  },
  {
    id: 'resp_seed_flagged',
    surveyId: 'sur_plfs_2026',
    surveyName: 'Periodic Labour Force Survey (PLFS-2026)',
    enumeratorId: 'enum_2',
    enumeratorName: 'Karthik S. (Suspect Profile)',
    householdId: 'HH-TN-0043',
    timestamp: '2026-06-07T15:10:00Z',
    answers: {
      Q_NAME: 'Suresh Gopalan',
      Q_AGE: 21,
      Q_OCCUPATION: 'Unemployed',
      Q_INCOME: 200000,
      Q_MOBILE: 'Yes'
    },
    codedAnswers: {
      Q_OCCUPATION: {
        code: 'None',
        label: 'Unemployed',
        confidence: 100,
        reason: 'Direct match - no active NCO/NIC classification'
      }
    },
    consentLogged: true,
    consentTimestamp: '2026-06-07T15:09:55Z',
    paradata: {
      timePerQuestion: { Q_NAME: 1200, Q_AGE: 800, Q_OCCUPATION: 1100, Q_INCOME: 900, Q_MOBILE: 500 },
      corrections: 0,
      navBackCount: 0,
      interruptedCount: 0,
      gpsLat: 13.0482,
      gpsLng: 80.2214,
      mode: 'CAPI'
    },
    behaviorScores: {
      engagement: 14,
      fatigue: 90,
      dropout: 85,
      quality: 20
    },
    validation: {
      layer1_rule: { status: 'pass', reason: 'Fields entered successfully.' },
      layer2_govt: { status: 'pass', reason: 'Direct match resolved.' },
      layer3_bayesian: { status: 'fail', reason: 'Income ₹2,00,000 values lie beyond the 99.6th percentile of regional unemployment distribution.' },
      layer4_behavior: { status: 'fail', reason: 'Completed questions in 4.5 seconds (90 seconds national median).' },
      layer5_cross: { status: 'fail', reason: 'Income ₹2,00,000 exceeds ₹10,000 boundary for Unemployed occupation state.' }
    },
    confidenceScore: 46,
    trustBand: 'Red',
    status: 'flagged'
  }
];
