/**
 * API client for the DocFlow AI backend.
 * Uses SWR-compatible fetch with cookie-based auth.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = await res.json() as { success: boolean; data?: T; error?: string };

  if (!res.ok || !data.success) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  return data.data as T;
}

export const api = {
  // Auth
  me: () => apiFetch("/api/auth/me"),

  // Repos
  repos: {
    list: () => apiFetch<RepoSummary[]>("/api/repos"),
    get: (id: string) => apiFetch<RepoDetail>(`/api/repos/${id}`),
    update: (id: string, body: Partial<RepoSettings>) =>
      apiFetch(`/api/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    trigger: (id: string) =>
      apiFetch<{ jobId: string }>(`/api/repos/${id}/trigger`, { method: "POST" }),
    jobs: (id: string) => apiFetch<Job[]>(`/api/repos/${id}/jobs`),
    facts: (id: string) => apiFetch(`/api/repos/${id}/facts`),
  },

  // Direct analysis (calls backend which calls parser+ai)
  analyze: {
    run: (repoPath: string, groqApiKey?: string) =>
      apiFetch<AnalysisResult>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoPath, groqApiKey }),
      }),
  },
};

// Types
export interface RepoSummary {
  id: string;
  fullName: string;
  trackedBranch: string;
  enabled: boolean;
  lastJobStatus: string | null;
  lastJobAt: string | null;
  prUrl: string | null;
  docsGenerated: number;
}

export interface RepoDetail {
  id: string;
  fullName: string;
  trackedBranch: string;
  enabled: boolean;
  aiProvider: string | null;
  docStyle: string;
}

export interface RepoSettings {
  enabled: boolean;
  trackedBranch: string;
  docStyle: string;
  aiProvider: string | null;
}

export interface Job {
  id: string;
  status: string;
  commitSha: string;
  prUrl: string | null;
  prNumber: number | null;
  docsChangedCount: number | null;
  usedFallback: boolean;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AnalysisResult {
  sections: Array<{ heading: string; content: string }>;
  fullMarkdown: string;
  usedFallback: boolean;
  provider?: string;
  facts?: object;
}
