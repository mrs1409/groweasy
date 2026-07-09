'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FileSpreadsheet,
  Trash2,
  Download,
  Eye,
  RotateCw,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  XCircle,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchImportHistory,
  deleteImport,
  downloadImportCSV,
  retryImport,
  type ImportRecord,
  type PaginationMeta,
} from '@/lib/api';

interface ImportHistoryViewProps {
  onView: (importId: number, fileName: string) => void;
  onRetryComplete?: () => void;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider',
      status === 'COMPLETED'
        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
        : status === 'PROCESSING'
          ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
    )}>
      {status === 'COMPLETED' ? (
        <><CheckCircle2 className="w-2.5 h-2.5" />Completed</>
      ) : status === 'PROCESSING' ? (
        <><Loader2 className="w-2.5 h-2.5 animate-spin" />Processing</>
      ) : (
        <><AlertTriangle className="w-2.5 h-2.5" />Failed</>
      )}
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function ImportHistoryView({ onView, onRetryComplete }: ImportHistoryViewProps) {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  const historyContainerRef = useRef<HTMLDivElement>(null);

  const historyVirtualizer = useVirtualizer({
    count: imports.length,
    getScrollElement: () => historyContainerRef.current,
    estimateSize: () => 53,
    overscan: 5,
  });

  const loadHistory = useCallback(async (targetPage = page) => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchImportHistory(targetPage, 10);
      setImports(result.imports);
      setPagination(result.pagination);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load import history.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadHistory(page); }, [page]);

  const setAction = (id: number, action: string) =>
    setActionLoading(prev => ({ ...prev, [id]: action }));
  const clearAction = (id: number) =>
    setActionLoading(prev => { const s = { ...prev }; delete s[id]; return s; });

  const handleDelete = async (item: ImportRecord) => {
    if (!confirm(`Delete import "${item.fileName}"? This cannot be undone.`)) return;
    setAction(item.id, 'delete');
    try {
      await deleteImport(item.id);
      setImports(prev => prev.filter(i => i.id !== item.id));
      if (pagination) setPagination(p => p ? { ...p, total: p.total - 1 } : p);
    } catch (err: any) {
      alert(`Delete failed: ${err?.message}`);
    } finally {
      clearAction(item.id);
    }
  };

  const handleDownload = async (item: ImportRecord) => {
    if (!item.hasFile) {
      alert('Original CSV file is no longer available.');
      return;
    }
    setAction(item.id, 'download');
    try {
      await downloadImportCSV(item.id, item.fileName);
    } catch (err: any) {
      alert(`Download failed: ${err?.message}`);
    } finally {
      clearAction(item.id);
    }
  };

  const handleRetry = async (item: ImportRecord) => {
    if (!item.hasFile) {
      alert('Cannot retry: original CSV file is no longer available.');
      return;
    }
    setAction(item.id, 'retry');
    try {
      await retryImport(item.id);
      await loadHistory(page);
      onRetryComplete?.();
    } catch (err: any) {
      alert(`Retry failed: ${err?.message}`);
    } finally {
      clearAction(item.id);
    }
  };

  const handleView = (item: ImportRecord) => onView(item.id, item.fileName);

  const ActionButton = ({
    id,
    action,
    onClick,
    icon: Icon,
    hoverClass = 'hover:bg-[hsl(var(--muted-foreground)/0.15)] hover:text-[hsl(var(--foreground))]',
    title,
    disabled,
  }: {
    id: number;
    action: string;
    onClick: () => void;
    icon: React.ComponentType<any>;
    hoverClass?: string;
    title: string;
    disabled?: boolean;
  }) => {
    const isLoading = actionLoading[id] === action;
    return (
      <button
        onClick={onClick}
        disabled={isLoading || !!actionLoading[id] || disabled}
        className={cn(
          'px-2 py-1.5 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
          hoverClass
        )}
        title={title}
      >
        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      </button>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Ingestion Logs History
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Review metrics, retry failed batches, download files, or clear logs.
          </p>
          {pagination && (
            <p className="text-[10px] text-[hsl(var(--muted-foreground)/0.6)] mt-1">
              {pagination.total} total import{pagination.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => loadHistory(page)}
          disabled={loading}
          className="self-start p-2.5 rounded-xl border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] transition-colors disabled:opacity-50 cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-500 bg-rose-500/5 border border-rose-500/10 p-3.5 rounded-xl text-xs font-semibold">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={() => loadHistory(page)} className="ml-auto underline cursor-pointer">Retry</button>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden border border-[hsl(var(--border)/0.5)]">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-[hsl(var(--muted)/0.4)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : imports.length > 0 ? (
          <div ref={historyContainerRef} className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] uppercase font-bold tracking-wider">
                  <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">#</th>
                  <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">File Name</th>
                  <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Uploaded At</th>
                  <th className="px-5 py-3 text-right sticky top-0 bg-[hsl(var(--card))] z-10">Rows</th>
                  <th className="px-5 py-3 text-right sticky top-0 bg-[hsl(var(--card))] z-10">Imported</th>
                  <th className="px-5 py-3 text-right sticky top-0 bg-[hsl(var(--card))] z-10">Skipped</th>
                  <th className="px-5 py-3 text-right sticky top-0 bg-[hsl(var(--card))] z-10">Duration</th>
                  <th className="px-5 py-3 text-center sticky top-0 bg-[hsl(var(--card))] z-10">Status</th>
                  <th className="px-5 py-3 text-right sticky top-0 bg-[hsl(var(--card))] z-10">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border)/0.3)] bg-white/30 dark:bg-slate-900/30">
                {historyVirtualizer.getVirtualItems().length > 0 && historyVirtualizer.getVirtualItems()[0].start > 0 && (
                  <tr>
                    <td style={{ height: `${historyVirtualizer.getVirtualItems()[0].start}px` }} colSpan={9} />
                  </tr>
                )}
                {historyVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = imports[virtualRow.index];
                  return (
                    <tr 
                      key={virtualRow.key} 
                      ref={historyVirtualizer.measureElement}
                      className="hover:bg-[hsl(var(--muted)/0.15)] transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono text-[hsl(var(--muted-foreground))]">
                        {item.id}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          <span className="font-semibold text-[hsl(var(--foreground))] truncate max-w-[140px]" title={item.fileName}>
                            {item.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[hsl(var(--foreground))]">
                        {item.totalRows}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-emerald-600 font-semibold">
                        {item.importedRows}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-rose-500 font-semibold">
                        {item.skippedRows}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[hsl(var(--muted-foreground))]">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(item.durationMs)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-1.5">
                        <ActionButton
                          id={item.id} action="view" onClick={() => handleView(item)}
                          icon={Eye} title="View Leads"
                        />
                        <ActionButton
                          id={item.id} action="download" onClick={() => handleDownload(item)}
                          icon={Download} title="Download Original CSV"
                          disabled={!item.hasFile}
                        />
                        <ActionButton
                          id={item.id} action="retry" onClick={() => handleRetry(item)}
                          icon={RotateCw} title="Retry AI Extraction"
                          disabled={!item.hasFile}
                        />
                        <ActionButton
                          id={item.id} action="delete" onClick={() => handleDelete(item)}
                          icon={Trash2}
                          hoverClass="hover:bg-rose-500/10 hover:text-rose-500"
                          title="Delete Import"
                        />
                      </td>
                    </tr>
                  );
                })}
                {historyVirtualizer.getVirtualItems().length > 0 && 
                 (historyVirtualizer.getTotalSize() - historyVirtualizer.getVirtualItems()[historyVirtualizer.getVirtualItems().length - 1].end) > 0 && (
                  <tr>
                    <td 
                      style={{ height: `${historyVirtualizer.getTotalSize() - historyVirtualizer.getVirtualItems()[historyVirtualizer.getVirtualItems().length - 1].end}px` }} 
                      colSpan={9} 
                    />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FolderOpen className="w-12 h-12 text-[hsl(var(--muted-foreground)/0.3)] mx-auto mb-4" />
            <h4 className="font-bold text-sm text-[hsl(var(--foreground))]">No Import Logs Available</h4>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Upload your first CSV file to see import history here.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[hsl(var(--muted-foreground))]">
            Page {pagination.page} of {pagination.totalPages} — {pagination.total} total
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={!pagination.hasPrev || loading}
              className="p-1.5 rounded-lg border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter(p => Math.abs(p - pagination.page) <= 2)
              .map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'w-7 h-7 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                    p === pagination.page
                      ? 'bg-indigo-600 text-white'
                      : 'border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] text-[hsl(var(--muted-foreground))]'
                  )}
                >
                  {p}
                </button>
              ))}
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!pagination.hasNext || loading}
              className="p-1.5 rounded-lg border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
