import type {
  DifficultyLevel,
  OptionKey,
  PaperType,
  QuestionExplanation,
  QuestionOption,
  QuestionSource,
} from '../types.ts';

export interface ExpandedUploadQuestion {
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
  tags: string[];
  /** True when a simple explanation string or partial object was expanded into the 5-field schema */
  wasExplanationExpanded: boolean;
  sourceRowIndex: number;
}

export interface ClientValidationError {
  index: number;
  reason: string;
}

export interface PreparedClientUpload {
  validItems: ExpandedUploadQuestion[];
  intraBatchDuplicates: number;
  expandedExplanationCount: number;
  errors: ClientValidationError[];
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

const CANONICAL_SUBJECTS: Array<{ name: string; paper: PaperType }> = [
  { name: 'Anatomy', paper: 'morning' },
  { name: 'Physiology', paper: 'morning' },
  { name: 'Biochemistry', paper: 'morning' },
  { name: 'Pathology', paper: 'morning' },
  { name: 'Microbiology', paper: 'morning' },
  { name: 'Pharmacology', paper: 'morning' },
  { name: 'Dermatology', paper: 'morning' },
  { name: 'Pediatrics', paper: 'morning' },
  { name: 'Psychiatry', paper: 'morning' },
  { name: 'PSM (Community Medicine)', paper: 'morning' },
  { name: 'Anaesthesia', paper: 'morning' },
  { name: 'Orthopedics', paper: 'morning' },
  { name: 'Medicine', paper: 'afternoon' },
  { name: 'General Surgery', paper: 'afternoon' },
  { name: 'Obstetrics & Gynaecology', paper: 'afternoon' },
  { name: 'Radiology', paper: 'afternoon' },
  { name: 'Ophthalmology', paper: 'afternoon' },
  { name: 'ENT', paper: 'afternoon' },
  { name: 'Forensic Medicine', paper: 'afternoon' },
];

const SUBJECT_LOOKUP = new Map(CANONICAL_SUBJECTS.map((s) => [s.name, s]));

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

/** Matches server-side normalizeQuestionHash exactly: lowercase + alphanumeric spaces + SHA-256 hex */
export async function computeNormalizedQuestionHash(questionText: string): Promise<string> {
  const normalized = questionText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function resolveCanonicalSubject(raw: unknown): { name: string; paper: PaperType } | null {
  const input = cleanStr(raw, 120);
  if (!input) return null;

  const exact = SUBJECT_LOOKUP.get(input);
  if (exact) return exact;

  const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();
  const mapped = SUBJECT_ALIASES[normalized];
  if (mapped) return SUBJECT_LOOKUP.get(mapped) ?? null;

  for (const [alias, target] of Object.entries(SUBJECT_ALIASES)) {
    if (alias.length >= 5 && normalized.includes(alias)) {
      return SUBJECT_LOOKUP.get(target) ?? null;
    }
  }
  return null;
}

function extractOptions(obj: Record<string, unknown>): QuestionOption[] | null {
  const rawOptions = obj.options;

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

  if (rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)) {
    const rec = rawOptions as Record<string, unknown>;
    const mapped = OPTION_KEYS.map((key) => ({
      key,
      text: cleanStr(rec[key] ?? rec[key.toLowerCase()], 600),
    }));
    if (mapped.every((o) => o.text.length > 0)) return mapped;
  }

  const flatSets = [
    ['A', 'B', 'C', 'D'],
    ['a', 'b', 'c', 'd'],
    ['optionA', 'optionB', 'optionC', 'optionD'],
    ['option_a', 'option_b', 'option_c', 'option_d'],
    ['opa', 'opb', 'opc', 'opd'],
  ];
  for (const keys of flatSets) {
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
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 4) {
    return OPTION_KEYS[raw - 1];
  }
  const str = cleanStr(raw, 200);
  if (!str) return null;

  const upper = str.toUpperCase();
  if (OPTION_KEYS.includes(upper as OptionKey)) return upper as OptionKey;
  const letterPrefix = upper.match(/^(?:OPTION\s*)?([A-D])(?:[.)\s:]|$)/);
  if (letterPrefix && OPTION_KEYS.includes(letterPrefix[1] as OptionKey)) {
    return letterPrefix[1] as OptionKey;
  }
  if (['1', '2', '3', '4'].includes(upper)) {
    return OPTION_KEYS[Number(upper) - 1];
  }

