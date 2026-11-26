import { SUBJECT_MAP, type PaperType } from '../constants/examStructure.ts';
import {
  normalizeQuestionHash,
  type DifficultyLevel,
  type OptionKey,
  type QuestionExplanation,
  type QuestionOption,
  type QuestionSource,
} from '../data/sampleQuestions.ts';

export interface NormalizedImportQuestion {
  paper: PaperType;
  subject: string;
  topic: string;
  question: string;
  questionHash: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  explanation: QuestionExplanation;
  difficulty: DifficultyLevel;
  source: QuestionSource;
  pyqYear: number | null;
  verified: boolean;
  flagged: boolean;
  flagReason: string;
  tags: string[];
}

export interface JsonImportValidationError {
  index: number;
  reason: string;
}

export interface JsonImportDefaults {
  defaultSource?: 'auto' | QuestionSource;
  defaultPyqYear?: number | null;
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

const SUBJECT_ALIASES: Record<string, string> = {
  anatomy: 'Anatomy',
  anat: 'Anatomy',
  physiology: 'Physiology',
  physio: 'Physiology',
  biochemistry: 'Biochemistry',
  biochem: 'Biochemistry',
  pathology: 'Pathology',
  patho: 'Pathology',
  microbiology: 'Microbiology',
  micro: 'Microbiology',
  pharmacology: 'Pharmacology',
  pharma: 'Pharmacology',
  dermatology: 'Dermatology',
  derma: 'Dermatology',
  skin: 'Dermatology',
  pediatrics: 'Pediatrics',
  paediatrics: 'Pediatrics',
  pedia: 'Pediatrics',
  paedia: 'Pediatrics',
  psychiatry: 'Psychiatry',
  psych: 'Psychiatry',
  psm: 'PSM (Community Medicine)',
  'community medicine': 'PSM (Community Medicine)',
  'psm (community medicine)': 'PSM (Community Medicine)',
  'preventive and social medicine': 'PSM (Community Medicine)',
  spm: 'PSM (Community Medicine)',
  anaesthesia: 'Anaesthesia',
  anesthesia: 'Anaesthesia',
  anaesthesiology: 'Anaesthesia',
  anesthesiology: 'Anaesthesia',
  orthopedics: 'Orthopedics',
  orthopaedics: 'Orthopedics',
  ortho: 'Orthopedics',
  medicine: 'Medicine',
  'general medicine': 'Medicine',
  'internal medicine': 'Medicine',
  med: 'Medicine',
  surgery: 'General Surgery',
  'general surgery': 'General Surgery',
  obg: 'Obstetrics & Gynaecology',
  obgyn: 'Obstetrics & Gynaecology',
  'obgyn / obs & gynae': 'Obstetrics & Gynaecology',
  'obs & gynae': 'Obstetrics & Gynaecology',
  'obs and gynae': 'Obstetrics & Gynaecology',
  'obstetrics & gynaecology': 'Obstetrics & Gynaecology',
  'obstetrics and gynaecology': 'Obstetrics & Gynaecology',
  'obstetrics & gynecology': 'Obstetrics & Gynaecology',
  'obstetrics and gynecology': 'Obstetrics & Gynaecology',
  obstetrics: 'Obstetrics & Gynaecology',
  gynaecology: 'Obstetrics & Gynaecology',
  gynecology: 'Obstetrics & Gynaecology',
  radiology: 'Radiology',
  radio: 'Radiology',
  ophthalmology: 'Ophthalmology',
  ophthal: 'Ophthalmology',
  eye: 'Ophthalmology',
  ent: 'ENT',
  otorhinolaryngology: 'ENT',
  'ear nose throat': 'ENT',
  forensic: 'Forensic Medicine',
  fmt: 'Forensic Medicine',
  'forensic medicine': 'Forensic Medicine',
  'forensic medicine and toxicology': 'Forensic Medicine',
};

function cleanStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function resolveCanonicalSubject(raw: unknown): { subject: string; paper: PaperType } | null {
  const input = cleanStr(raw, 120);
  if (!input) return null;

  const exact = SUBJECT_MAP.get(input);
  if (exact) {
    return { subject: exact.name, paper: exact.paper };
  }

  const normalizedKey = input.toLowerCase().replace(/\s+/g, ' ').trim();
  const aliasTarget = SUBJECT_ALIASES[normalizedKey];
  if (aliasTarget) {
    const info = SUBJECT_MAP.get(aliasTarget);
    if (info) return { subject: info.name, paper: info.paper };
  }

  // Fallback substring match for minor wording variations
  for (const [alias, target] of Object.entries(SUBJECT_ALIASES)) {
    if (normalizedKey === alias || (alias.length >= 5 && normalizedKey.includes(alias))) {
      const info = SUBJECT_MAP.get(target);
      if (info) return { subject: info.name, paper: info.paper };
    }
  }

  return null;
}

function extractOptions(obj: Record<string, unknown>): QuestionOption[] | null {
  const rawOptions = obj.options;

  // Format 1: Array of { key, text } or array of 4 strings
  if (Array.isArray(rawOptions) && rawOptions.length === 4) {
    if (rawOptions.every((x) => typeof x === 'string')) {
      const mapped = OPTION_KEYS.map((key, i) => ({
        key,
        text: cleanStr(rawOptions[i], 600),
      }));
      return mapped.every((o) => o.text.length > 0) ? mapped : null;
    }

    const byKey = new Map<OptionKey, string>();
    for (const item of rawOptions) {
      if (!item || typeof item !== 'object') return null;
      const rec = item as Record<string, unknown>;
      const k = cleanStr(rec.key ?? rec.label ?? rec.id, 4).toUpperCase() as OptionKey;
      const t = cleanStr(rec.text ?? rec.value ?? rec.option, 600);
      if (!OPTION_KEYS.includes(k) || !t) return null;
      byKey.set(k, t);
    }
    if (byKey.size !== 4) return null;
    return OPTION_KEYS.map((key) => ({ key, text: byKey.get(key)! }));
  }

  // Format 2: Object map { A: "...", B: "...", C: "...", D: "..." }
  if (rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)) {
    const rec = rawOptions as Record<string, unknown>;
    const mapped = OPTION_KEYS.map((key) => ({
      key,
      text: cleanStr(rec[key] ?? rec[key.toLowerCase()], 600),
    }));
    if (mapped.every((o) => o.text.length > 0)) return mapped;
  }

