import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { QuestionModel, SeedProgressModel } from '../models/index.ts';
import { FMGE_TOPICS, SUBJECT_QUOTA_TOTAL } from '../../scripts/topics.js';

const BATCH_SIZE = 10;
const MAX_RETRIES = 4;
const MAX_RATE_LIMIT_RETRIES = 6;
const RECENT_STEMS_CONTEXT = 18;
const PYQ_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

export type AiSeederProvider = 'gemini' | 'openai' | 'anthropic' | 'groq';
export type SeederMode = 'all' | 'pyq_only' | 'ai_only';

export const PROVIDER_DEFAULT_MODELS: Record<AiSeederProvider, string> = {
  gemini: 'gemini-4-hydrogen',
  openai: 'gpt-6-luna',
  anthropic: 'claude-3-5-haiku-latest',
  groq: 'llama-3.3-70b-versatile',
};

export interface SeederStartOptions {
  provider: AiSeederProvider;
  model?: string;
  apiKey: string;
  mode: SeederMode;
  subject: string; // 'all' or canonical subject name
  continuous: boolean; // true = generate continuously until admin clicks Stop
  limit: number | null; // null = full quota or infinite when continuous=true
  concurrency: number;
}

export interface RecentGeneratedPreview {
  subject: string;
  topic: string;
  question: string;
  correctKey: 'A' | 'B' | 'C' | 'D';
  source: 'pyq' | 'ai_generated';
  pyqYear: number | null;
}

export interface SeederStatusSnapshot {
  running: boolean;
  stopping: boolean;
  provider: AiSeederProvider | 'none';
  model: string;
  continuous: boolean;
  round: number;
  mode: SeederMode;
  subjectFilter: string;
  limit: number | null;
  concurrency: number;
  insertedThisRun: number;
  pyqInsertedThisRun: number;
  aiInsertedThisRun: number;
  dbTotal: number;
  targetTotal: number;
  currentTask: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCount: number;
  lastError: string | null;
  recentLogs: string[];
  recentGenerated: RecentGeneratedPreview[];
}

function scrubSecret(message: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 6) return message;
  return message.split(apiKey).join('[REDACTED]');
}

function parseRetryDelayMs(errMsg: string): number | null {
  const secMatch =
    errMsg.match(/retry in\s+([0-9.]+)s/i) || errMsg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (secMatch) {
    const secs = Number.parseFloat(secMatch[1]);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.min(120_000, Math.ceil(secs * 1000) + 2000);
    }
  }
  return null;
}

function isRateLimitError(errMsg: string): boolean {
  return /429|RESOURCE_EXHAUSTED|rate[- ]?limit|too many requests/i.test(errMsg);
}

function isFatalAuthOrBillingError(errMsg: string): boolean {
  return /invalid_api_key|incorrect api key|insufficient_quota|API_KEY_INVALID|authentication_error|permission_error|credit balance is too low|GenerateRequestsPerDay|free_tier_requests.*limit:\s*20|401\b|403\b/i.test(
    errMsg
  );
}

function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hashQuestion(text: string): string {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex');
}