  const lower = str.toLowerCase();
  const matched = options.find((o) => o.text.toLowerCase() === lower);
  return matched ? matched.key : null;
}

function firstConciseSentence(text: string, fallback: string): string {
  const clean = text.trim();
  if (!clean) return fallback;
  const first = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return first.length > 200 ? `${first.slice(0, 197).trim()}...` : first;
}

/**
 * Automatically expands a simple explanation string or partial explanation object
 * into the required 5-field FMGE schema:
 * { whyCorrect, whyOthersWrong: {A,B,C,D}, questionConcept, highYieldPoint, mnemonic }
 */
function expandExplanationSchema(
  rawObj: Record<string, unknown>,
  subject: string,
  topic: string,
  options: QuestionOption[],
  correctKey: OptionKey
): { explanation: QuestionExplanation; wasExpanded: boolean } {
  const correctOpt = options.find((o) => o.key === correctKey)!;
  const rawExp = rawObj.explanation ?? rawObj.exp ?? rawObj.rationale ?? rawObj.solution;

  let whyCorrect = '';
  let questionConcept = '';
  let highYieldPoint = '';
  let mnemonic = cleanStr(rawObj.mnemonic, 500);
  const rawOthers: Partial<Record<OptionKey, string>> = {};
  let wasExpanded = false;

  if (typeof rawExp === 'string') {
    whyCorrect = cleanStr(rawExp, 3000);
    wasExpanded = true;
  } else if (rawExp && typeof rawExp === 'object' && !Array.isArray(rawExp)) {
    const expObj = rawExp as Record<string, unknown>;
    whyCorrect = cleanStr(expObj.whyCorrect ?? expObj.summary ?? expObj.text ?? expObj.rationale, 3000);
    questionConcept = cleanStr(expObj.questionConcept ?? expObj.concept, 1500);
    highYieldPoint = cleanStr(expObj.highYieldPoint ?? expObj.pearl ?? expObj.takeaway, 1000);
    mnemonic = cleanStr(expObj.mnemonic, 500) || mnemonic;

    if (
      expObj.whyOthersWrong &&
      typeof expObj.whyOthersWrong === 'object' &&
      !Array.isArray(expObj.whyOthersWrong)
    ) {
      const othersObj = expObj.whyOthersWrong as Record<string, unknown>;
      for (const k of OPTION_KEYS) {
        const val = cleanStr(othersObj[k] ?? othersObj[k.toLowerCase()], 1000);
        if (val) rawOthers[k] = val;
      }
    }
  } else {
    wasExpanded = true;
  }

  if (!whyCorrect) {
    whyCorrect = `Option ${correctKey} (${correctOpt.text}) is the correct answer for this ${subject} question on ${topic}.`;
    wasExpanded = true;
  }

  const whyOthersWrong = { A: '', B: '', C: '', D: '' };
  for (const opt of options) {
    if (rawOthers[opt.key]) {
      whyOthersWrong[opt.key] = rawOthers[opt.key]!;
    } else {
      wasExpanded = true;
      whyOthersWrong[opt.key] =
        opt.key === correctKey
          ? `Correct answer: ${opt.text}.`
          : `Incorrect distractor (${opt.text}); does not match the primary clinical finding tested here.`;
    }
  }

  if (!questionConcept) {
    questionConcept = `Core ${subject} concept tested: ${topic}.`;
    wasExpanded = true;
  }

  if (!highYieldPoint) {
    highYieldPoint = firstConciseSentence(
      whyCorrect,
      `High-yield ${subject} point: remember ${correctOpt.text} for ${topic}.`
    );
    wasExpanded = true;
  }

  return {
    explanation: {
      whyCorrect,
      whyOthersWrong,
      questionConcept,
      highYieldPoint,
      mnemonic,
    },
    wasExpanded,
  };
}