  // Format 3: Flat keys A/B/C/D, optionA..D, or opa..opd
  const flatCandidates = [
    ['A', 'B', 'C', 'D'],
    ['a', 'b', 'c', 'd'],
    ['optionA', 'optionB', 'optionC', 'optionD'],
    ['option_a', 'option_b', 'option_c', 'option_d'],
    ['opa', 'opb', 'opc', 'opd'],
  ];
  for (const keys of flatCandidates) {
    const mapped = OPTION_KEYS.map((key, idx) => ({
      key,
      text: cleanStr(obj[keys[idx]], 600),
    }));
    if (mapped.every((o) => o.text.length > 0)) return mapped;
  }

  return null;
}

function resolveCorrectKey(obj: Record<string, unknown>, options: QuestionOption[]): OptionKey | null {
  const raw = obj.correctKey ?? obj.correct ?? obj.answer ?? obj.correctAnswer ?? obj.cop;
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if (raw >= 1 && raw <= 4) return OPTION_KEYS[raw - 1];
    return null;
  }
  const str = cleanStr(raw, 200);
  if (!str) return null;

  const upper = str.toUpperCase();
  if (OPTION_KEYS.includes(upper as OptionKey)) {
    return upper as OptionKey;
  }
  const letterPrefix = upper.match(/^(?:OPTION\s*)?([A-D])(?:[.)\s:]|$)/);
  if (letterPrefix && OPTION_KEYS.includes(letterPrefix[1] as OptionKey)) {
    return letterPrefix[1] as OptionKey;
  }
  if (['1', '2', '3', '4'].includes(upper)) {
    return OPTION_KEYS[Number(upper) - 1];
  }

  // Fallback: match exact option text
  const lower = str.toLowerCase();
  const matched = options.find((o) => o.text.toLowerCase() === lower);
  return matched ? matched.key : null;
}

