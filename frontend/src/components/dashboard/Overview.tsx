'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  TrendingUp,
  XCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchDashboardStats, type DashboardStats, type ImportRecord } from '@/lib/api';

interface OverviewProps {
  onNavigate: (tab: any) => void;
}

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<any>;
  colorClass: string;
  loading: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
          {label}
        </span>
        <div className={cn('p-2 rounded-lg', colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-12 bg-[hsl(var(--muted)/0.5)] rounded animate-pulse mt-3" />
      ) : (
        <p className={cn('text-2xl font-bold mt-3', colorClass.includes('emerald') ? 'text-emerald-600' : colorClass.includes('rose') ? 'text-rose-500' : 'text-[hsl(var(--foreground))]')}>
          {value}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isCompleted = status === 'COMPLETED';
  const isProcessing = status === 'PROCESSING';
  return (
    <span className={cn(
      'text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider',
      isCompleted ? 'bg-emerald-500/10 text-emerald-600' :
        isProcessing ? 'bg-amber-500/10 text-amber-600' :
          'bg-rose-500/10 text-rose-500'
    )}>
      {isCompleted ? 'Completed' : isProcessing ? 'Processing' : 'Failed'}
    </span>
  );
}

export function Overview({ onNavigate }: OverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDashboardStats();
      setStats(data);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load dashboard stats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const recentImport: ImportRecord | null = stats?.recentImports?.[0] ?? null;

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="glass-card rounded-3xl p-8 bg-gradient-to-r from-indigo-500/5 via-blue-500/5 to-transparent flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            Welcome to GrowEasy Importer
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Upload CSV sheets to clean, format, and push contacts into your database using GPT-5.
          </p>
          {lastRefreshed && (
            <p className="text-[10px] text-[hsl(var(--muted-foreground)/0.5)] mt-1">
              Last updated: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadStats}
            disabled={loading}
            className="p-2.5 rounded-xl text-sm border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh stats"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => onNavigate('import-csv')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/10 transition-all hover:scale-[1.01] cursor-pointer"
          >
            Start New Import
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-500 bg-rose-500/5 border border-rose-500/10 p-3.5 rounded-xl text-xs font-semibold">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={loadStats} className="ml-auto underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        <div className="lg:col-span-1 xl:col-span-2">
          <StatCard label="Total Imports" value={stats?.totalImports ?? 0} icon={FileSpreadsheet} colorClass="bg-indigo-500/10 text-indigo-600" loading={loading} />
        </div>
        <div className="lg:col-span-1 xl:col-span-2">
          <StatCard label="Total Leads" value={stats?.totalLeads ?? 0} icon={Layers} colorClass="bg-indigo-500/10 text-indigo-600" loading={loading} />
        </div>
        <div className="lg:col-span-1 xl:col-span-2">
          <StatCard label="Imported" value={stats?.totalLeads ?? 0} icon={CheckCircle2} colorClass="bg-emerald-500/10 text-emerald-600" loading={loading} />
        </div>
        <div className="lg:col-span-1 xl:col-span-2">
          <StatCard label="Skipped" value={stats?.totalSkipped ?? 0} icon={AlertTriangle} colorClass="bg-rose-500/10 text-rose-500" loading={loading} />
        </div>
      </div>

      {/* Second row stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Avg Processing Time</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600"><Clock className="w-4 h-4" /></div>
          </div>
          {loading ? <div className="h-8 w-16 bg-[hsl(var(--muted)/0.5)] rounded animate-pulse mt-3" /> : (
            <p className="text-2xl font-bold text-[hsl(var(--foreground))] mt-3">{formatDuration(stats?.avgProcessingTimeMs ?? null)}</p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Success Rate</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
          </div>
          {loading ? <div className="h-8 w-16 bg-[hsl(var(--muted)/0.5)] rounded animate-pulse mt-3" /> : (
            <p className="text-2xl font-bold text-emerald-600 mt-3">{stats?.successRate ?? 0}%</p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Failed Imports</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500"><XCircle className="w-4 h-4" /></div>
          </div>
          {loading ? <div className="h-8 w-16 bg-[hsl(var(--muted)/0.5)] rounded animate-pulse mt-3" /> : (
            <p className="text-2xl font-bold text-rose-500 mt-3">{stats?.failedImports ?? 0}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Import + History */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-bold text-base text-[hsl(var(--foreground))] mb-4">Most Recent Import</h3>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-6 bg-[hsl(var(--muted)/0.4)] rounded animate-pulse" />)}
              </div>
            ) : recentImport ? (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-sm text-[hsl(var(--foreground))]">{recentImport.fileName}</h4>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] block mt-0.5">{formatDate(recentImport.createdAt)}</span>
                  </div>
                  <StatusBadge status={recentImport.status} />
                </div>
                <div className="grid grid-cols-3 gap-4 bg-[hsl(var(--muted)/0.2)] p-4 rounded-xl text-center">
                  <div>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase block">Imported</span>
                    <span className="text-lg font-bold text-emerald-600">{recentImport.importedRows}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase block">Skipped</span>
                    <span className="text-lg font-bold text-rose-500">{recentImport.skippedRows}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase block">Time</span>
                    <span className="text-lg font-bold text-indigo-600">{formatDuration(recentImport.durationMs)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-[hsl(var(--muted-foreground))]">
                No imports yet. Upload your first CSV file to get started.
              </div>
            )}
          </div>

          {/* Recent Activity Table */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-[hsl(var(--foreground))]">Recent Ingestions</h3>
              <button
                onClick={() => onNavigate('import-history')}
                className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
              >
                View All →
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-8 bg-[hsl(var(--muted)/0.4)] rounded animate-pulse" />)}
              </div>
            ) : stats?.recentImports && stats.recentImports.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] font-semibold">
                      <th className="pb-3">File Name</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3 text-right">Leads</th>
                      <th className="pb-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border)/0.2)]">
                    {stats.recentImports.map((item) => (
                      <tr key={item.id} className="hover:bg-[hsl(var(--muted)/0.1)] transition-colors">
                        <td className="py-3.5 font-semibold text-[hsl(var(--foreground))] truncate max-w-[150px]">{item.fileName}</td>
                        <td className="py-3.5 text-[hsl(var(--muted-foreground))]">{formatDate(item.createdAt)}</td>
                        <td className="py-3.5 text-right font-semibold text-emerald-600">+{item.importedRows}</td>
                        <td className="py-3.5 text-right"><StatusBadge status={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-[hsl(var(--muted-foreground))]">
                No activity yet.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-base text-[hsl(var(--foreground))]">Quick Actions</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Shortcut links to core operations</p>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Upload CSV File', sub: 'Start semantic AI extraction wizard', tab: 'import-csv' },
                { label: 'Import History', sub: 'Review all past import sessions', tab: 'import-history' },
                { label: 'Manage Contacts', sub: 'View all successfully extracted records', tab: 'manage-leads' },
              ].map(({ label, sub, tab }) => (
                <button
                  key={tab}
                  onClick={() => onNavigate(tab)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] transition-colors text-left cursor-pointer"
                >
                  <div>
                    <span className="block text-xs font-semibold text-[hsl(var(--foreground))]">{label}</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 block">{sub}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[hsl(var(--border)/0.5)]">
            <div className="bg-indigo-600/5 rounded-2xl p-4 border border-indigo-600/10 text-center">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block mb-1">CSV Importer Ready</span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-normal mb-3">
                Ingest lists dynamically. Schema-free and fully validated.
              </p>
              <button
                onClick={() => onNavigate('import-csv')}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Upload File
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
