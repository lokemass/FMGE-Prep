import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type {
  OptionKey,
  QuestionExplanation,
  QuestionSource,
  SimilarQuestionData,
} from '../types.ts';

interface ExplanationPanelProps {
  questionId: string;
  correctKey: OptionKey;
  selectedKey?: OptionKey | null;
  explanation: QuestionExplanation;
  source: QuestionSource;
  verified: boolean;
  token?: string | null;
  showAiButtons?: boolean;
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

export function ExplanationPanel({
  questionId,
  correctKey,
  selectedKey,
  explanation,
  source,
  verified,
  token,
  showAiButtons = true,
}: ExplanationPanelProps) {
  const [aiLoading, setAiLoading] = useState<'deep' | 'beginner' | 'similar' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deepText, setDeepText] = useState<string | null>(null);
  const [beginnerText, setBeginnerText] = useState<string | null>(null);
  const [similarMcq, setSimilarMcq] = useState<SimilarQuestionData | null>(null);
  const [similarChoice, setSimilarChoice] = useState<OptionKey | null>(null);

  async function requestAi(mode: 'deep' | 'beginner' | 'similar') {
    setAiLoading(mode);
    setAiError(null);
    try {
      const res = await api.explainQuestion(
        { questionId, selectedKey: selectedKey ?? null, mode },
        token
      );
      if (res.mode === 'deep') {
        setDeepText(res.content);
      } else if (res.mode === 'beginner') {
        setBeginnerText(res.content);
      } else if (res.mode === 'similar') {
        setSimilarMcq(res.similarQuestion);
        setSimilarChoice(null);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not fetch AI explanation.');
    } finally {
      setAiLoading(null);
    }
  }

  return (
    <div className="mt-6 space-y-5 border-t border-slate-200 dark:border-slate-800 pt-6">
      {/* Unverified AI-generated textbook verification notice */}
      {source === 'ai_generated' && !verified && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>AI-generated, verify with a standard textbook</span>
        </div>
      )}

      {/* 1. Why Correct */}
      <div>
        <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
          Why Option {correctKey} is Correct
        </h3>
        <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 max-w-prose">
          {explanation.whyCorrect}
        </p>
      </div>

      {/* 2. What this question is testing */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
          What This Question Is Testing
        </h3>
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 max-w-prose">
          {explanation.questionConcept}
        </p>
      </div>

      {/* 3. Why Each Other Option Is Wrong */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Option-by-Option Breakdown
        </h3>
        <div className="space-y-2.5">
          {OPTION_KEYS.map((key) => {
            const isRight = key === correctKey;
            const isPickedWrong = selectedKey === key && !isRight;
            const rationale = explanation.whyOthersWrong?.[key];
            if (!rationale) return null;
            return (
              <div
                key={key}
                className={`p-3 rounded-lg border text-sm leading-relaxed ${
                  isRight
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 text-slate-800 dark:text-slate-200'
                    : isPickedWrong
                    ? 'bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 text-slate-800 dark:text-slate-200'
                    : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="font-mono font-semibold mr-2">
                  {key}
                  {isRight ? ' (Correct)' : isPickedWrong ? ' (Your Pick)' : ''}:
                </span>
                <span>{rationale}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. High-Yield Point & Optional Mnemonic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
        <div className="p-4 rounded-xl bg-teal-50/60 dark:bg-teal-950/25 border border-teal-200/80 dark:border-teal-900/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 dark:text-teal-300 mb-1.5">
            <Lightbulb className="w-4 h-4 shrink-0" />
            <span>High-Yield Takeaway</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            {explanation.highYieldPoint}
          </p>
        </div>

        {explanation.mnemonic && explanation.mnemonic.trim().length > 0 && (
          <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              <BookOpen className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
              <span>Mnemonic</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
              {explanation.mnemonic}
            </p>
          </div>
        )}
      </div>

      {/* 5. Interactive Gemini Study Tutor Buttons */}
      {showAiButtons && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={aiLoading !== null}
              onClick={() => requestAi('deep')}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {aiLoading === 'deep' ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              ) : (
                <BookOpen className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              )}
              <span>Explain more</span>
            </button>

            <button
              type="button"
              disabled={aiLoading !== null}
              onClick={() => requestAi('beginner')}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {aiLoading === 'beginner' ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              ) : (
                <GraduationCap className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              )}
              <span>Explain like I&apos;m a beginner</span>
            </button>

            <button
              type="button"
              disabled={aiLoading !== null}
              onClick={() => requestAi('similar')}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-teal-700/30 dark:border-teal-500/40 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/70 dark:hover:bg-teal-900/40 text-sm font-medium text-teal-900 dark:text-teal-200 inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {aiLoading === 'similar' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Give me a similar question</span>
            </button>
          </div>

          {aiError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {aiError}
            </div>
          )}

          {deepText && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Deeper Clinical Explanation
              </h4>
              <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line max-w-prose">
                {deepText}
              </div>
            </div>
          )}

          {beginnerText && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Beginner-Friendly Breakdown
              </h4>
              <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line max-w-prose">
                {beginnerText}
              </div>
            </div>
          )}

          {similarMcq && (
            <div className="mt-4 p-5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-teal-200 dark:border-teal-900/60 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-teal-800 dark:text-teal-300">
                  Similar Practice Question
                </span>
                <span>AI-generated, verify with a standard textbook</span>
              </div>

              <p className="text-[15px] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                {similarMcq.question}
              </p>

              <div className="space-y-2">
                {similarMcq.options.map((opt) => {
                  const chosen = similarChoice === opt.key;
                  const isCorrect = opt.key === similarMcq.correctKey;
                  const revealed = similarChoice !== null;

                  let style =
                    'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-400 text-slate-800 dark:text-slate-200';
                  if (revealed && isCorrect) {
                    style =
                      'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-500 text-emerald-950 dark:text-emerald-100';
                  } else if (revealed && chosen && !isCorrect) {
                    style =
                      'bg-red-50 dark:bg-red-950/35 border-red-500 text-red-950 dark:text-red-100';
                  }

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={revealed}
                      onClick={() => setSimilarChoice(opt.key)}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border text-left text-sm flex items-center justify-between gap-3 transition-colors ${style}`}
                    >
                      <span className="flex items-start gap-2.5">
                        <span className="font-mono font-semibold shrink-0">{opt.key}.</span>
                        <span>{opt.text}</span>
                      </span>
                      {revealed && isCorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Correct
                        </span>
                      )}
                      {revealed && chosen && !isCorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 shrink-0">
                          <XCircle className="w-4 h-4" />
                          Incorrect
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {similarChoice && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <p>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Answer ({similarMcq.correctKey}):{' '}
                    </span>
                    {similarMcq.explanation.whyCorrect}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      High-Yield Point:{' '}
                    </span>
                    {similarMcq.explanation.highYieldPoint}
                  </p>
                  {similarMcq.explanation.mnemonic && (
                    <p>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Mnemonic:{' '}
                      </span>
                      {similarMcq.explanation.mnemonic}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
