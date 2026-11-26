import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileJson,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  validateAndExpandClientBatch,
  type ClientValidationError,
  type ExpandedUploadQuestion,
} from '../lib/bulkUploadNormalizer.ts';
import type { JsonImportBatchResponse, QuestionSource } from '../types.ts';

interface BulkJsonUploadCardProps {
  adminToken: string;
  dbName?: string;
  onImportComplete: () => void;
}

const INSERT_CHUNK_SIZE = 200;
const HASH_CHECK_CHUNK_SIZE = 1000;

interface PreflightReport {
  rawTotal: number;
  readyToInsert: ExpandedUploadQuestion[];
  intraBatchDuplicates: number;
  existingDbDuplicates: number;
  expandedExplanationCount: number;
  errors: ClientValidationError[];
}

function extractJsonArrayFromText(rawText: string): unknown[] {
  let cleaned = rawText.trim();
  if (!cleaned) {
    throw new Error('Paste a JSON array or choose a .json file first.');
  }

  // Strip markdown ```json ... ``` fences if pasted directly from an AI chat
  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    cleaned = fenced[1].trim();
  }

  const parsed: unknown = JSON.parse(cleaned);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.questions)) return obj.questions;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (typeof obj.question === 'string') return [obj];
  }

  throw new Error('JSON must be an array of question objects (or { "questions": [...] }).');
}

