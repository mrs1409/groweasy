'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Search, 
  ArrowUpDown, 
  Download, 
  Filter,
  UserCheck,
  AlertOctagon,
  X,
  User,
  Building,
  Mail,
  Phone,
  MapPin,
  Clock,
  Tag,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CRMRecord, SkippedRecord } from '@/types';
import { cn } from '@/lib/utils';
import { fetchLeads, type Lead } from '@/lib/api';

interface ManageLeadsProps {
  onOpenImport: () => void;
}

/** Map the backend Lead shape to the CRMRecord shape used by this component */
function leadToCRMRecord(lead: Lead): CRMRecord {
  return {
    created_at: lead.leadCreatedAt ?? '',
    name: lead.name ?? '',
    email: lead.email ?? '',
    country_code: lead.countryCode ?? '',
    mobile_without_country_code: lead.mobileWithoutCountryCode ?? '',
    company: lead.company ?? '',
    city: lead.city ?? '',
    state: lead.state ?? '',
    country: lead.country ?? '',
    lead_owner: lead.leadOwner ?? '',
    crm_status: lead.crmStatus ?? '',
    crm_note: lead.crmNote ?? '',
    data_source: lead.dataSource ?? '',
    possession_time: lead.possessionTime ?? '',
    description: lead.description ?? '',
  };
}