function prefixSimilarity(a: string, b: string): number {
  const s1 = normalizeText(a).slice(0, 80);
  const s2 = normalizeText(b).slice(0, 80);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams.get(bg) || 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      matches++;
    }
  }
  return (2 * matches) / (s1.length - 1 + (s2.length - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RawBatchItem {
  question: string;
  options: Array<{ key: string; text: string }>;
  correctKey: string;
  explanation: {
    whyCorrect: string;
    whyOthersWrong: { A: string; B: string; C: string; D: string };
    questionConcept: string;
    highYieldPoint: string;
    mnemonic?: string;
  };
  difficulty: string;
  pyqYear?: number | null;
  tags?: string[];
}

function validateQuestion(raw: RawBatchItem): boolean {
  if (!raw || typeof raw.question !== 'string') return false;
  if (raw.question.trim().length < 25) return false;

  const key = String(raw.correctKey || '').trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(key)) return false;

  if (!Array.isArray(raw.options) || raw.options.length !== 4) return false;
  const seenKeys = new Set<string>();
  const seenTexts = new Set<string>();
  const bannedAbove = /^(all|none) of the above\.?$/i;

  for (const opt of raw.options) {
    if (!opt || typeof opt.text !== 'string') return false;
    const k = String(opt.key || '').trim().toUpperCase();
    const t = opt.text.trim();
    if (!['A', 'B', 'C', 'D'].includes(k) || t.length === 0) return false;
    if (bannedAbove.test(t)) return false;
    const normOpt = normalizeText(t);
    if (seenKeys.has(k) || seenTexts.has(normOpt)) return false;
    seenKeys.add(k);
    seenTexts.add(normOpt);
  }
  if (seenKeys.size !== 4) return false;

  const exp = raw.explanation;
  if (!exp || typeof exp !== 'object') return false;
  if (typeof exp.whyCorrect !== 'string' || exp.whyCorrect.trim().length < 20) return false;
  if (typeof exp.questionConcept !== 'string' || exp.questionConcept.trim().length < 15) return false;
  if (typeof exp.highYieldPoint !== 'string' || exp.highYieldPoint.trim().length < 10) return false;
  if (!exp.whyOthersWrong || typeof exp.whyOthersWrong !== 'object') return false;
  for (const k of ['A', 'B', 'C', 'D'] as const) {
    if (typeof exp.whyOthersWrong[k] !== 'string' || exp.whyOthersWrong[k].trim().length < 5) {
      return false;
    }
  }
  return true;
}

function randomizeOptionKeys<
  T extends {
    options: Array<{ key: 'A' | 'B' | 'C' | 'D'; text: string }>;
    correctKey: 'A' | 'B' | 'C' | 'D';
    explanation: {
      whyCorrect: string;
      whyOthersWrong: { A: string; B: string; C: string; D: string };
      questionConcept: string;
      highYieldPoint: string;
      mnemonic: string;
    };
  },
>(mcq: T): T {
  const positionalPattern =
    /\b(all of the above|none of the above|both [a-d]|options? [a-d]|above|below)\b/i;
  if (mcq.options.some((o) => positionalPattern.test(o.text))) {
    return mcq;
  }

  const keys: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  const perm = [...keys];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  const oldToNew = {} as Record<'A' | 'B' | 'C' | 'D', 'A' | 'B' | 'C' | 'D'>;
  const newToOld = {} as Record<'A' | 'B' | 'C' | 'D', 'A' | 'B' | 'C' | 'D'>;
  for (let i = 0; i < 4; i++) {
    oldToNew[keys[i]] = perm[i];
    newToOld[perm[i]] = keys[i];
  }

  const oldOptMap = new Map(mcq.options.map((o) => [o.key, o.text]));
  const newOptions = keys.map((newK) => ({
    key: newK,
    text: oldOptMap.get(newToOld[newK]) ?? '',
  }));

  const newWhyOthersWrong = {
    A: mcq.explanation.whyOthersWrong[newToOld.A],
    B: mcq.explanation.whyOthersWrong[newToOld.B],
    C: mcq.explanation.whyOthersWrong[newToOld.C],
    D: mcq.explanation.whyOthersWrong[newToOld.D],
  };

  return {
    ...mcq,
    options: newOptions,
    correctKey: oldToNew[mcq.correctKey],
    explanation: {
      ...mcq.explanation,
      whyOthersWrong: newWhyOthersWrong,
    },
  };
}

function extractQuestionsArray(rawText: string): RawBatchItem[] {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as { questions?: unknown } | unknown[];
  if (Array.isArray(parsed)) return parsed as RawBatchItem[];
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
    return parsed.questions as RawBatchItem[];
  }
  throw new Error('Model response did not include a valid "questions" JSON array.');
}

const BATCH_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING },
            text: { type: Type.STRING },
          },
          required: ['key', 'text'],
        },
      },
      correctKey: { type: Type.STRING },
      explanation: {
        type: Type.OBJECT,
        properties: {
          whyCorrect: { type: Type.STRING },
          whyOthersWrong: {
            type: Type.OBJECT,
            properties: {
              A: { type: Type.STRING },
              B: { type: Type.STRING },
              C: { type: Type.STRING },
              D: { type: Type.STRING },
            },
            required: ['A', 'B', 'C', 'D'],
          },
          questionConcept: { type: Type.STRING },
          highYieldPoint: { type: Type.STRING },
          mnemonic: { type: Type.STRING },
        },
        required: ['whyCorrect', 'whyOthersWrong', 'questionConcept', 'highYieldPoint', 'mnemonic'],
      },
      difficulty: { type: Type.STRING },
      pyqYear: { type: Type.INTEGER },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['question', 'options', 'correctKey', 'explanation', 'difficulty', 'tags'],
  },
};

