'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Bell, HelpCircle, User } from 'lucide-react';
import { SidebarTab } from './Sidebar';

import { useAuth } from '@/components/providers/AuthProvider';
import { LogOut } from 'lucide-react';

interface TopbarProps {
  activeTab: SidebarTab;
}

export function Topbar({ activeTab }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => setMounted(true), []);

  const getPageTitle = (tab: SidebarTab) => {
    switch (tab) {
      case 'dashboard':
        return 'Overview Dashboard';
      case 'import-csv':
        return 'Import CSV Files';
      case 'import-history':
        return 'Import History Logs';
      case 'manage-leads':
        return 'Manage Extracted Leads';
      case 'settings':
        return 'System Settings';
      default:
        return 'GrowEasy AI Importer';
    }
  };

  const getBreadcrumb = (tab: SidebarTab) => {
    const main = 'AI CSV Importer';
    const title = getPageTitle(tab);
    return `${main} / ${title}`;
  };

  const getUserInitials = () => {
    if (!user || !user.email) return 'JD';
    return user.email.substring(0, 2).toUpperCase();
  };

  const getUserName = () => {
    if (!user) return 'Guest';
    return user.displayName || user.email?.split('@')[0] || 'User';
  };

  return (
    <header className="h-16 border-b border-[hsl(var(--border)/0.5)] bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-30">
      {/* Page Title & Breadcrumbs */}
      <div>
        <span className="text-[10px] font-semibold text-[hsl(var(--muted-foreground)/0.6)] uppercase tracking-wider block">
          {getBreadcrumb(activeTab)}
        </span>
        <h1 className="text-lg font-bold text-[hsl(var(--foreground))] leading-tight">
          {getPageTitle(activeTab)}
        </h1>
      </div>

      {/* Action items */}
      <div className="flex items-center gap-4">
        {/* Help & Support */}
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer" aria-label="Help & Documentation">
          <HelpCircle className="w-4.5 h-4.5" />
        </button>

        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 rounded-lg flex items-center justify-center
              text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]
              transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4.5 h-4.5" />
            ) : (
              <Moon className="w-4.5 h-4.5" />
            )}
          </button>
        )}

        <div className="w-px h-6 bg-[hsl(var(--border)/0.5)]" />

        {/* User profile with logout button */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
            {getUserInitials()}
          </div>
          <div className="hidden sm:block text-left">
            <span className="block text-xs font-semibold text-[hsl(var(--foreground))] leading-none">{getUserName()}</span>
            <span className="block text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-none">Administrator</span>
          </div>
          <button
            onClick={() => logout()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
