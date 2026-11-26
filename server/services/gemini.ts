import { GoogleGenAI, Type } from '@google/genai';
import type { OptionKey, QuestionExplanation, QuestionOption } from '../data/sampleQuestions.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets (or .env) to enable Gemini explanations.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ExplainRequestContext {
  subject: string;
  topic: string;
  question: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  selectedKey?: OptionKey | null;
  explanation: QuestionExplanation;
  mode: 'deep' | 'beginner' | 'similar';
}

export interface SimilarQuestionOutput {
  question: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  explanation: {
    whyCorrect: string;
    whyOthersWrong: Record<OptionKey, string>;
    questionConcept: string;
    highYieldPoint: string;
    mnemonic: string;
  };
}

export async function generateStudyAid(
  ctx: ExplainRequestContext
): Promise<{ mode: 'deep' | 'beginner'; content: string } | { mode: 'similar'; similarQuestion: SimilarQuestionOutput }> {
  const ai = getGeminiClient();

  const optionsText = ctx.options.map((o) => `${o.key}. ${o.text}`).join('\n');
  const chosenSummary = ctx.selectedKey
    ? `The student selected option ${ctx.selectedKey} (${
        ctx.selectedKey === ctx.correctKey ? 'CORRECT' : 'INCORRECT'
      }).`
    : 'The student is reviewing this question.';

  if (ctx.mode === 'deep') {
    const prompt = `You are a senior Indian medical faculty member preparing doctors for the FMGE (Foreign Medical Graduate Examination).
Subject: ${ctx.subject} | Topic: ${ctx.topic}

Question:
${ctx.question}

Options:
${optionsText}

Correct Answer: ${ctx.correctKey}
${chosenSummary}

Existing brief explanation:
${ctx.explanation.whyCorrect}

Provide a deeper, structured clinical explanation (around 220-320 words) covering:
1. Pathophysiological or anatomical mechanism behind the correct answer.
2. Specifically address why the student's chosen option (${ctx.selectedKey ?? 'N/A'}) is right or what clinical trap makes it tempting if wrong.
3. Relevant current Indian clinical guidelines or standard textbook correlations (Harrison/Robbins/Park/Bailey & Love/Dutta as applicable).
4. Two rapid-fire FMGE exam pearls commonly asked around this exact topic.

Use clear plain prose with clean numbered headings—do not use raw HTML.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'You are an accurate, concise Indian medical educator for FMGE candidates. Never hallucinate guidelines; flag any textbook nuances clearly.',
      },
    });

    const text = (response.text ?? '').trim();
    if (!text) {
      throw new Error('Gemini returned an empty explanation. Please try again.');
    }
    return { mode: 'deep', content: text };
  }

  if (ctx.mode === 'beginner') {
    const prompt = `Explain this FMGE medical MCQ as if teaching a first-time medical learner who wants crystal-clear intuition from first principles.

Subject: ${ctx.subject} | Topic: ${ctx.topic}
Question: ${ctx.question}
Options:
${optionsText}
Correct Answer: ${ctx.correctKey}
${chosenSummary}

Keep it warm, intuitive, and easy to remember (around 180-250 words):
1. Start with a simple everyday analogy or core physiological logic.
2. Walk step-by-step from the clues in the question stem to option ${ctx.correctKey}.
3. Briefly explain in one line each why the wrong choices don't fit.
4. End with one crisp memory hook.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'You simplify complex medical concepts for FMGE students without sacrificing clinical accuracy.',
      },
    });

    const text = (response.text ?? '').trim();
    if (!text) {
      throw new Error('Gemini returned an empty beginner explanation. Please try again.');
    }
    return { mode: 'beginner', content: text };
  }

  // mode === 'similar'
  const similarPrompt = `Generate ONE brand-new, original FMGE-style medical MCQ that tests the SAME core clinical concept as the question below, but uses a fresh clinical vignette or complementary angle so the student can verify mastery.

Reference Subject: ${ctx.subject}
Reference Topic: ${ctx.topic}
Reference Concept: ${ctx.explanation.questionConcept}
Reference Question (DO NOT copy wording): ${ctx.question}

Requirements:
- Exactly 4 options labeled A, B, C, D with one unambiguous correct answer.
- Reflect current Indian clinical guidelines where relevant.
- Provide a complete structured explanation including whyCorrect, whyOthersWrong (for A, B, C, D), questionConcept, highYieldPoint, and a helpful mnemonic (or empty string if none).`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: similarPrompt,
    config: {
      systemInstruction:
        'You write high-yield, unambiguous FMGE medical exam questions with complete clinical explanations in strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
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
        },
        required: ['question', 'options', 'correctKey', 'explanation'],
      },
    },
  });

  const raw = (response.text ?? '').trim();
  const parsed = JSON.parse(raw) as SimilarQuestionOutput;
  if (
    !parsed?.question ||
    !Array.isArray(parsed.options) ||
    parsed.options.length !== 4 ||
    !['A', 'B', 'C', 'D'].includes(parsed.correctKey)
  ) {
    throw new Error('Failed to generate a valid similar MCQ. Please try again.');
  }

  return { mode: 'similar', similarQuestion: parsed };
}
