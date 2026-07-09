'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const options = [
    { id: 'light', label: 'Light Mode', desc: 'Apple-style light mode with white surfaces', icon: Sun },
    { id: 'dark', label: 'Dark Mode', desc: 'Frosted dark slate panels with deep shadows', icon: Moon },
    { id: 'system', label: 'System Preferences', desc: 'Sync automatically with OS settings', icon: Laptop }
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">System Settings</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Adjust application preferences, interfaces, and themes.
        </p>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-6">
        <div>
          <h3 className="font-bold text-sm text-[hsl(var(--foreground))]">Appearance</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Choose how GrowEasy Importer UI appears on your screen.</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer',
                  isSelected
                    ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-600/5 text-[hsl(var(--foreground))]'
                    : 'border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-xl',
                    isSelected ? 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400' : 'bg-[hsl(var(--muted))]'
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-[hsl(var(--foreground))]">{opt.label}</span>
                    <span className="block text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{opt.desc}</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-indigo-600 dark:bg-indigo-400 text-white flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
