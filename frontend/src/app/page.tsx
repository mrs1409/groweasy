'use client';

import { useState, useCallback } from 'react';
import { Sidebar, SidebarTab } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { LandingPage } from '@/components/layout/LandingPage';
import { Overview } from '@/components/dashboard/Overview';
import { ImportCSVView } from '@/components/dashboard/ImportCSVView';
import { ImportHistoryView } from '@/components/dashboard/ImportHistoryView';
import { ManageLeads } from '@/components/dashboard/ManageLeads';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { useAuth } from '@/components/providers/AuthProvider';
import { AuthPage } from '@/components/auth/AuthPage';
import { Loader2, Database } from 'lucide-react';

export default function Home() {
  const [viewMode, setViewMode] = useState<'landing' | 'dashboard'>('landing');
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const { user, loading } = useAuth();

  // After a successful import, navigate to manage-leads and refresh history
  const handleImportComplete = useCallback(() => {
    setHistoryRefreshKey(k => k + 1);
    setTimeout(() => setActiveTab('manage-leads'), 2800);
  }, []);

  // View leads for a specific import
  const handleViewImport = useCallback((_importId: number, _fileName: string) => {
    // Navigate to manage-leads; ManageLeads fetches from /api/leads
    setActiveTab('manage-leads');
  }, []);

  // After a retry completes, bump dashboard key to refresh stats
  const handleRetryComplete = useCallback(() => {
    setHistoryRefreshKey(k => k + 1);
  }, []);

  if (viewMode === 'landing') {
    return <LandingPage onEnterDashboard={() => setViewMode('dashboard')} />;
  }

  // Auth Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] dark:bg-slate-950 flex flex-col items-center justify-center gap-4 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white animate-bounce-subtle">
          <Database className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Verifying secure session...</span>
        </div>
      </div>
    );
  }

  // Redirect to secure login if unauthenticated
  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen flex bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-200">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Right Column Layout Container */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar activeTab={activeTab} />

        {/* Dynamic page tab switcher */}
        <main className="flex-1 p-8 overflow-y-auto custom-scrollbar">
          {activeTab === 'dashboard' && (
            <Overview
              key={historyRefreshKey}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'import-csv' && (
            <ImportCSVView onImportComplete={handleImportComplete} />
          )}

          {activeTab === 'import-history' && (
            <ImportHistoryView
              key={historyRefreshKey}
              onView={handleViewImport}
              onRetryComplete={handleRetryComplete}
            />
          )}

          {activeTab === 'manage-leads' && (
            <ManageLeads
              onOpenImport={() => setActiveTab('import-csv')}
            />
          )}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