export function BulkJsonUploadCard({
  adminToken,
  dbName = 'fmge_prep',
  onImportComplete,
}: BulkJsonUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analysisRunRef = useRef(0);

  const [pasteText, setPasteText] = useState('');
  const [loadedFileNames, setLoadedFileNames] = useState<string[]>([]);
  const [rawItems, setRawItems] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [defaultSource, setDefaultSource] = useState<'auto' | QuestionSource>('auto');
  const [defaultPyqYear, setDefaultPyqYear] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [showSamplePreview, setShowSamplePreview] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    batch: number;
    totalBatches: number;
  } | null>(null);
  const [summary, setSummary] = useState<JsonImportBatchResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Run client-side validation + 5-field explanation expansion + normalized SHA-256 DB duplicate check
  useEffect(() => {
    if (!rawItems || rawItems.length === 0) {
      setPreflight(null);
      setAnalyzing(false);
      return;
    }

    const runId = ++analysisRunRef.current;
    setAnalyzing(true);
    setUploadError(null);

    const parsedYearNum = defaultPyqYear.trim() ? Number.parseInt(defaultPyqYear.trim(), 10) : null;
    const validYear =
      parsedYearNum !== null &&
      Number.isInteger(parsedYearNum) &&
      parsedYearNum >= 2005 &&
      parsedYearNum <= 2030
        ? parsedYearNum
        : null;

    void (async () => {
      try {
        const prepared = await validateAndExpandClientBatch(rawItems, {
          defaultSource,
          defaultPyqYear: validYear,
        });

        if (analysisRunRef.current !== runId) return;

        // Check normalized SHA-256 hashes against the existing MongoDB collection before insert
        const existingSet = new Set<string>();
        const hashes = prepared.validItems.map((item) => item.questionHash);
        for (let i = 0; i < hashes.length; i += HASH_CHECK_CHUNK_SIZE) {
          const chunk = hashes.slice(i, i + HASH_CHECK_CHUNK_SIZE);
          const res = await api.checkAdminQuestionHashes(chunk, adminToken);
          for (const h of res.existingHashes) existingSet.add(h);
        }

        if (analysisRunRef.current !== runId) return;

        const readyToInsert = prepared.validItems.filter((item) => !existingSet.has(item.questionHash));
        const existingDbDuplicates = prepared.validItems.length - readyToInsert.length;

        setPreflight({
          rawTotal: rawItems.length,
          readyToInsert,
          intraBatchDuplicates: prepared.intraBatchDuplicates,
          existingDbDuplicates,
          expandedExplanationCount: readyToInsert.filter((q) => q.wasExplanationExpanded).length,
          errors: prepared.errors,
        });
      } catch (err) {
        if (analysisRunRef.current !== runId) return;
        setPreflight(null);
        setUploadError(
          err instanceof Error ? err.message : 'Failed to validate and check duplicates.'
        );
      } finally {
        if (analysisRunRef.current === runId) {
          setAnalyzing(false);
        }
      }
    })();
  }, [rawItems, defaultSource, defaultPyqYear, adminToken]);

  function handlePasteChange(value: string) {
    setPasteText(value);
    setLoadedFileNames([]);
    setSummary(null);
    setUploadError(null);

    if (!value.trim()) {
      setRawItems(null);
      setParseError(null);
      return;
    }

    try {
      const arr = extractJsonArrayFromText(value);
      setRawItems(arr);
      setParseError(null);
    } catch (err) {
      setRawItems(null);
      setPreflight(null);
      setParseError(err instanceof Error ? err.message : 'Invalid JSON syntax.');
    }
  }

  async function processFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith('.json') || f.type === 'application/json'
    );
    if (list.length === 0) {
      setParseError('Please select one or more valid .json files.');
      return;
    }

    setSummary(null);
    setUploadError(null);
    setPasteText('');

    const combined: unknown[] = [];
    const names: string[] = [];

    try {
      for (const file of list) {
        const text = await file.text();
        const items = extractJsonArrayFromText(text);
        combined.push(...items);
        names.push(`${file.name} (${items.length})`);
      }
      setLoadedFileNames(names);
      setRawItems(combined);
      setParseError(null);
    } catch (err) {
      setLoadedFileNames([]);
      setRawItems(null);
      setPreflight(null);
      setParseError(
        err instanceof Error ? `Failed to parse JSON file: ${err.message}` : 'Failed to parse JSON file.'
      );
    }
  }

  function handleClear() {
    analysisRunRef.current++;
    setPasteText('');
    setLoadedFileNames([]);
    setRawItems(null);
    setPreflight(null);
    setParseError(null);
    setUploadError(null);
    setSummary(null);
    setProgress(null);
    setShowSamplePreview(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUpload() {
    if (!preflight || preflight.readyToInsert.length === 0 || uploading || analyzing) return;

    setUploading(true);
    setUploadError(null);
    setSummary(null);

    const toSend = preflight.readyToInsert.map(
      ({ wasExplanationExpanded: _w, sourceRowIndex: _idx, questionHash: _h, ...cleanDoc }) => cleanDoc
    );
    const totalBatches = Math.ceil(toSend.length / INSERT_CHUNK_SIZE);

    const aggregate: JsonImportBatchResponse = {
      received: preflight.rawTotal,
      inserted: 0,
      duplicatesSkipped: preflight.intraBatchDuplicates + preflight.existingDbDuplicates,
      invalidSkipped: preflight.errors.length,
      errors: preflight.errors.slice(0, 15),
    };

    try {
      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const start = batchIdx * INSERT_CHUNK_SIZE;
        const slice = toSend.slice(start, start + INSERT_CHUNK_SIZE);

        setProgress({
          current: start,
          total: toSend.length,
          batch: batchIdx + 1,
          totalBatches,
        });

        const res = await api.importAdminJsonBatch(
          {
            questions: slice,
            defaultSource: 'auto',
            defaultPyqYear: null,
          },
          adminToken
        );

        aggregate.inserted += res.inserted;
        aggregate.duplicatesSkipped += res.duplicatesSkipped;
        aggregate.invalidSkipped += res.invalidSkipped;
      }

      setProgress({
        current: toSend.length,
        total: toSend.length,
        batch: totalBatches,
        totalBatches,
      });
      setSummary(aggregate);
      // Clear preflight ready queue so clicking again doesn't re-send already inserted items
      setPreflight((prev) =>
        prev
          ? {
              ...prev,
              existingDbDuplicates: prev.existingDbDuplicates + aggregate.inserted,
              readyToInsert: [],
            }
          : null
      );
      onImportComplete();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Bulk upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;
  const totalDuplicates = preflight
    ? preflight.intraBatchDuplicates + preflight.existingDbDuplicates
    : 0;
  const previewSample = preflight?.readyToInsert[0] ?? null;

  return (
    <section
      aria-label="Bulk Upload"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FileJson className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Bulk Upload
            </h2>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              DB: {dbName}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Upload <code className="font-mono">.json</code> files or paste a JSON array. Each question is validated, checked against existing normalized question hashes in <code className="font-mono">{dbName}</code>, and simple explanation strings are automatically expanded into the 5-field FMGE schema before insert.
          </p>
        </div>

        {(rawItems || pasteText || loadedFileNames.length > 0) && !uploading && (
          <button
            type="button"
            onClick={handleClear}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* .json File Input & Drag-Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!uploading && e.dataTransfer.files?.length) {
            void processFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          isDragging
            ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/30'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          multiple
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.length) {
              void processFiles(e.target.files);
            }
          }}
          className="hidden"
          id="bulk-json-file-input"
        />

        <div className="flex flex-col items-center gap-2">
          <Upload className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Drop one or more <code className="font-mono font-semibold">.json</code> files here, or{' '}
            <label
              htmlFor="bulk-json-file-input"
              className="font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              browse .json files
            </label>
          </p>
          {loadedFileNames.length > 0 && (
            <p className="text-xs font-mono text-teal-800 dark:text-teal-300">
              Loaded: {loadedFileNames.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Paste JSON Array Text-Area */}
      <div>
        <label
          htmlFor="bulk-json-paste"
          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
        >
          Or Paste JSON Array
        </label>
        <textarea
          id="bulk-json-paste"
          rows={5}
          disabled={uploading}
          value={pasteText}
          onChange={(e) => handlePasteChange(e.target.value)}
          placeholder='Paste JSON array here, e.g. [{"subject":"Pharmacology","topic":"ATT","question":"...","options":["A","B","C","D"],"correctKey":"B","explanation":"Simple explanation string or 5-field object"}]'
          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400 disabled:opacity-60"
        />
      </div>

      {/* Tagging Overrides + Upload Button */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Source Tagging
          </label>
          <select
            value={defaultSource}
            disabled={uploading}
            onChange={(e) => setDefaultSource(e.target.value as 'auto' | QuestionSource)}
            className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60"
          >
            <option value="auto">Auto-detect from each JSON item</option>
            <option value="pyq">Force all as FMGE PYQ</option>
            <option value="ai_generated">Force all as AI Generated</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Fallback PYQ Year (Optional)
          </label>
          <input
            type="number"
            min={2005}
            max={2030}
            disabled={uploading}
            value={defaultPyqYear}
            onChange={(e) => setDefaultPyqYear(e.target.value)}
            placeholder="e.g. 2024"
            className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60"
          />
        </div>

        <button
          type="button"
          disabled={uploading || analyzing || !preflight || preflight.readyToInsert.length === 0}
          onClick={handleUpload}
          className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {uploading || analyzing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>
            {analyzing
              ? 'Checking Hashes...'
              : uploading
                ? 'Inserting...'
                : preflight
                  ? `Insert ${preflight.readyToInsert.length.toLocaleString()} New Questions`
                  : 'Insert Questions'}
          </span>
        </button>
      </div>

      {/* JSON Parse Error */}
      {parseError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Pre-flight Validation, Hash Dedup & 5-Field Expansion Preview */}
      {preflight && !parseError && !uploading && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Pre-Insert Verification ({preflight.rawTotal.toLocaleString()} parsed)
            </span>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-teal-700 dark:text-teal-400 font-semibold">
                {preflight.readyToInsert.length.toLocaleString()} new ready
              </span>
              <span className="text-slate-600 dark:text-slate-400">
                {totalDuplicates.toLocaleString()} duplicate{totalDuplicates === 1 ? '' : 's'} skipped
              </span>
              {preflight.expandedExplanationCount > 0 && (
                <span className="text-indigo-700 dark:text-indigo-400">
                  {preflight.expandedExplanationCount.toLocaleString()} expanded to 5-field schema
                </span>
              )}
              {preflight.errors.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {preflight.errors.length.toLocaleString()} invalid
                </span>
              )}
            </div>
          </div>

          {previewSample && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSamplePreview((v) => !v)}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {showSamplePreview
                    ? 'Hide normalized 5-field preview'
                    : 'Preview first normalized 5-field question'}
                </span>
              </button>

              {showSamplePreview && (
                <div className="mt-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {previewSample.paper.toUpperCase()} · {previewSample.subject} · {previewSample.topic} · Key: {previewSample.correctKey} · Hash: {previewSample.questionHash.slice(0, 12)}...
                  </div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{previewSample.question}</p>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 pt-1">
                    <div>
                      <strong>whyCorrect:</strong> {previewSample.explanation.whyCorrect}
                    </div>
                    <div>
                      <strong>questionConcept:</strong> {previewSample.explanation.questionConcept}
                    </div>
                    <div>
                      <strong>highYieldPoint:</strong> {previewSample.explanation.highYieldPoint}
                    </div>
                    <div>
                      <strong>whyOthersWrong:</strong> A–D populated
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {preflight.errors.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Validation issues ({Math.min(15, preflight.errors.length)} of {preflight.errors.length} shown):
              </p>
              <div className="max-h-28 overflow-y-auto font-mono text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                {preflight.errors.slice(0, 15).map((err, idx) => (
                  <div key={idx}>
                    Row #{err.index + 1}: {err.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chunk Upload Progress */}
      {uploading && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
            <span>
              Inserting batch {progress.batch} of {progress.totalBatches}...
            </span>
            <span>
              {progress.current.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-600 dark:bg-teal-400 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {uploadError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Final Import Summary */}
      {summary && (
        <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/70 p-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Bulk Upload Complete</span>
          </span>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-emerald-800 dark:text-emerald-300 font-semibold">
              +{summary.inserted.toLocaleString()} inserted
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              {summary.duplicatesSkipped.toLocaleString()} duplicates skipped
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              {summary.invalidSkipped.toLocaleString()} invalid skipped
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
