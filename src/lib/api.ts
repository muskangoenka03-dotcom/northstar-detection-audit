import type { ApiCollection, CaseDetail, CaseRecord, DashboardStats, EvidenceRecord, Finding, ReportSummary, WorkflowStep } from "@/lib/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(`Unable to connect to the backend at ${API_BASE}. Check that the Python API is running and NEXT_PUBLIC_API_BASE_URL is correct.`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(detail || `Backend request failed (${response.status}) for ${path}`, response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  baseUrl: API_BASE,
  health: (signal?: AbortSignal) => request<{ status: string }>("/api/health", signal),
  dashboard: (signal?: AbortSignal) => request<DashboardStats>("/api/dashboard", signal),
  cases: (params: URLSearchParams, signal?: AbortSignal) => request<ApiCollection<CaseRecord>>(`/api/cases${params.size ? `?${params}` : ""}`, signal),
  caseDetail: (id: string, signal?: AbortSignal) => request<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`, signal),
  explanation: (id: string, signal?: AbortSignal) => request<{ explanation: string | null }>(`/api/cases/${encodeURIComponent(id)}/explanation`, signal),
  evidence: (signal?: AbortSignal) => request<ApiCollection<EvidenceRecord>>("/api/evidence", signal),
  findings: (signal?: AbortSignal) => request<ApiCollection<Finding>>("/api/findings", signal),
  remediation: (signal?: AbortSignal) => request<ApiCollection<WorkflowStep>>("/api/remediation", signal),
  reports: (signal?: AbortSignal) => request<ReportSummary>("/api/reports", signal),
  async download(path: string) {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    } catch {
      throw new ApiError(`Unable to connect to the backend at ${API_BASE}.`);
    }
    if (!response.ok) throw new ApiError(`Report download failed (${response.status}).`, response.status);
    return response;
  },
};
