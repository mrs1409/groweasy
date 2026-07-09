'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Upload, 
  FileText, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Rows3,
  Columns3,
  Check,
  Zap,
  Info,
  Sparkles,
  Clock,
  Download,
  Search,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatBytes } from '@/lib/utils';
import { parseCSVFile } from '@/lib/csv-parser';
import { uploadCSV } from '@/lib/api';
import { auth } from '@/lib/firebase';
import type { ParsedCSV, ImportResultData, CRMRecord, SkippedRecord } from '@/types';

interface ImportCSVViewProps {
  /** Called after a successful import so parent can refresh dashboard/history */
  onImportComplete: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PREVIEW_ROWS = 5;

const PROCESSING_STAGES = [
  { id: 'Uploading CSV', label: 'Uploading CSV file' },
  { id: 'Parsing CSV', label: 'Parsing data structure' },
  { id: 'Creating Batches', label: 'Creating batches' },
  { id: 'AI Extraction', label: 'AI Extraction' },
  { id: 'Validating AI Output', label: 'Validating AI Output' },
  { id: 'Saving to Database', label: 'Saving to Database' },
  { id: 'Completed', label: 'Completed' }
];

export function ImportCSVView({ onImportComplete }: ImportCSVViewProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedCSV | null>(null);
  const [isParsingCSV, setIsParsingCSV] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal processing state
  const [isProcessingModalOpen, setIsProcessingModalOpen] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [progressVal, setProgressVal] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(8);
  const [rowsProcessed, setRowsProcessed] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(1);

  // Result display state
  const [showResults, setShowResults] = useState(false);
  const [resultsData, setResultsData] = useState<ImportResultData | null>(null);
  const [resultsTab, setResultsTab] = useState<'imported' | 'skipped'>('imported');
  const [resultsSearch, setResultsSearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const previewVirtualizer = useVirtualizer({
    count: parsedData?.rows.length ?? 0,
    getScrollElement: () => previewContainerRef.current,
    estimateSize: () => 37,
    overscan: 10,
  });

  const resultsImportedContainerRef = useRef<HTMLDivElement>(null);
  const resultsSkippedContainerRef = useRef<HTMLDivElement>(null);

  const resetAll = () => {
    setFile(null);
    setParsedData(null);
    setResultsData(null);
    setError(null);
    setStep('upload');
    setShowResults(false);
    setIsProcessingModalOpen(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const validateFile = useCallback((file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return 'Please upload a valid CSV file.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds 10MB maximum limit.`;
    }
    if (file.size === 0) {
      return 'File is empty. Please upload a CSV with records.';
    }
    return null;
  }, []);

  const processFileSelection = async (selectedFile: File) => {
    const err = validateFile(selectedFile);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }

    setError(null);
    setFile(selectedFile);
    setIsParsingCSV(true);

    try {
      const parsed = await parseCSVFile(selectedFile);
      if (parsed.totalRows === 0) {
        setError('CSV contains no data rows.');
        setFile(null);
        return;
      }
      setParsedData(parsed);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error parsing CSV file');
      setFile(null);
    } finally {
      setIsParsingCSV(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const selected = e.dataTransfer.files[0];
    if (selected) processFileSelection(selected);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFileSelection(selected);
  };

  const startImportPipeline = async () => {
    if (!file) return;
    setIsProcessingModalOpen(true);
    setCurrentStageIndex(0);
    setProgressVal(5);
    setElapsedTime(0);
    setEstimatedTime(8);
    setRowsProcessed(0);
    setCurrentBatch(1);
    setError(null);

    const progressId = 'prog_' + Math.random().toString(36).substring(2, 15);
    const token = await auth.currentUser?.getIdToken(true) || '';
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const sseUrl = `${apiBase}/imports/progress/${progressId}?token=${token}`;

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.completed) {
          es.close();
          setProgressVal(100);
          setCurrentStageIndex(6);
          return;
        }

        if (data.stage) {
          const idx = PROCESSING_STAGES.findIndex(s => s.id === data.stage);
          if (idx !== -1) {
            setCurrentStageIndex(idx);
          }
        }

        setProgressVal(data.percentage ?? 0);
        setElapsedTime(Math.round((data.elapsedTimeMs ?? 0) / 1000));
        
        if (data.estimatedRemainingTimeMs !== undefined) {
          setEstimatedTime(Math.round(data.estimatedRemainingTimeMs / 1000));
        }

        setRowsProcessed(data.processedRows ?? 0);
        setCurrentBatch(data.currentBatch ?? 1);

        if (data.error) {
          setError(data.error);
          es.close();
          setIsProcessingModalOpen(false);
        }
      } catch (err) {
        console.error('Error parsing SSE progress event', err);
      }
    };

    es.onerror = (e) => {
      console.warn('EventSource connection lost. Attempting to reconnect automatically.', e);
    };

    try {
      const response = await uploadCSV(file, progressId);
      es.close();

      if (response.success) {
        setResultsData(response.data);
        setProgressVal(100);
        setCurrentStageIndex(6); // Completed stage
        setShowResults(true);

        // Notify parent to refresh history/dashboard (DB persistence handled by backend)
        onImportComplete();
      } else {
        setError(response.error?.message || 'AI pipeline processing failed.');
        setIsProcessingModalOpen(false);
      }
    } catch (e) {
      es.close();
      const msg = e instanceof Error ? e.message : 'Connection failed.';
      setError(msg.includes('Failed to fetch') ? 'Cannot connect to backend server on port 3001.' : msg);
      setIsProcessingModalOpen(false);
    }
  };

  // Filter Results
  const filteredResultsImported = useMemo(() => {
    if (!resultsData) return [];
    if (!resultsSearch) return resultsData.records;
    const q = resultsSearch.toLowerCase();
    return resultsData.records.filter(
      r => 
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.company && r.company.toLowerCase().includes(q)) ||
        (r.city && r.city.toLowerCase().includes(q))
    );
  }, [resultsData, resultsSearch]);

