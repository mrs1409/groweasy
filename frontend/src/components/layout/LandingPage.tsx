'use client';

import React from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  Upload, 
  CheckCircle2, 
  Globe, 
  Cpu, 
  ShieldCheck, 
  Zap, 
  FileSpreadsheet,
  Database
} from 'lucide-react';

interface LandingPageProps {
  onEnterDashboard: () => void;
}

export function LandingPage({ onEnterDashboard }: LandingPageProps) {
  const supportedTypes = [
    { name: 'Facebook Lead Export', desc: 'Auto-maps fields like full name and notes overrides.' },
    { name: 'Google Ads Export', desc: 'Validates phone formats & multiple emails.' },
    { name: 'Excel Sheets', desc: 'Handles custom column variations with semantic AI.' },
    { name: 'Sales Reports', desc: 'Aggregates contact timestamps & owner tags.' },
    { name: 'Marketing Agency CSV', desc: 'Enforces CRM status & source rules.' },
    { name: 'Real Estate CRM', desc: 'Strips duplicate keys and fixes country codes.' },
    { name: 'Manual CSV Files', desc: 'Fuzzy matches custom field titles instantly.' }
  ];

  const features = [
    {
      title: 'Smart AI Field Mapping',
      desc: 'No fixed column header names needed. GPT-5 analyzes headers dynamically to map names, company, email, and phone info.',
      icon: Cpu
    },
    {
      title: 'Deterministic Rules Engine',
      desc: 'Enforces custom country codes, normalizes JS-compatible dates, and restricts CRM status fields to allowed values.',
      icon: ShieldCheck
    },
    {
      title: 'Automatic Content Repair',
      desc: 'Intelligently splits multiple email/phone strings in a single field, appending extras to CRM notes automatically.',
      icon: Zap
    },
    {
      title: 'Secure & Abuse-Resilient',
      desc: 'Includes stateful client-side preview, automatic fallback extraction, and batch-by-batch error retry limits.',
      icon: Globe
    }
  ];

  const steps = [
    { step: '01', title: 'Upload Spreadsheet', desc: 'Drag and drop any valid CSV. No fields pre-configuration required.' },
    { step: '02', title: 'Verify Layout', desc: 'Review the mapped data layout in a high-speed interactive preview.' },
    { step: '03', title: 'AI Extraction & Cleanse', desc: 'Gemini/OpenAI processes, normalizes, and filters contact rows.' },
    { step: '04', title: 'Download Processed CRM', desc: 'Retrieve successfully verified leads or inspect skipped logs.' }
  ];

  return (
    <div className="min-h-screen bg-[#F7F8FC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30 transition-colors duration-300">
      
      {/* Navbar header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/50 dark:border-slate-800/40 bg-[#F7F8FC]/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Database className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight">GrowEasy</span>
              <span className="text-[10px] block text-slate-500 dark:text-slate-400 -mt-1 font-medium">CSV IMPORTER</span>
            </div>
          </div>
          <button
            onClick={onEnterDashboard}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/10 transition-colors cursor-pointer"
          >
            Launch Importer
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        {/* Glow backdrop */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl -z-10" />

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600/5 dark:bg-indigo-500/10 text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-6 border border-indigo-600/10">
          <Sparkles className="w-3.5 h-3.5" /> Powered by GPT-5 Reasoning API
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-none bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          Import CSV Lists into CRM <br className="hidden sm:inline" />
          <span className="text-indigo-600 dark:text-indigo-400">With Flawless AI Semantic Mapping</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Say goodbye to strict spreadsheet column mapping errors. Upload any lead format, Facebook export, or sales spreadsheet. Our pipeline dynamically mapping fields, fixes data anomalies, and sanitizes contacts instantly.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4">
          <button
            onClick={onEnterDashboard}
            className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/15 transition-all hover:scale-[1.01] cursor-pointer"
          >
            Start Importing <ArrowRight className="w-5 h-5" />
          </button>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto px-6 py-4 rounded-2xl text-sm font-semibold border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-center cursor-pointer"
          >
            Learn How it Works
          </a>
        </div>
      </section>

      {/* Grid Features */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-200/50 dark:border-slate-800/40">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Built for Clean CRM Pipeline Leads</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            No database crashes or missing attributes. Fully compliant with validation rules.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="glass-card rounded-2xl p-6 hover:shadow-md transition-shadow bg-white/70 dark:bg-slate-900/70 border border-white/40 dark:border-white/5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/5 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{f.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-200/50 dark:border-slate-800/40">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Step-by-Step Data Flow</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Our clean 4-stage UI/UX makes matching layout structure effortless.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, idx) => (
            <div key={idx} className="relative glass-card rounded-2xl p-6 bg-white/50 dark:bg-slate-900/50 border border-white/20 dark:border-white/5">
              <span className="absolute top-4 right-4 text-xs font-bold text-indigo-500 dark:text-indigo-400 font-mono">
                {s.step}
              </span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 pr-8">{s.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported formats */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-200/50 dark:border-slate-800/40">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Supported CSV Ingestions</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            AI mappings support files exported from any common CRM or custom sheet layout.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {supportedTypes.map((type, i) => (
            <div key={i} className="flex gap-3 items-start p-4 rounded-xl hover:bg-slate-200/30 dark:hover:bg-slate-900/30 transition-colors">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100">{type.name}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                  {type.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200/50 dark:border-slate-800/40 text-center text-xs text-slate-400 dark:text-slate-500 bg-white/30 dark:bg-slate-950/30">
        <p>GrowEasy CSV Importer · Built with Next.js, Tailwind & Gemini/OpenAI Pipeline</p>
      </footer>
    </div>
  );
}