const SUBCONCEPT_ANGLES = [
  'pathophysiology, diagnostic signs, and gold-standard investigations',
  'first-line management, drug of choice, and current Indian guidelines (NMC/NTEP/NVBDCP/UIP)',
  'clinical complications, contraindications, and emergency bedside recognition',
  'classic named signs, scoring criteria, imaging descriptions, and laboratory findings',
  'anatomical/biochemical mechanisms, differential diagnosis, and preventive medicine',
  'pediatric, obstetric, and geriatric variations with dose adjustments and red-flag symptoms',
  'histopathology, microbiology stain/culture hallmarks, and receptor pharmacology',
  'post-operative complications, medico-legal rules, and national health program targets',
];

const JSON_OBJECT_INSTRUCTIONS = `IMPORTANT JSON FORMAT: Return ONLY a valid JSON object:
{
  "questions": [
    {
      "question": "Clinical vignette or FMGE recall stem...",
      "options": [
        {"key": "A", "text": "..."},
        {"key": "B", "text": "..."},
        {"key": "C", "text": "..."},
        {"key": "D", "text": "..."}
      ],
      "correctKey": "A",
      "explanation": {
        "whyCorrect": "Detailed textbook rationale for the right answer",
        "whyOthersWrong": {
          "A": "Reason for A",
          "B": "Reason for B",
          "C": "Reason for C",
          "D": "Reason for D"
        },
        "questionConcept": "Core FMGE concept being tested",
        "highYieldPoint": "One-line high-yield exam pearl",
        "mnemonic": ""
      },
      "difficulty": "easy",
      "pyqYear": 0,
      "tags": ["tag1", "tag2"]
    }
  ]
}`;

class BulkSeederManager {
  private running = false;
  private stopRequested = false;
  private activeProvider: AiSeederProvider | 'none' = 'none';
  private activeModel = '';
  private continuous = true;
  private round = 1;
  private mode: SeederMode = 'all';
  private subjectFilter = 'all';
  private limit: number | null = null;
  private concurrency = 4;
  private insertedThisRun = 0;
  private pyqInsertedThisRun = 0;
  private aiInsertedThisRun = 0;
  private dbTotal = 0;
  private currentTask = 'Idle';
  private startedAt: string | null = null;
  private finishedAt: string | null = null;
  private errorCount = 0;
  private lastError: string | null = null;
  private recentLogs: string[] = [];
  private recentGenerated: RecentGeneratedPreview[] = [];
  private minGapMs = 0;
  private nextSlotAt = 0;
  private fatalHalted = false;

