// ============================================
// GrowEasy — Frontend API Client
// ============================================
// All API calls attach the Firebase ID Token automatically.
// Never trust user IDs from the frontend — they're derived on the backend.

import type { APIResponse } from '@/types';
import { auth } from './firebase';

// Strip trailing slashes to prevent double-slash URLs like //dashboard
// when NEXT_PUBLIC_API_URL is set to e.g. "https://api.example.com/api/"
const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
).replace(/\/+$/, '');


// ─── Auth Helpers ────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!auth.currentUser) return {};
  const token = await auth.currentUser.getIdToken(true);
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(error?.error?.message ?? `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── CSV Import ──────────────────────────────

/**
 * Upload a CSV file to the backend for AI processing.
 * Returns extraction results + importId.
 */
export async function uploadCSV(file: File, progressId?: string): Promise<APIResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders };
  if (progressId) {
    headers['X-Progress-ID'] = progressId;
  }

  const response = await fetch(`${API_BASE}/imports`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json();
  return data as APIResponse;
}

/**
 * Retry a failed import by its ID.
 */
export async function retryImport(importId: number, progressId?: string): Promise<APIResponse> {
  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders };
  if (progressId) {
    headers['X-Progress-ID'] = progressId;
  }

  const response = await fetch(`${API_BASE}/imports/${importId}/retry`, {
    method: 'POST',
    headers,
  });
  const data = await response.json();
  return data as APIResponse;
}

// ─── Dashboard ───────────────────────────────

export interface DashboardStats {
  totalImports: number;
  totalLeads: number;
  totalSkipped: number;
  totalRows: number;
  avgProcessingTimeMs: number;
  successRate: number;
  completedImports: number;
  failedImports: number;
  recentImports: ImportRecord[];
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await apiFetch<{ success: true; data: DashboardStats }>('/dashboard');
  return res.data;
}

// ─── Import History ──────────────────────────

export interface ImportRecord {
  id: number;
  fileName: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  durationMs: number | null;
  errorMessage: string | null;
  hasFile: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ImportHistoryResponse {
  imports: ImportRecord[];
  pagination: PaginationMeta;
}

export async function fetchImportHistory(
  page = 1,
  limit = 10
): Promise<ImportHistoryResponse> {
  const res = await apiFetch<{ success: true; data: ImportHistoryResponse }>(
    `/imports?page=${page}&limit=${limit}`
  );
  return res.data;
}

export async function fetchImportById(id: number) {
  const res = await apiFetch<{ success: true; data: { import: ImportRecord } }>(
    `/imports/${id}`
  );
  return res.data.import;
}

export async function deleteImport(id: number): Promise<void> {
  await apiFetch(`/imports/${id}`, { method: 'DELETE' });
}

/**
 * Trigger a browser download of the original CSV file.
 */
export async function downloadImportCSV(id: number, fileName: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/imports/${id}/download`, { headers });

  if (!response.ok) throw new Error('Download failed');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Leads ───────────────────────────────────

export interface Lead {
  id: number;
  importId: number;
  leadCreatedAt: string | null;
  name: string | null;
  email: string | null;
  countryCode: string | null;
  mobileWithoutCountryCode: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  leadOwner: string | null;
  crmStatus: string | null;
  crmNote: string | null;
  dataSource: string | null;
  possessionTime: string | null;
  description: string | null;
  createdAt: string;
}

export interface LeadsResponse {
  leads: Lead[];
  pagination: PaginationMeta;
}

export async function fetchLeads(params: {
  page?: number;
  limit?: number;
  search?: string;
  crmStatus?: string;
  dataSource?: string;
  importId?: number;
  sortBy?: string;
  sortOrder?: string;
} = {}): Promise<LeadsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') query.set(k, String(v));
  });

  const res = await apiFetch<{ success: true; data: LeadsResponse }>(
    `/leads?${query.toString()}`
  );
  return res.data;
}

export async function fetchImportLeads(
  importId: number,
  page = 1,
  limit = 50
): Promise<LeadsResponse> {
  const res = await apiFetch<{ success: true; data: LeadsResponse }>(
    `/imports/${importId}/leads?page=${page}&limit=${limit}`
  );
  return res.data;
}

// ─── Health ──────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