export async function validateAndExpandClientBatch(
  rawItems: unknown[],
  defaults: { defaultSource: 'auto' | QuestionSource; defaultPyqYear: number | null }
): Promise<PreparedClientUpload> {
  const validItems: ExpandedUploadQuestion[] = [];
  const errors: ClientValidationError[] = [];
  const seenHashes = new Set<string>();
  let intraBatchDuplicates = 0;
  let expandedExplanationCount = 0;

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

    const subj = resolveCanonicalSubject(obj.subject ?? obj.subject_name);
    if (!subj) {
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

    if (new Set(options.map((o) => o.text.toLowerCase())).size !== 4) {
      errors.push({ index: i, reason: 'Options contain duplicate text.' });
      continue;
    }

    const correctKey = resolveCorrectKey(obj, options);
    if (!correctKey) {
      errors.push({ index: i, reason: 'Missing or invalid correctKey (expected A, B, C, or D).' });
      continue;
    }

    const questionHash = await computeNormalizedQuestionHash(stem);
    if (seenHashes.has(questionHash)) {
      intraBatchDuplicates++;
      continue;
    }
    seenHashes.add(questionHash);

    const topic = cleanStr(obj.topic ?? obj.topic_name, 160) || 'High-Yield Core Concepts';
    const { explanation, wasExpanded } = expandExplanationSchema(
      obj,
      subj.name,
      topic,
      options,
      correctKey
    );
    if (wasExpanded) expandedExplanationCount++;

    const diffRaw = cleanStr(obj.difficulty, 20).toLowerCase();
    const difficulty: DifficultyLevel =
      diffRaw === 'easy' || diffRaw === 'medium' || diffRaw === 'hard' ? diffRaw : 'medium';

    const rawSource = cleanStr(obj.source, 30).toLowerCase();
    let source: QuestionSource;
    if (defaults.defaultSource !== 'auto') {
      source = defaults.defaultSource;
    } else if (rawSource === 'pyq' || rawSource === 'previous_year' || rawSource === 'previous year') {
      source = 'pyq';
    } else if (rawSource === 'ai_generated' || rawSource === 'ai') {
      source = 'ai_generated';
    } else {
      const yNum = Number(obj.pyqYear ?? obj.year);
      source = Number.isInteger(yNum) && yNum >= 2005 ? 'pyq' : 'ai_generated';
    }

    const rawYearNum = Number(obj.pyqYear ?? obj.year);
    let pyqYear: number | null = null;
    if (source === 'pyq') {
      if (Number.isInteger(rawYearNum) && rawYearNum >= 2005 && rawYearNum <= 2030) {
        pyqYear = rawYearNum;
      } else if (
        defaults.defaultPyqYear !== null &&
        Number.isInteger(defaults.defaultPyqYear) &&
        defaults.defaultPyqYear >= 2005 &&
        defaults.defaultPyqYear <= 2030
      ) {
        pyqYear = defaults.defaultPyqYear;
      }
    }

    const tags = Array.isArray(obj.tags)
      ? obj.tags.map((t) => cleanStr(t, 48)).filter(Boolean).slice(0, 8)
      : [];

    validItems.push({
      paper: subj.paper,
      subject: subj.name,
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
      tags,
      wasExplanationExpanded: wasExpanded,
      sourceRowIndex: i,
    });
  }

  return {
    validItems,
    intraBatchDuplicates,
    expandedExplanationCount,
    errors,
  };
}