  private async waitForRateSlot(): Promise<void> {
    if (this.minGapMs <= 0 && Date.now() >= this.nextSlotAt) return;
    const now = Date.now();
    const scheduled = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = scheduled + this.minGapMs;
    const waitMs = scheduled - now;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private pushLog(msg: string) {
    const stamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
    this.recentLogs = [`[${stamp}] ${msg}`, ...this.recentLogs].slice(0, 30);
  }

  public getStatus(): SeederStatusSnapshot {
    return {
      running: this.running,
      stopping: this.stopRequested,
      provider: this.activeProvider,
      model: this.activeModel,
      continuous: this.continuous,
      round: this.round,
      mode: this.mode,
      subjectFilter: this.subjectFilter,
      limit: this.limit,
      concurrency: this.concurrency,
      insertedThisRun: this.insertedThisRun,
      pyqInsertedThisRun: this.pyqInsertedThisRun,
      aiInsertedThisRun: this.aiInsertedThisRun,
      dbTotal: this.dbTotal,
      targetTotal: SUBJECT_QUOTA_TOTAL,
      currentTask: this.currentTask,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      errorCount: this.errorCount,
      lastError: this.lastError,
      recentLogs: this.recentLogs,
      recentGenerated: this.recentGenerated,
    };
  }

  public stop(): { ok: boolean; message: string } {
    if (!this.running) {
      return { ok: true, message: 'No bulk generation job is currently running.' };
    }
    this.stopRequested = true;
    this.pushLog('Stop requested — finishing in-flight batches and clearing runtime key...');
    return { ok: true, message: 'Stop signal sent. In-flight batches will save and halt.' };
  }

  public async start(options: SeederStartOptions): Promise<{ ok: boolean; message: string }> {
    if (this.running) {
      return { ok: false, message: 'A bulk generation job is already running. Stop it first.' };
    }

    const runtimeKey = options.apiKey.trim();
    if (!runtimeKey || runtimeKey.length < 10) {
      return {
        ok: false,
        message: 'Enter a valid API key for the selected AI provider before starting generation.',
      };
    }

    const provider = options.provider;
    const model = (options.model || PROVIDER_DEFAULT_MODELS[provider]).trim();

    this.running = true;
    this.stopRequested = false;
    this.fatalHalted = false;
    this.activeProvider = provider;
    this.activeModel = model;
    this.continuous = options.continuous;
    this.round = 1;
    this.minGapMs = provider === 'groq' ? 1200 : 0;
    this.nextSlotAt = 0;
    this.mode = options.mode;
    this.subjectFilter = options.subject;
    this.limit = options.continuous ? null : options.limit;
    this.concurrency = Math.max(1, Math.min(8, options.concurrency || 4));
    this.insertedThisRun = 0;
    this.pyqInsertedThisRun = 0;
    this.aiInsertedThisRun = 0;
    this.errorCount = 0;
    this.lastError = null;
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.recentLogs = [];
    this.recentGenerated = [];
    this.currentTask = `Initializing ${provider.toUpperCase()} (${model})...`;

    // Key stays strictly in this local background closure — never persisted to DB, disk, or logs
    void this.runBackground(provider, model, runtimeKey);

    return {
      ok: true,
      message: `Started ${options.continuous ? 'continuous' : 'batch'} generation using ${provider.toUpperCase()} (${model}). Click Stop anytime to halt.`,
    };
  }

  private async callOpenAiCompatibleBatch(
    endpointUrl: string,
    providerLabel: string,
    model: string,
    apiKey: string,
    prompt: string
  ): Promise<RawBatchItem[]> {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a senior Indian MBBS/FMGE medical exam author. Always respond with a strict JSON object containing a single top-level key "questions" whose value is an array of verified MCQ objects with answers and 5-part explanations.',
          },
          {
            role: 'user',
            content: `${prompt}\n\n${JSON_OBJECT_INSTRUCTIONS}`,
          },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${providerLabel} HTTP ${res.status}: ${text.slice(0, 350)}`);
    }
    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim() || '{}';
    return extractQuestionsArray(content);
  }

  private async callAnthropicBatch(
    model: string,
    apiKey: string,
    prompt: string
  ): Promise<RawBatchItem[]> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system:
          'You are a senior Indian MBBS/FMGE medical exam author. Output ONLY raw JSON matching the exact schema requested, with no markdown fences or extra prose.',
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\n${JSON_OBJECT_INSTRUCTIONS}`,
          },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 350)}`);
    }
    const payload = JSON.parse(text) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const textBlock = payload.content?.find((b) => b.type === 'text')?.text || '{}';
    return extractQuestionsArray(textBlock);
  }

  private async generateBatch(
    provider: AiSeederProvider,
    model: string,
    apiKey: string,
    geminiClient: GoogleGenAI | null,
    params: {
      paper: string;
      subject: string;
      topic: string;
      count: number;
      isPyqBatch: boolean;
      targetYear: number;
      recentStems: string[];
      callNumber: number;
    }
  ): Promise<RawBatchItem[]> {
    const angle = SUBCONCEPT_ANGLES[(params.callNumber - 1) % SUBCONCEPT_ANGLES.length];
    const doNotRepeatBlock =
      params.recentStems.length > 0
        ? `\nDO NOT REPEAT OR PARAPHRASE ANY OF THESE EXISTING QUESTIONS FOR THIS TOPIC:\n${params.recentStems
            .slice(-RECENT_STEMS_CONTEXT)
            .map((s, idx) => `${idx + 1}. ${s.slice(0, 140)}`)
            .join('\n')}\n`
        : '';

    const pyqInstructions = params.isPyqBatch
      ? `FOCUS: Generate ${params.count} authentic, high-yield FMGE Previous Year Question (PYQ) style recall MCQs repeatedly tested in FMGE (${params.targetYear} / 2018–2025 NBE FMGE sessions) for this exact topic. Set pyqYear to an integer year between 2018 and 2025 (centered around ${params.targetYear}).`
      : `FOCUS: Generate ${params.count} brand-new, high-yield FMGE MCQs covering sub-concept angle: ${angle}. Set pyqYear to 0.`;

    const prompt = `You are authoring verified Indian FMGE (Foreign Medical Graduate Examination, NBE India) MCQs.

