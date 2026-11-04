"use client";

import { useState } from "react";
import { CheckCircle2, Radio, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/page-header";

const endpoints = ["GET /api/health", "GET /api/dashboard", "GET /api/cases", "GET /api/cases/{case_id}", "GET /api/evidence", "GET /api/findings", "GET /api/remediation", "GET /api/reports", "GET /api/reports/output.csv"];

export default function SettingsPage() {
  const [status, setStatus] = useState<"idle" | "checking" | "connected" | "disconnected">("idle");
  const [message, setMessage] = useState("");
  const check = async () => {
    setStatus("checking");
    try {
      const result = await api.health();
      setStatus("connected");
      setMessage(`Health endpoint returned status: ${result.status}`);
    } catch (error) {
      setStatus("disconnected");
      setMessage(error instanceof Error ? error.message : "The API could not be reached.");
    }
  };
  return <>
    <PageHeader title="Workspace settings" description="Review API connectivity and the read-only integration contract for this investigation console." breadcrumbs={["System", "Settings"]} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]"><div className="space-y-5"><Card className="p-5"><div className="mb-5 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><Server className="size-5" /></div><div><h2 className="text-sm font-semibold text-slate-100">Python backend connection</h2><p className="mt-1 text-xs text-slate-600">Base URL is configured using NEXT_PUBLIC_API_BASE_URL.</p></div></div><div className="rounded-xl border border-white/[0.06] bg-[#0b0e16] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-slate-600">Configured API origin</p><p className="mt-2 break-all font-mono text-sm text-slate-300">{api.baseUrl}</p></div><div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={check} disabled={status === "checking"}><RefreshCw className={`size-4 ${status === "checking" ? "animate-spin" : ""}`} />{status === "checking" ? "Checking…" : "Test connection"}</Button>{status !== "idle" && status !== "checking" && <span className={`flex items-center gap-2 text-xs ${status === "connected" ? "text-emerald-300" : "text-rose-300"}`}>{status === "connected" ? <CheckCircle2 className="size-4" /> : <Radio className="size-4" />}{status === "connected" ? "Backend connected" : "Backend disconnected"}</span>}</div>{message && <p className={`mt-3 text-xs leading-5 ${status === "connected" ? "text-slate-500" : "text-rose-300/80"}`}>{message}</p>}<p className="mt-4 text-xs leading-5 text-slate-600">Change the origin in .env.local, then restart the frontend development server. The API must allow browser requests from this frontend origin (CORS).</p></Card><Card className="p-5"><div className="mb-4 flex items-center gap-3"><ShieldCheck className="size-5 text-emerald-300" /><div><h2 className="text-sm font-semibold text-slate-100">Data integrity safeguards</h2><p className="mt-1 text-xs text-slate-600">The application is intentionally read-only.</p></div></div><ul className="space-y-3 text-xs leading-5 text-slate-500"><li>Metrics, findings, evidence, and workflow status are sourced from backend responses only.</li><li>Workflow steps are shown in the exact API response order.</li><li>No frontend action can mark deletion as complete or verification as successful.</li><li>CSV export downloads the backend response without parsing or changing its content.</li><li>Evidence is served by backend-provided URLs and is not included in this frontend project.</li></ul></Card></div><Card className="h-fit p-5"><h2 className="text-sm font-semibold text-slate-100">Integration endpoints</h2><p className="mt-1 text-xs text-slate-600">Expected routes for the current API client.</p><div className="mt-4 space-y-2">{endpoints.map((endpoint) => <div key={endpoint} className="flex items-center gap-2 rounded-lg border border-white/[0.045] bg-white/[0.015] px-3 py-2.5"><span className="rounded bg-emerald-300/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-200">GET</span><code className="min-w-0 truncate font-mono text-[10px] text-slate-400">{endpoint.replace("GET ", "")}</code></div>)}</div><a href={`${api.baseUrl}/docs`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100">Open backend API docs</a></Card></div>
  </>;
}