export function ManageLeads({ onOpenImport }: ManageLeadsProps) {
  const [activeTab, setActiveTab] = useState<'imported' | 'skipped'>('imported');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected lead for details drawer
  const [selectedLead, setSelectedLead] = useState<CRMRecord | null>(null);

  // API data state
  const [records, setRecords] = useState<CRMRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 50;

  // Skipped rows are not stored in DB; show empty tab gracefully
  const skipped: SkippedRecord[] = [];

  const loadLeads = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLeads({ limit: PAGE_SIZE, page });
      setRecords(result.leads.map(leadToCRMRecord));
      setTotalLeads(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load leads');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads(1);
  }, [loadLeads]);

  // Handle Sort
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Get status options for filter
  const crmStatuses = useMemo(() => {
    const statuses = new Set<string>();
    records.forEach(r => {
      if (r.crm_status) statuses.add(r.crm_status);
    });
    return ['ALL', ...Array.from(statuses)];
  }, [records]);

  // Filter and Sort Imported Leads
  const filteredImported = useMemo(() => {
    let result = [...records];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.mobile_without_country_code && r.mobile_without_country_code.toLowerCase().includes(q)) ||
          (r.city && r.city.toLowerCase().includes(q)) ||
          (r.crm_status && r.crm_status.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      result = result.filter(r => r.crm_status === statusFilter);
    }

    // Sort
    result.sort((a: any, b: any) => {
      const valA = a[sortField] || '';
      const valB = b[sortField] || '';
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, searchQuery, sortField, sortAsc, statusFilter]);

  // Filter and Sort Skipped Leads
  const filteredSkipped = useMemo(() => {
    let result = [...skipped];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r =>
          (r.reason && r.reason.toLowerCase().includes(q)) ||
          Object.values(r.originalData).some(val => val && val.toLowerCase().includes(q))
      );
    }

    return result;
  }, [skipped, searchQuery]);

  const importedContainerRef = useRef<HTMLDivElement>(null);
  const skippedContainerRef = useRef<HTMLDivElement>(null);

  const importedVirtualizer = useVirtualizer({
    count: filteredImported.length,
    getScrollElement: () => importedContainerRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  const skippedVirtualizer = useVirtualizer({
    count: filteredSkipped.length,
    getScrollElement: () => skippedContainerRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  // Export to CSV Function
  const handleExportCSV = () => {
    if (activeTab === 'imported') {
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

  const getStatusBadgeClass = (status: string) => {
    const s = status ? status.toUpperCase() : '';
    if (s.includes('HOT') || s.includes('WARM')) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
    }
    if (s.includes('COLD') || s.includes('INACTIVE')) {
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20';
    }
    if (s.includes('INTERESTED') || s.includes('CONTACTED') || s.includes('WON') || s.includes('ACTIVE')) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
    }
    return 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border)/0.5)]';
  };

  // ─── Loading / Error states ──────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-[hsl(var(--muted-foreground))]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium">Loading leads...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-sm font-semibold text-rose-500">Error: {error}</p>
        <button
          onClick={() => loadLeads()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen pb-16">
      {/* Header section with Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">Leads Manager</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Display successfully extracted records matching the rules engine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadLeads(currentPage)}
            className="px-4.5 py-2.5 rounded-xl text-xs font-semibold border border-[hsl(var(--border)/0.5)] bg-white dark:bg-slate-900 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleExportCSV}
            disabled={activeTab === 'imported' ? records.length === 0 : skipped.length === 0}
            className="px-4.5 py-2.5 rounded-xl text-xs font-semibold border border-[hsl(var(--border)/0.5)] bg-white dark:bg-slate-900 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Export Mapped Leads
          </button>
          <button
            onClick={onOpenImport}
            className="px-4.5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/10 transition-colors cursor-pointer"
          >
            Import CSV File
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex justify-between items-center border-b border-[hsl(var(--border)/0.5)] pb-px">
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveTab('imported'); setSearchQuery(''); }}
            className={cn(
              'px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer',
              activeTab === 'imported'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            Imported Leads ({totalLeads})
          </button>
          <button
            onClick={() => { setActiveTab('skipped'); setSearchQuery(''); }}
            className={cn(
              'px-4 py-2 text-sm font-semibold border-b-2 transition-all cursor-pointer',
              activeTab === 'skipped'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            )}
          >
            Skipped Rows ({skipped.length})
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[hsl(var(--muted-foreground)/0.7)]" />
          <input
            type="text"
            placeholder={activeTab === 'imported' ? 'Search by name, email, phone, city...' : 'Search by skip reason or raw data values...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[hsl(var(--border)/0.5)] bg-white/70 dark:bg-slate-900/70 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
          />
        </div>

        {activeTab === 'imported' && crmStatuses.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border)/0.5)] bg-white dark:bg-slate-900 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
            >
              {crmStatuses.map(status => (
                <option key={status} value={status}>
                  Status: {status}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Table Content Container */}
      <div className="glass-card rounded-2xl overflow-hidden border border-[hsl(var(--border)/0.5)]">
        {activeTab === 'imported' ? (
          filteredImported.length > 0 ? (
            <div ref={importedContainerRef} className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] uppercase font-bold tracking-wider">
                    <th onClick={() => handleSort('name')} className="px-5 py-3 cursor-pointer hover:bg-[hsl(var(--muted)/0.5)] transition-colors whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">
                      <div className="flex items-center gap-1.5">
                        Name <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th onClick={() => handleSort('email')} className="px-5 py-3 cursor-pointer hover:bg-[hsl(var(--muted)/0.5)] transition-colors whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">
                      <div className="flex items-center gap-1.5">
                        Email <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th className="px-5 py-3 whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">Phone</th>
                    <th onClick={() => handleSort('city')} className="px-5 py-3 cursor-pointer hover:bg-[hsl(var(--muted)/0.5)] transition-colors whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">
                      <div className="flex items-center gap-1.5">
                        Location <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th onClick={() => handleSort('crm_status')} className="px-5 py-3 cursor-pointer hover:bg-[hsl(var(--muted)/0.5)] transition-colors whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">
                      <div className="flex items-center gap-1.5">
                        Status <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th className="px-5 py-3 whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">Company</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border)/0.3)] bg-white/30 dark:bg-slate-900/30">
                  {importedVirtualizer.getVirtualItems().length > 0 && importedVirtualizer.getVirtualItems()[0].start > 0 && (
                    <tr>
                      <td style={{ height: `${importedVirtualizer.getVirtualItems()[0].start}px` }} colSpan={6} />
                    </tr>
                  )}
                  {importedVirtualizer.getVirtualItems().map((virtualRow) => {
                    const lead = filteredImported[virtualRow.index];
                    return (
                      <tr 
                        key={virtualRow.key} 
                        ref={importedVirtualizer.measureElement}
                        onClick={() => setSelectedLead(lead)}
                        className="hover:bg-[hsl(var(--muted)/0.2)] transition-colors duration-150 cursor-pointer"
                      >
                        <td className="px-5 py-3.5 font-semibold text-[hsl(var(--foreground))] whitespace-nowrap">
                          {lead.name || <span className="text-[hsl(var(--muted-foreground)/0.4)] italic">No Name</span>}
                        </td>
                        <td className="px-5 py-3.5 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {lead.email}
                        </td>
                        <td className="px-5 py-3.5 text-[hsl(var(--foreground))] whitespace-nowrap font-mono">
                          {lead.country_code ? `${lead.country_code} ` : ''}{lead.mobile_without_country_code}
                        </td>
                        <td className="px-5 py-3.5 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {lead.city}{lead.country ? `, ${lead.country}` : ''}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider', getStatusBadgeClass(lead.crm_status))}>
                            {lead.crm_status || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {lead.company || '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {importedVirtualizer.getVirtualItems().length > 0 && 
                   (importedVirtualizer.getTotalSize() - importedVirtualizer.getVirtualItems()[importedVirtualizer.getVirtualItems().length - 1].end) > 0 && (
                    <tr>
                      <td 
                        style={{ height: `${importedVirtualizer.getTotalSize() - importedVirtualizer.getVirtualItems()[importedVirtualizer.getVirtualItems().length - 1].end}px` }} 
                        colSpan={6} 
                      />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <UserCheck className="w-10 h-10 text-[hsl(var(--muted-foreground)/0.4)] mx-auto mb-4" />
              <h4 className="font-bold text-sm text-[hsl(var(--foreground))]">No Imported Leads Found</h4>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {searchQuery ? 'Try adjusting your search terms or filters.' : 'Ingest some leads using the Importer to populate this list.'}
              </p>
            </div>
          )
        ) : (
          filteredSkipped.length > 0 ? (
            <div ref={skippedContainerRef} className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] uppercase font-bold tracking-wider">
                    <th className="px-5 py-3 whitespace-nowrap w-24 sticky top-0 bg-[hsl(var(--card))] z-10">Row Index</th>
                    <th className="px-5 py-3 whitespace-nowrap sticky top-0 bg-[hsl(var(--card))] z-10">Reason for Skipping</th>
                    <th className="px-5 py-3 sticky top-0 bg-[hsl(var(--card))] z-10">Original Values Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border)/0.3)] bg-white/30 dark:bg-slate-900/30">
                  {skippedVirtualizer.getVirtualItems().length > 0 && skippedVirtualizer.getVirtualItems()[0].start > 0 && (
                    <tr>
                      <td style={{ height: `${skippedVirtualizer.getVirtualItems()[0].start}px` }} colSpan={3} />
                    </tr>
                  )}
                  {skippedVirtualizer.getVirtualItems().map((virtualRow) => {
                    const skip = filteredSkipped[virtualRow.index];
                    return (
                      <tr 
                        key={virtualRow.key} 
                        ref={skippedVirtualizer.measureElement}
                        className="hover:bg-[hsl(var(--muted)/0.2)] transition-colors duration-150"
                      >
                        <td className="px-5 py-3.5 font-mono text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          Row #{skip.rowIndex + 1}
                        </td>
                        <td className="px-5 py-3.5 text-rose-500 font-semibold max-w-sm whitespace-pre-wrap">
                          {skip.reason}
                        </td>
                        <td className="px-5 py-3.5 text-[hsl(var(--muted-foreground))] max-w-lg truncate" title={JSON.stringify(skip.originalData)}>
                          {Object.entries(skip.originalData).map(([key, val]) => (
                            <span key={key} className="inline-block mr-3">
                              <strong className="text-[hsl(var(--foreground))]">{key}:</strong> {val || 'empty'}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                  {skippedVirtualizer.getVirtualItems().length > 0 && 
                   (skippedVirtualizer.getTotalSize() - skippedVirtualizer.getVirtualItems()[skippedVirtualizer.getVirtualItems().length - 1].end) > 0 && (
                    <tr>
                      <td 
                        style={{ height: `${skippedVirtualizer.getTotalSize() - skippedVirtualizer.getVirtualItems()[skippedVirtualizer.getVirtualItems().length - 1].end}px` }} 
                        colSpan={3} 
                      />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <AlertOctagon className="w-10 h-10 text-[hsl(var(--muted-foreground)/0.4)] mx-auto mb-4" />
              <h4 className="font-bold text-sm text-[hsl(var(--foreground))]">No Skipped Rows</h4>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {searchQuery ? 'No skipped entries matched your query.' : 'Excellent! Every single row from your files imported successfully.'}
              </p>
            </div>
          )
        )}
      </div>

      {/* Pagination controls — only shown for imported tab when multiple pages */}
      {activeTab === 'imported' && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--border)/0.3)]">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalLeads)} of {totalLeads} leads
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadLeads(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[hsl(var(--border)/0.5)] bg-white dark:bg-slate-900 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              Page {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => loadLeads(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[hsl(var(--border)/0.5)] bg-white dark:bg-slate-900 hover:bg-[hsl(var(--muted)/0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
      {/* Details Slide-in Drawer */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 border-l border-[hsl(var(--border)/0.5)] shadow-2xl h-full flex flex-col justify-between"
            >
              {/* Header */}
              <div className="p-6 border-b border-[hsl(var(--border)/0.5)] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Lead Details</span>
                  <h3 className="text-base font-bold text-[hsl(var(--foreground))] mt-0.5">{selectedLead.name || 'Unnamed Lead'}</h3>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted-foreground)/0.15)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable details */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
                {/* Section: Contact info */}
                <div className="space-y-4.5">
                  <h4 className="font-bold text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider border-b border-[hsl(var(--border)/0.3)] pb-1.5">Contact Info</h4>
                  
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Mail className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Email Address</span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">{selectedLead.email || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Phone className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Mobile Phone</span>
                      <span className="font-semibold text-[hsl(var(--foreground))] font-mono">
                        {selectedLead.country_code ? `${selectedLead.country_code} ` : ''}{selectedLead.mobile_without_country_code || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: Profile info */}
                <div className="space-y-4.5">
                  <h4 className="font-bold text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider border-b border-[hsl(var(--border)/0.3)] pb-1.5">Company & Location</h4>
                  
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Building className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Company</span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">{selectedLead.company || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><MapPin className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Location</span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">
                        {[selectedLead.city, selectedLead.state, selectedLead.country].filter(Boolean).join(', ') || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: CRM parameters */}
                <div className="space-y-4.5">
                  <h4 className="font-bold text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider border-b border-[hsl(var(--border)/0.3)] pb-1.5">CRM Meta</h4>
                  
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Tag className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Status</span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mt-1 inline-block', getStatusBadgeClass(selectedLead.crm_status))}>
                        {selectedLead.crm_status || 'UNKNOWN'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><User className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Lead Owner</span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">{selectedLead.lead_owner || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Clock className="w-4 h-4" /></div>
                    <div>
                      <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">Possession Time</span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">{selectedLead.possession_time || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Section: Notes */}
                {selectedLead.crm_note && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider border-b border-[hsl(var(--border)/0.3)] pb-1.5">CRM Overflow Notes</h4>
                    <p className="bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.5)] p-3 rounded-xl text-[11px] text-[hsl(var(--foreground))] leading-normal whitespace-pre-wrap">
                      {selectedLead.crm_note}
                    </p>
                  </div>
                )}

                {/* Section: Description */}
                {selectedLead.description && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider border-b border-[hsl(var(--border)/0.3)] pb-1.5">Description</h4>
                    <p className="bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.5)] p-3 rounded-xl text-[11px] text-[hsl(var(--foreground))] leading-normal whitespace-pre-wrap">
                      {selectedLead.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-[hsl(var(--border)/0.5)] bg-[hsl(var(--muted)/0.2)] flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))]">
                <span>Ingestion: {selectedLead.data_source || 'CSV Import'}</span>
                <span>Format: AI Sanitized</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
