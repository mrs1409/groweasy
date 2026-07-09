'use client';

import React from 'react';
import {
  LayoutDashboard,
  Zap,
  Users2,
  PhoneCall,
  Settings,
  Database,
  Link,
  Smartphone,
  ShieldCheck,
  TrendingUp,
  FolderKanban,
  FileSpreadsheet
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type SidebarTab =
  | 'dashboard'
  | 'import-csv'
  | 'import-history'
  | 'manage-leads'
  | 'settings';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'import-csv', label: 'Import CSV', icon: FileSpreadsheet },
    { id: 'import-history', label: 'Import History', icon: FolderKanban },
    { id: 'manage-leads', label: 'Manage Leads', icon: Users2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderNavGroup = (items: typeof menuItems) => {
    return items.map((item) => {
      const Icon = item.icon;
      const isActive = activeTab === item.id;
      return (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id as SidebarTab)}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer',
            isActive
              ? 'bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border border-indigo-600/20 dark:border-indigo-500/30 shadow-sm shadow-indigo-500/5'
              : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]'
          )}
        >
          <Icon className="w-4 h-4" />
          <span>{item.label}</span>
        </button>
      );
    });
  };

  return (
    <aside className="w-64 border-r border-[hsl(var(--border)/0.5)] bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex flex-col h-screen sticky top-0">
      {/* Header / Brand Logo */}
      <div className="h-16 flex items-center px-6 gap-3 border-b border-[hsl(var(--border)/0.5)]">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
          <Database className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <span className="font-bold text-base text-[hsl(var(--foreground))] tracking-tight">GrowEasy</span>
          <span className="text-[10px] block text-[hsl(var(--muted-foreground))] -mt-1 font-medium">CSV IMPORTER</span>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7 custom-scrollbar">
        {/* Main Section */}
        <div className="space-y-1">
          {renderNavGroup(menuItems)}
        </div>
      </div>
    </aside>
  );
}