function firstConciseSentence(text: string, fallback: string): string {
  const clean = text.trim();
  if (!clean) return fallback;
  const split = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return split.length > 200 ? `${split.slice(0, 197).trim()}...` : split;
}

function buildStructuredExplanation(
  rawObj: Record<string, unknown>,
  subject: string,
  topic: string,
  options: QuestionOption[],
  correctKey: OptionKey
): QuestionExplanation {
  const correctOpt = options.find((o) => o.key === correctKey)!;
  const rawExp = rawObj.explanation ?? rawObj.exp ?? rawObj.rationale ?? rawObj.solution;

  let whyCorrect = '';
  let questionConcept = '';
  let highYieldPoint = '';
  let mnemonic = cleanStr(rawObj.mnemonic, 500);
  const rawOthers: Partial<Record<OptionKey, string>> = {};

  if (typeof rawExp === 'string') {
    whyCorrect = cleanStr(rawExp, 3000);
  } else if (rawExp && typeof rawExp === 'object' && !Array.isArray(rawExp)) {
    const expObj = rawExp as Record<string, unknown>;
    whyCorrect = cleanStr(expObj.whyCorrect ?? expObj.summary ?? expObj.text ?? expObj.rationale, 3000);
    questionConcept = cleanStr(expObj.questionConcept ?? expObj.concept, 1500);
    highYieldPoint = cleanStr(expObj.highYieldPoint ?? expObj.pearl ?? expObj.takeaway, 1000);
    mnemonic = cleanStr(expObj.mnemonic, 500) || mnemonic;

    if (expObj.whyOthersWrong && typeof expObj.whyOthersWrong === 'object' && !Array.isArray(expObj.whyOthersWrong)) {
      const othersObj = expObj.whyOthersWrong as Record<string, unknown>;
      for (const k of OPTION_KEYS) {
        const val = cleanStr(othersObj[k] ?? othersObj[k.toLowerCase()], 1000);
        if (val) rawOthers[k] = val;
      }
    }
  }

  if (!whyCorrect) {
    whyCorrect = `Option ${correctKey} (${correctOpt.text}) is the correct answer for this ${subject} question on ${topic}.`;
  }

  const whyOthersWrong = {
    A: '',
    B: '',
    C: '',
    D: '',
  };
  for (const opt of options) {
    if (rawOthers[opt.key]) {
      whyOthersWrong[opt.key] = rawOthers[opt.key]!;
    } else if (opt.key === correctKey) {
      whyOthersWrong[opt.key] = `Correct answer: ${opt.text}.`;
    } else {
      whyOthersWrong[opt.key] = `Incorrect distractor (${opt.text}); does not match the primary clinical finding tested here.`;
    }
  }

  if (!questionConcept) {
    questionConcept = `Core ${subject} concept tested: ${topic}.`;
  }

  if (!highYieldPoint) {
    highYieldPoint = firstConciseSentence(
      whyCorrect,
      `High-yield ${subject} point: remember ${correctOpt.text} for ${topic}.`
    );
  }

  return {
    whyCorrect,
    whyOthersWrong,
    questionConcept,
    highYieldPoint,
    mnemonic,
  };
}