  const filteredResultsSkipped = useMemo(() => {
    if (!resultsData) return [];
    if (!resultsSearch) return resultsData.skipped;
    const q = resultsSearch.toLowerCase();
    return resultsData.skipped.filter(
      r => 
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        Object.values(r.originalData).some(val => val && val.toLowerCase().includes(q))
    );
  }, [resultsData, resultsSearch]);

  const resultsImportedVirtualizer = useVirtualizer({
    count: filteredResultsImported.length,
    getScrollElement: () => resultsImportedContainerRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const resultsSkippedVirtualizer = useVirtualizer({
    count: filteredResultsSkipped.length,
    getScrollElement: () => resultsSkippedContainerRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  // Export to CSV Function for results
  const handleExportCSV = () => {
    if (!resultsData) return;
    if (resultsTab === 'imported') {
      const records = resultsData.records;
      if (records.length === 0) return;
      const headers = Object.keys(records[0]).join(',');
      const rows = records.map(r => 
        Object.values(r).map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',')
      );
      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `imported_leads_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const skipped = resultsData.skipped;
      if (skipped.length === 0) return;
      const sampleKeys = Array.from(new Set(skipped.flatMap(s => Object.keys(s.originalData))));
      const headers = ['Skip Reason', ...sampleKeys].join(',');
      const rows = skipped.map(s => {
        const rowVals = [s.reason, ...sampleKeys.map(k => s.originalData[k] || '')];
        return rowVals.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
      });
      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `skipped_records_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      {!showResults ? (
        <>
          {/* Section title */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">Ingest Leads Spreadsheet</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Select or drop any CSV file to run semantic mapping with GPT-5 reasoning pipelines.
            </p>
          </div>

          {step === 'upload' && (
            <div className="space-y-6 max-w-4xl">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'relative cursor-pointer rounded-3xl border-2 border-dashed border-[hsl(var(--border)/0.8)] py-16 px-6 text-center transition-all duration-300 bg-white/30 dark:bg-slate-950/10',
                  'hover:border-indigo-500/50 hover:bg-indigo-500/5',
                  isDragOver && 'border-indigo-500 bg-indigo-500/5 scale-[0.99]',
                  error && 'border-rose-500/50 hover:border-rose-500/50 hover:bg-rose-500/5'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleInputChange}
                  className="hidden"
                />

                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600/5 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                    {isParsingCSV ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                  </div>

                  <div>
                    <p className="text-base font-semibold text-[hsl(var(--foreground))]">
                      {isParsingCSV ? 'Reading rows layout...' : 'Drag & drop your CSV spreadsheet'}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-medium">
                      Requires name/company, and email OR phone field mapped.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-500 bg-rose-500/5 border border-rose-500/10 p-3.5 rounded-xl text-xs font-semibold animate-slide-down">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex justify-between items-center bg-white/40 dark:bg-slate-900/40 p-4 rounded-2xl border border-[hsl(var(--border)/0.5)]">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    const sampleText = "Full Name,Email Address,Phone Number,City,Company,CRM Status,Notes\nJohn Doe,john@example.com,+91 9876543210,Bangalore,GrowEasy,Hot,Interested in CRM\nSarah Johnson,sarah@example.com,+91 9123456789,Mumbai,TechCorp,Contacted,Call next week";
                    const blob = new Blob([sampleText], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = "groweasy_sample_leads.csv";
                    a.click();
                  }}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                >
                  Download Sample CSV
                </a>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-semibold uppercase">Max File Size: 10MB</span>
              </div>
            </div>
          )}

          {step === 'preview' && parsedData && file && (
            <div className="space-y-6 max-w-5xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[hsl(var(--foreground))]">Layout Verification</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    Confirm mapped columns structure for <strong className="text-[hsl(var(--foreground))]">{file.name}</strong>.
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                    <Rows3 className="w-3.5 h-3.5" /> {parsedData.totalRows} rows
                  </span>
                  <span className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                    <Columns3 className="w-3.5 h-3.5" /> {parsedData.headers.length} headers
                  </span>
                </div>
              </div>

              {/* Table Preview */}
              <div 
                ref={previewContainerRef}
                className="border border-[hsl(var(--border)/0.5)] rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto overflow-x-auto custom-scrollbar"
              >
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[hsl(var(--muted)/0.5)] border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] uppercase font-bold tracking-wider">
                      <th className="px-4 py-3 sticky top-0 bg-[hsl(var(--muted)/0.8)] z-10">#</th>
                      {parsedData.headers.map(h => (
                        <th key={h} className="px-4 py-3 whitespace-nowrap sticky top-0 bg-[hsl(var(--muted)/0.8)] z-10">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border)/0.3)] bg-white/30 dark:bg-slate-950/20">
                    {previewVirtualizer.getVirtualItems().length > 0 && previewVirtualizer.getVirtualItems()[0].start > 0 && (
                      <tr>
                        <td style={{ height: `${previewVirtualizer.getVirtualItems()[0].start}px` }} colSpan={parsedData.headers.length + 1} />
                      </tr>
                    )}
                    {previewVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = parsedData.rows[virtualRow.index];
                      return (
                        <tr 
                          key={virtualRow.key} 
                          ref={previewVirtualizer.measureElement}
                          className="hover:bg-[hsl(var(--muted)/0.15)] transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono text-[hsl(var(--muted-foreground))]">{virtualRow.index + 1}</td>
                          {parsedData.headers.map(h => (
                            <td key={h} className="px-4 py-2.5 text-[hsl(var(--foreground))] whitespace-nowrap max-w-[200px] truncate" title={row[h]}>
                              {row[h] || <span className="text-[hsl(var(--muted-foreground)/0.3)] italic">empty</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {previewVirtualizer.getVirtualItems().length > 0 && 
                     (previewVirtualizer.getTotalSize() - previewVirtualizer.getVirtualItems()[previewVirtualizer.getVirtualItems().length - 1].end) > 0 && (
                      <tr>
                        <td 
                          style={{ height: `${previewVirtualizer.getTotalSize() - previewVirtualizer.getVirtualItems()[previewVirtualizer.getVirtualItems().length - 1].end}px` }} 
                          colSpan={parsedData.headers.length + 1} 
                        />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-500 bg-rose-500/5 border border-rose-500/10 p-3.5 rounded-xl text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => { setStep('upload'); setFile(null); }}
                  className="px-5 py-2.5 text-xs font-bold border border-[hsl(var(--border)/0.5)] rounded-xl hover:bg-[hsl(var(--muted)/0.5)] cursor-pointer text-[hsl(var(--foreground))]"
                >
                  Change File
                </button>
                <button
                  onClick={startImportPipeline}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/10 transition-colors cursor-pointer animate-pulse"
                >
                  Confirm Import Layout
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Results View Page */
        <div className="space-y-6 max-w-6xl animate-fade-in">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">Import Pipeline Completed</h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                AI semantic verification has successfully validated ingestion records.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="px-4.5 py-2.5 rounded-xl text-xs font-semibold border border-[hsl(var(--border)/0.5)] bg-white dark:bg-slate-900 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download Mapped CSV
              </button>
              <button
                onClick={resetAll}
                className="px-4.5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New Import
              </button>
            </div>
          </div>

          {/* KPI Statistics */}
          {resultsData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.5)] rounded-2xl p-4 text-center">
                <span className="block text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Total Processed</span>
                <span className="text-2xl font-bold text-[hsl(var(--foreground))] mt-1 block">{resultsData.statistics.totalRows}</span>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
                <span className="block text-[10px] font-bold text-emerald-600 uppercase">Successfully Imported</span>
                <span className="text-2xl font-bold text-emerald-600 mt-1 block">{resultsData.statistics.totalImported}</span>
              </div>
              <div className={cn(
                'rounded-2xl p-4 text-center border',
                resultsData.statistics.totalSkipped > 0 ? 'bg-rose-500/5 border-rose-500/10 text-rose-500' : 'bg-[hsl(var(--muted)/0.3)] border-[hsl(var(--border)/0.5)]'
              )}>
                <span className="block text-[10px] font-bold uppercase">Skipped Rows</span>
                <span className="text-2xl font-bold mt-1 block">{resultsData.statistics.totalSkipped}</span>
              </div>
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 text-center">
                <span className="block text-[10px] font-bold text-indigo-600 uppercase">Duration Time</span>
                <span className="text-2xl font-bold text-indigo-600 mt-1 block">{(resultsData.statistics.processingTimeMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}

          {/* Results Tables Tabs switcher */}
          <div className="flex justify-between items-center border-b border-[hsl(var(--border)/0.5)] pb-px">
            <div className="flex gap-2">
              <button
                onClick={() => { setResultsTab('imported'); setResultsSearch(''); }}
                className={cn(
                  'px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer',
                  resultsTab === 'imported'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                Imported Contacts ({resultsData?.records.length || 0})
              </button>
              <button
                onClick={() => { setResultsTab('skipped'); setResultsSearch(''); }}
                className={cn(
                  'px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer',
                  resultsTab === 'skipped'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                Skipped Logs ({resultsData?.skipped.length || 0})
              </button>
            </div>
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-[hsl(var(--muted-foreground)/0.7)]" />
            <input
              type="text"
              placeholder="Search leads records..."
              value={resultsSearch}
              onChange={(e) => setResultsSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border)/0.5)] bg-white/70 dark:bg-slate-900/70 text-sm outline-none"
            />
          </div>

          {/* Result tables */}
          <div className="glass-card rounded-2xl overflow-hidden border border-[hsl(var(--border)/0.5)]">
            {resultsTab === 'imported' ? (
              filteredResultsImported.length > 0 ? (
                <div ref={resultsImportedContainerRef} className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] uppercase font-bold">
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Name</th>
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Email</th>
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Phone</th>
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">City/Country</th>
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">CRM Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border)/0.3)]">
                      {resultsImportedVirtualizer.getVirtualItems().length > 0 && resultsImportedVirtualizer.getVirtualItems()[0].start > 0 && (
                        <tr>
                          <td style={{ height: `${resultsImportedVirtualizer.getVirtualItems()[0].start}px` }} colSpan={5} />
                        </tr>
                      )}
                      {resultsImportedVirtualizer.getVirtualItems().map((virtualRow) => {
                        const lead = filteredResultsImported[virtualRow.index];
                        return (
                          <tr 
                            key={virtualRow.key} 
                            ref={resultsImportedVirtualizer.measureElement}
                            className="hover:bg-[hsl(var(--muted)/0.25)] transition-colors"
                          >
                            <td className="px-5 py-3 font-semibold text-[hsl(var(--foreground))]">{lead.name || 'No Name'}</td>
                            <td className="px-5 py-3 text-[hsl(var(--muted-foreground))]">{lead.email}</td>
                            <td className="px-5 py-3 font-mono text-[hsl(var(--foreground))]">{lead.country_code ? `${lead.country_code} ` : ''}{lead.mobile_without_country_code}</td>
                            <td className="px-5 py-3 text-[hsl(var(--muted-foreground))]">{lead.city}{lead.country ? `, ${lead.country}` : ''}</td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                {lead.crm_status || 'UNKNOWN'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {resultsImportedVirtualizer.getVirtualItems().length > 0 && 
                       (resultsImportedVirtualizer.getTotalSize() - resultsImportedVirtualizer.getVirtualItems()[resultsImportedVirtualizer.getVirtualItems().length - 1].end) > 0 && (
                        <tr>
                          <td 
                            style={{ height: `${resultsImportedVirtualizer.getTotalSize() - resultsImportedVirtualizer.getVirtualItems()[resultsImportedVirtualizer.getVirtualItems().length - 1].end}px` }} 
                            colSpan={5} 
                          />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[hsl(var(--muted-foreground))]">No records match your search filter.</div>
              )
            ) : (
              filteredResultsSkipped.length > 0 ? (
                <div ref={resultsSkippedContainerRef} className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] uppercase font-bold">
                        <th className="px-5 py-3 w-24 sticky top-0 bg-[hsl(var(--card))] z-10">Row Index</th>
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Reason</th>
                        <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Original Values</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border)/0.3)]">
                      {resultsSkippedVirtualizer.getVirtualItems().length > 0 && resultsSkippedVirtualizer.getVirtualItems()[0].start > 0 && (
                        <tr>
                          <td style={{ height: `${resultsSkippedVirtualizer.getVirtualItems()[0].start}px` }} colSpan={3} />
                        </tr>
                      )}
                      {resultsSkippedVirtualizer.getVirtualItems().map((virtualRow) => {
                        const skip = filteredResultsSkipped[virtualRow.index];
                        return (
                          <tr 
                            key={virtualRow.key} 
                            ref={resultsSkippedVirtualizer.measureElement}
                            className="hover:bg-[hsl(var(--muted)/0.25)]"
                          >
                            <td className="px-5 py-3 font-mono text-[hsl(var(--muted-foreground))]">Row #{skip.rowIndex + 1}</td>
                            <td className="px-5 py-3 text-rose-500 font-semibold">{skip.reason}</td>
                            <td className="px-5 py-3 text-[hsl(var(--muted-foreground))] max-w-sm truncate" title={JSON.stringify(skip.originalData)}>
                              {Object.entries(skip.originalData).map(([k,v]) => `${k}:${v || '-'}`).join(', ')}
                            </td>
                          </tr>
                        );
                      })}
                      {resultsSkippedVirtualizer.getVirtualItems().length > 0 && 
                       (resultsSkippedVirtualizer.getTotalSize() - resultsSkippedVirtualizer.getVirtualItems()[resultsSkippedVirtualizer.getVirtualItems().length - 1].end) > 0 && (
                        <tr>
                          <td 
                            style={{ height: `${resultsSkippedVirtualizer.getTotalSize() - resultsSkippedVirtualizer.getVirtualItems()[resultsSkippedVirtualizer.getVirtualItems().length - 1].end}px` }} 
                            colSpan={3} 
                          />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[hsl(var(--muted-foreground))]">No skipped records logs.</div>
              )
            )}
          </div>
        </div>
      )}

      {/* Processing Modal Overlay */}
      <AnimatePresence>
        {isProcessingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-[16px]"
            />

            {/* Dialog Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md glass-card rounded-3xl p-6 sm:p-8 bg-white/80 dark:bg-slate-900/80 border border-white/20 dark:border-white/5 shadow-2xl flex flex-col items-center text-center gap-6"
            >
              {/* Spinner */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-[hsl(var(--muted))]" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5.5 h-5.5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[hsl(var(--foreground))]">
                  AI Importer Running
                </h3>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">
                  GPT-5 is normalizing values and running verification rules.
                </p>
              </div>

              {/* Progress bar info */}
              <div className="w-full space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">
                  <span>Progress</span>
                  <span>{Math.floor(progressVal)}%</span>
                </div>
                <div className="w-full bg-[hsl(var(--muted))] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressVal}%` }}
                  />
                </div>
              </div>

              {/* Micro specs stats */}
              <div className="grid grid-cols-2 gap-4 w-full bg-[hsl(var(--muted)/0.3)] p-3.5 rounded-2xl border border-[hsl(var(--border)/0.5)] text-left text-[11px]">
                <div>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] uppercase block">Rows Processed</span>
                  <span className="font-semibold text-[hsl(var(--foreground))] mt-0.5 block">{rowsProcessed} / {parsedData?.totalRows || 0}</span>
                </div>
                <div>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] uppercase block">Current Batch</span>
                  <span className="font-semibold text-[hsl(var(--foreground))] mt-0.5 block">Batch #{currentBatch}</span>
                </div>
                <div>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] uppercase block">Elapsed Time</span>
                  <span className="font-semibold text-[hsl(var(--foreground))] mt-0.5 block">{elapsedTime}s</span>
                </div>
                <div>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] uppercase block">Est. Remaining</span>
                  <span className="font-semibold text-[hsl(var(--foreground))] mt-0.5 block">{estimatedTime}s</span>
                </div>
              </div>

              {/* Loader list */}
              <div className="w-full text-left bg-white/40 dark:bg-slate-950/20 p-4.5 rounded-2xl border border-[hsl(var(--border)/0.3)] space-y-2 text-[11px]">
                {PROCESSING_STAGES.map((s, idx) => {
                  const isActive = idx === currentStageIndex;
                  const isDone = idx < currentStageIndex;
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center gap-2.5 transition-colors',
                        isDone && 'text-emerald-600 font-medium',
                        isActive && 'text-indigo-600 font-bold',
                        !isActive && !isDone && 'text-[hsl(var(--muted-foreground)/0.4)]'
                      )}
                    >
                      {isDone ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                          <Check className="w-2 h-2" />
                        </div>
                      ) : isActive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-[hsl(var(--border)/0.8)]" />
                      )}
                      <span>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