TARGET METADATA:
- Paper: ${params.paper}
- Subject: ${params.subject}
- Topic: ${params.topic}
- ${pyqInstructions}
${doNotRepeatBlock}
STRICT RULES:
1. Mix across batch: ~60% short clinical vignettes (age, sex, presentation, labs/exam), ~30% high-yield recall/one-liners, ~10% investigation or classic image-description based.
2. Difficulty mix: ~30% "easy", ~50% "medium", ~20% "hard".
3. Exactly 4 distinct options labeled A, B, C, D with ONE unambiguous correctKey ("A", "B", "C", or "D"). Never use "All of the above" or "None of the above". Spread correctKey across A, B, C, D.
4. Strictly follow standard Indian MBBS textbooks (Robbins, Harrison, Bailey & Love, Dutta, Park, KD Tripathi, BDC, Ganong, Harper, Apurba Sastry) and current Indian guidelines (NMC, NTEP, NVBDCP, NACO, UIP). Never invent uncertain facts.
5. Every explanation MUST contain: whyCorrect, whyOthersWrong ({ A, B, C, D } one line each), questionConcept (what is tested + core concept), highYieldPoint (one-line exam pearl), and mnemonic (or "").
6. Return strict JSON only.`;

    let attempt = 0;
    let rateLimitHits = 0;
    while (attempt < MAX_RETRIES) {
      if (this.stopRequested) return [];
      await this.waitForRateSlot();
      if (this.stopRequested) return [];
      try {
        if (provider === 'openai') {
          return await this.callOpenAiCompatibleBatch(
            'https://api.openai.com/v1/chat/completions',
            'OpenAI',
            model,
            apiKey,
            prompt
          );
        }
        if (provider === 'groq') {
          return await this.callOpenAiCompatibleBatch(
            'https://api.groq.com/openai/v1/chat/completions',
            'Groq',
            model,
            apiKey,
            prompt
          );
        }
        if (provider === 'anthropic') {
          return await this.callAnthropicBatch(model, apiKey, prompt);
        }

        const response = await geminiClient!.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a senior Indian MBBS/FMGE medical exam author. Output strictly valid JSON matching the requested schema.',
            responseMimeType: 'application/json',
            responseSchema: BATCH_RESPONSE_SCHEMA,
          },
        });
        const parsed = JSON.parse((response.text ?? '[]').trim());
        if (!Array.isArray(parsed)) throw new Error('Expected JSON array from Gemini');
        return parsed as RawBatchItem[];
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        const safeMsg = scrubSecret(rawMsg, apiKey);

        if (isFatalAuthOrBillingError(safeMsg)) {
          this.fatalHalted = true;
          this.stopRequested = true;
          this.errorCount++;
          this.lastError = `Provider halted (${provider.toUpperCase()}): ${safeMsg.slice(0, 220)}`;
          this.pushLog(this.lastError);
          throw new Error(safeMsg);
        }

        if (isRateLimitError(safeMsg)) {
          rateLimitHits++;
          if (this.minGapMs < 2500) {
            this.minGapMs = 2500;
            this.pushLog(`Rate limit hit on ${provider.toUpperCase()} — backing off gently.`);
          }
          const retryMs = parseRetryDelayMs(safeMsg) ?? Math.min(45_000, 6_000 * rateLimitHits);
          this.nextSlotAt = Math.max(this.nextSlotAt, Date.now() + retryMs);
          if (rateLimitHits >= MAX_RATE_LIMIT_RETRIES) {
            this.errorCount++;
            this.lastError = `Rate limit reached on ${params.subject} (${provider.toUpperCase()}).`;
            throw new Error(safeMsg);
          }
          await sleep(retryMs);
          continue;
        }

        attempt++;
        if (attempt >= MAX_RETRIES) {
          this.errorCount++;
          this.lastError = `${params.subject} > ${params.topic}: ${safeMsg.slice(0, 180)}`;
          throw new Error(safeMsg);
        }
        await sleep(Math.min(15_000, 1000 * Math.pow(2, attempt)));
      }
    }
    return [];
  }

  private async runBackground(provider: AiSeederProvider, model: string, apiKey: string) {
    try {
      const geminiClient =
        provider === 'gemini'
          ? new GoogleGenAI({
              apiKey,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            })
          : null;

      const existingDocs = await QuestionModel.find(
        {},
        { questionHash: 1, question: 1, subject: 1, topic: 1, source: 1 }
      ).lean();

      this.dbTotal = existingDocs.length;
      const seenHashes = new Set<string>(existingDocs.map((d) => d.questionHash));
      const topicStemsMap = new Map<string, string[]>();
      const topicPyqCountMap = new Map<string, number>();

      for (const d of existingDocs) {
        const tKey = `${d.subject}:::${d.topic}`;
        const list = topicStemsMap.get(tKey) || [];
        list.push(d.question);
        topicStemsMap.set(tKey, list);
        if (d.source === 'pyq') {
          topicPyqCountMap.set(tKey, (topicPyqCountMap.get(tKey) || 0) + 1);
        }
      }

      const subjectsToRun =
        this.subjectFilter === 'all'
          ? FMGE_TOPICS
          : FMGE_TOPICS.filter((s) => s.subject === this.subjectFilter);

      interface TopicTask {
        paper: 'morning' | 'afternoon';
        subject: string;
        topic: string;
        target: number;
        pyqTarget: number;
      }

      const tasks: TopicTask[] = [];
      for (const subj of subjectsToRun) {
        for (const t of subj.topics) {
          const pyqTarget = Math.max(4, Math.round(t.target * 0.2));
          tasks.push({
            paper: subj.paper as 'morning' | 'afternoon',
            subject: subj.subject,
            topic: t.topic,
            target: this.mode === 'pyq_only' ? pyqTarget : t.target,
            pyqTarget: this.mode === 'ai_only' ? 0 : pyqTarget,
          });
        }
      }

      this.pushLog(
        `Started ${this.continuous ? 'continuous' : 'quota/batch'} run via ${provider.toUpperCase()} (${model}) across ${tasks.length} topics. Starting DB count: ${this.dbTotal.toLocaleString()}.`
      );

      const maxForRun =
        !this.continuous && this.limit && this.limit > 0 ? this.limit : Infinity;

      const insertBatchForTopic = async (
        task: TopicTask,
        desiredBatchCount: number,
        callNumber: number
      ): Promise<number> => {
        const tKey = `${task.subject}:::${task.topic}`;
        const recentStems = topicStemsMap.get(tKey) || [];
        let currentPyqCount = topicPyqCountMap.get(tKey) || 0;

        const isPyqBatch =
          this.mode === 'pyq_only' ||
          (this.mode === 'all' &&
            (currentPyqCount < task.pyqTarget || (this.continuous && callNumber % 5 === 1)));
        const targetYear = PYQ_YEARS[(callNumber + currentPyqCount) % PYQ_YEARS.length];

        this.currentTask = `Round ${this.round} · ${task.subject} > ${task.topic} (${isPyqBatch ? 'PYQ' : 'AI'})`;

        let rawBatch: RawBatchItem[] = [];
        try {
          rawBatch = await this.generateBatch(provider, model, apiKey, geminiClient, {
            paper: task.paper,
            subject: task.subject,
            topic: task.topic,
            count: desiredBatchCount,
            isPyqBatch,
            targetYear,
            recentStems,
            callNumber,
          });
        } catch {
          return 0;
        }

        const validDocs = [];
        for (const raw of rawBatch) {
          if (
            validDocs.length >= desiredBatchCount ||
            this.insertedThisRun + validDocs.length >= maxForRun
          ) {
            break;
          }
          if (!validateQuestion(raw)) continue;
          const cleanStem = raw.question.trim();
          const qHash = hashQuestion(cleanStem);
          if (seenHashes.has(qHash)) continue;
          if (recentStems.some((existing) => prefixSimilarity(existing, cleanStem) >= 0.82)) {
            continue;
          }

          const rawYear = Number(raw.pyqYear);
          const assignedYear = isPyqBatch
            ? rawYear >= 2015 && rawYear <= 2025
              ? rawYear
              : targetYear
            : null;

          const normalized = randomizeOptionKeys({
            paper: task.paper,
            subject: task.subject,
            topic: task.topic,
            question: cleanStem,
            questionHash: qHash,
            options: (['A', 'B', 'C', 'D'] as const).map((k) => ({
              key: k,
              text: raw.options.find((o) => o.key.toUpperCase() === k)!.text.trim(),
            })),
            correctKey: raw.correctKey.toUpperCase() as 'A' | 'B' | 'C' | 'D',
            explanation: {
              whyCorrect: raw.explanation.whyCorrect.trim(),
              whyOthersWrong: {
                A: raw.explanation.whyOthersWrong.A.trim(),
                B: raw.explanation.whyOthersWrong.B.trim(),
                C: raw.explanation.whyOthersWrong.C.trim(),
                D: raw.explanation.whyOthersWrong.D.trim(),
              },
              questionConcept: raw.explanation.questionConcept.trim(),
              highYieldPoint: raw.explanation.highYieldPoint.trim(),
              mnemonic: (raw.explanation.mnemonic || '').trim(),
            },
            difficulty: (['easy', 'medium', 'hard'].includes(raw.difficulty)
              ? raw.difficulty
              : 'medium') as 'easy' | 'medium' | 'hard',
            source: (isPyqBatch ? 'pyq' : 'ai_generated') as 'pyq' | 'ai_generated',
            pyqYear: assignedYear,
            verified: false,
            flagged: false,
            flagReason: '',
            tags: Array.isArray(raw.tags)
              ? raw.tags.slice(0, 6).map((tg) => String(tg).trim()).filter(Boolean)
              : [],
          });

          seenHashes.add(qHash);
          recentStems.push(cleanStem);
          validDocs.push(normalized);
        }

        let insertedNow = 0;
        if (validDocs.length > 0) {
          try {
            const inserted = await QuestionModel.insertMany(validDocs, { ordered: false });
            insertedNow = inserted.length;
          } catch (bulkErr: unknown) {
            const e = bulkErr as { insertedDocs?: unknown[]; result?: { nInserted?: number } };
            if (Array.isArray(e?.insertedDocs)) insertedNow = e.insertedDocs.length;
            else if (typeof e?.result?.nInserted === 'number') insertedNow = e.result.nInserted;
          }
        }

        if (insertedNow > 0) {
          this.insertedThisRun += insertedNow;
          this.dbTotal += insertedNow;
          if (isPyqBatch) {
            currentPyqCount += insertedNow;
            this.pyqInsertedThisRun += insertedNow;
          } else {
            this.aiInsertedThisRun += insertedNow;
          }

          topicStemsMap.set(tKey, recentStems);
          topicPyqCountMap.set(tKey, currentPyqCount);

          // Keep latest 5 generated question previews (question + answer key)
          const previews: RecentGeneratedPreview[] = validDocs.slice(0, 3).map((d) => ({
            subject: d.subject,
            topic: d.topic,
            question: d.question.slice(0, 140),
            correctKey: d.correctKey,
            source: d.source,
            pyqYear: d.pyqYear,
          }));
          this.recentGenerated = [...previews, ...this.recentGenerated].slice(0, 6);

          if (this.mode !== 'pyq_only') {
            await SeedProgressModel.updateOne(
              { subject: task.subject, topic: task.topic },
              {
                $set: {
                  generated: recentStems.length,
                  target: task.target,
                  updatedAt: new Date(),
                },
              },
              { upsert: true }
            ).catch(() => {});
          }

          const logLine = `R${this.round} · ${task.subject} > ${task.topic} [${isPyqBatch ? 'PYQ' : 'AI'}]: +${insertedNow} | DB total ${this.dbTotal.toLocaleString()}`;
          this.pushLog(logLine);
          console.log(`[BulkSeeder] ${logLine}`);
        }

        return insertedNow;
      };

      // Mode 1: Continuous loop until admin clicks Stop
      if (this.continuous) {
        let roundNumber = 1;
        while (!this.stopRequested) {
          this.round = roundNumber;
          // Prioritize topics with fewest questions first so all subjects grow evenly
          const orderedTasks = [...tasks].sort((a, b) => {
            const countA = (topicStemsMap.get(`${a.subject}:::${a.topic}`) || []).length;
            const countB = (topicStemsMap.get(`${b.subject}:::${b.topic}`) || []).length;
            const deficitA = countA / Math.max(1, a.target);
            const deficitB = countB / Math.max(1, b.target);
            return deficitA - deficitB;
          });

          let cursor = 0;
          let insertedThisRound = 0;

          const worker = async () => {
            while (!this.stopRequested) {
              const idx = cursor++;
              if (idx >= orderedTasks.length) return;
              const task = orderedTasks[idx];
              const existingCount = (topicStemsMap.get(`${task.subject}:::${task.topic}`) || [])
                .length;
              const callNumber = Math.floor(existingCount / BATCH_SIZE) + roundNumber;
              const added = await insertBatchForTopic(task, BATCH_SIZE, callNumber);
              insertedThisRound += added;
            }
          };

          await Promise.all(Array.from({ length: this.concurrency }, () => worker()));

          if (this.stopRequested) break;
          if (insertedThisRound === 0) {
            this.pushLog('No new unique MCQs inserted in this wave — pausing briefly before retrying.');
            await sleep(5000);
          }
          roundNumber++;
        }
      } else {
        // Mode 2: Finite quota or batch limit run
        let cursor = 0;
        const processTopicToTarget = async (task: TopicTask) => {
          const tKey = `${task.subject}:::${task.topic}`;
          let existingCount = (topicStemsMap.get(tKey) || []).length;
          let currentPyqCount = topicPyqCountMap.get(tKey) || 0;
          let generatedCount = this.mode === 'pyq_only' ? currentPyqCount : existingCount;

          // If running a fixed batch (e.g., 50 / 200 / 1000) and all topics already exceed target, still allow adding new questions up to maxForRun
          const topicCap =
            Number.isFinite(maxForRun) && generatedCount >= task.target
              ? generatedCount + BATCH_SIZE
              : task.target;

          if (generatedCount >= topicCap) return;

          let callNumber = Math.floor(generatedCount / BATCH_SIZE) + 1;
          let consecutiveEmpty = 0;

          while (
            !this.stopRequested &&
            generatedCount < topicCap &&
            this.insertedThisRun < maxForRun
          ) {
            const remainingTopic = topicCap - generatedCount;
            const remainingRun = maxForRun - this.insertedThisRun;
            const requested = Math.min(BATCH_SIZE, remainingTopic, remainingRun);
            if (requested <= 0) break;

            const added = await insertBatchForTopic(task, requested, callNumber);
            if (added === 0) {
              consecutiveEmpty++;
              if (consecutiveEmpty >= 3) break;
            } else {
              consecutiveEmpty = 0;
              existingCount = (topicStemsMap.get(tKey) || []).length;
              currentPyqCount = topicPyqCountMap.get(tKey) || 0;
              generatedCount = this.mode === 'pyq_only' ? currentPyqCount : existingCount;
            }
            callNumber++;
          }
        };

        const worker = async () => {
          while (!this.stopRequested && this.insertedThisRun < maxForRun) {
            const idx = cursor++;
            if (idx >= tasks.length) return;
            await processTopicToTarget(tasks[idx]);
          }
        };

        await Promise.all(Array.from({ length: this.concurrency }, () => worker()));
      }

      this.currentTask = this.fatalHalted
        ? 'Halted — check provider key/quota'
        : this.stopRequested
          ? 'Stopped by admin'
          : 'Completed';
      this.pushLog(
        `Finished: +${this.insertedThisRun.toLocaleString()} added (PYQs: ${this.pyqInsertedThisRun.toLocaleString()}, AI: ${this.aiInsertedThisRun.toLocaleString()}). Total in fmge_prep: ${this.dbTotal.toLocaleString()}.`
      );
    } catch (err) {
      const msg = scrubSecret(err instanceof Error ? err.message : String(err), apiKey);
      this.lastError = msg;
      this.errorCount++;
      this.currentTask = 'Halted with error';
      this.pushLog(`Fatal error: ${msg}`);
    } finally {
      this.running = false;
      this.stopRequested = false;
      this.finishedAt = new Date().toISOString();
    }
  }
}

export const bulkSeeder = new BulkSeederManager();