export function prepareJsonImportBatch(
  rawItems: unknown[],
  defaults: JsonImportDefaults = {}
): {
  validDocs: NormalizedImportQuestion[];
  intraBatchDuplicates: number;
  errors: JsonImportValidationError[];
} {
  const validDocs: NormalizedImportQuestion[] = [];
  const errors: JsonImportValidationError[] = [];
  const seenHashes = new Set<string>();
  let intraBatchDuplicates = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({ index: i, reason: 'Item is not a JSON object.' });
      continue;
    }

    const obj = raw as Record<string, unknown>;
    const stem = cleanStr(obj.question ?? obj.stem ?? obj.prompt, 3000);
    if (stem.length < 15) {
      errors.push({ index: i, reason: 'Question stem is missing or too short (min 15 chars).' });
      continue;
    }

    const resolvedSubj = resolveCanonicalSubject(obj.subject ?? obj.subject_name);
    if (!resolvedSubj) {
      errors.push({
        index: i,
        reason: `Unrecognized FMGE subject "${cleanStr(obj.subject ?? obj.subject_name, 60) || '(empty)'}".`,
      });
      continue;
    }

    const options = extractOptions(obj);
    if (!options) {
      errors.push({ index: i, reason: 'Must provide 4 distinct non-empty options (A, B, C, D).' });
      continue;
    }

    const normalizedOptionTexts = new Set(options.map((o) => o.text.toLowerCase()));
    if (normalizedOptionTexts.size !== 4) {
      errors.push({ index: i, reason: 'Options contain duplicate text.' });
      continue;
    }

    const correctKey = resolveCorrectKey(obj, options);
    if (!correctKey) {
      errors.push({ index: i, reason: 'Missing or invalid correctKey (expected A, B, C, or D).' });
      continue;
    }

    const questionHash = normalizeQuestionHash(stem);
    if (seenHashes.has(questionHash)) {
      intraBatchDuplicates++;
      continue;
    }
    seenHashes.add(questionHash);

    const topic = cleanStr(obj.topic ?? obj.topic_name, 160) || 'High-Yield Core Concepts';
    const explanation = buildStructuredExplanation(obj, resolvedSubj.subject, topic, options, correctKey);

    const diffRaw = cleanStr(obj.difficulty, 20).toLowerCase();
    const difficulty: DifficultyLevel =
      diffRaw === 'easy' || diffRaw === 'medium' || diffRaw === 'hard' ? diffRaw : 'medium';

    const rawSource = cleanStr(obj.source, 30).toLowerCase();
    let source: QuestionSource;
    if (defaults.defaultSource && defaults.defaultSource !== 'auto') {
      source = defaults.defaultSource;
    } else if (rawSource === 'pyq' || rawSource === 'previous_year' || rawSource === 'previous year') {
      source = 'pyq';
    } else if (rawSource === 'ai_generated' || rawSource === 'ai') {
      source = 'ai_generated';
    } else {
      const hasYear = Number.isInteger(Number(obj.pyqYear ?? obj.year)) && Number(obj.pyqYear ?? obj.year) >= 2005;
      source = hasYear ? 'pyq' : 'ai_generated';
    }

    const rawYearNum = Number(obj.pyqYear ?? obj.year);
    let pyqYear: number | null = null;
    if (source === 'pyq') {
      if (Number.isInteger(rawYearNum) && rawYearNum >= 2005 && rawYearNum <= 2030) {
        pyqYear = rawYearNum;
      } else if (
        typeof defaults.defaultPyqYear === 'number' &&
        Number.isInteger(defaults.defaultPyqYear) &&
        defaults.defaultPyqYear >= 2005 &&
        defaults.defaultPyqYear <= 2030
      ) {
        pyqYear = defaults.defaultPyqYear;
      }
    }

    const rawTags = Array.isArray(obj.tags)
      ? obj.tags
          .map((t) => cleanStr(t, 48))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    validDocs.push({
      paper: resolvedSubj.paper,
      subject: resolvedSubj.subject,
      topic,
      question: stem,
      questionHash,
      options,
      correctKey,
      explanation,
      difficulty,
      source,
      pyqYear,
      verified: obj.verified === true,
      flagged: false,
      flagReason: '',
      tags: rawTags,
    });
  }

  return {
    validDocs,
    intraBatchDuplicates,
    errors,
  };
}
