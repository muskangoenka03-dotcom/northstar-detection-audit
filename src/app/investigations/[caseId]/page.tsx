"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Archive, CalendarClock, CheckCircle2, ClipboardList, Database, Download, FileSearch, LockKeyhole, Printer, RefreshCw, ShieldAlert, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { formatDate, formatBytes } from "@/lib/utils";
import type { CaseDetail, EvidenceRecord } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { ErrorState, LoadingState } from "@/components/shared/data-state";
import { SeverityBadge, StatusBadge } from "@/components/shared/status-badge";
import { IdentityGraph } from "@/components/dashboard/identity-graph";

type Tab = "Overview" | "Evidence" | "Findings" | "Remediation" | "Verification";
const tabs: Tab[] = ["Overview", "Evidence", "Findings", "Remediation", "Verification"];

export default function CaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const id = params.caseId;
  const { data, loading, error, refresh } = useApi((signal) => api.caseDetail(id, signal), [id]);
  const [tab, setTab] = useState<Tab>("Overview");
  return <>
    <div className="no-print mb-6"><Link href="/investigations" className="inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-cyan-200"><ArrowLeft className="size-3.5" /> All investigations</Link></div>
    {loading ? <LoadingState label={`Loading case ${id}…`} /> : error ? <ErrorState message={error} onRetry={refresh} /> : !data?.case ? <ErrorState message={`The backend did not return case details for ${id}.`} /> : <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs text-slate-600"><span>Investigations</span><span>/</span><span className="font-mono text-slate-400">{data.case.caseId}</span></div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">Case {data.case.caseId}</h1><SeverityBadge value={data.case.riskLevel} /><StatusBadge value={data.case.investigationStatus} /></div><p className="mt-2 text-sm text-slate-500">Deletion assurance investigation · {data.case.requestType ?? "Request type unavailable"}</p></div><Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Export case PDF</Button></header>
      <Card className="mb-6 p-2"><div className="flex gap-1 overflow-x-auto">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-medium transition ${tab === item ? "bg-white/[0.07] text-cyan-200" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-200"}`}>{item}{item === "Evidence" && data.evidence?.length ? <span className="ml-2 text-[10px] text-slate-600">{data.evidence.length}</span> : null}{item === "Findings" && data.findings?.length ? <span className="ml-2 text-[10px] text-slate-600">{data.findings.length}</span> : null}</button>)}</div></Card>
      {tab === "Overview" && <><AiSummary caseId={data.case.caseId} /><Card className="mb-5 p-5"><Title icon={UserRound} title="Identity graph" /><p className="mt-1 text-xs text-slate-500">Every record the evidence ties to this person, and the identifier that ties it.</p><IdentityGraph nodes={data.graph?.nodes ?? []} edges={data.graph?.edges ?? []} /></Card><Overview detail={data} /></>}
      {tab === "Evidence" && <EvidenceTab items={data.evidence ?? []} />}
      {tab === "Findings" && <FindingsTab detail={data} />}
      {tab === "Remediation" && <RemediationTab detail={data} />}
      {tab === "Verification" && <VerificationTab detail={data} />}
    </>}
  </>;
}

function Overview({ detail }: { detail: CaseDetail }) {
  const item = detail.case;
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><InfoCard icon={Database} label="Deletion status" value={item.deletionStatus} /><InfoCard icon={CalendarClock} label="Audit timestamp" value={formatDate(item.auditTimestamp)} /><InfoCard icon={Archive} label="Evidence records" value={detail.evidence?.length} /><InfoCard icon={ShieldAlert} label="Findings" value={detail.findings?.length} /></div><div className="grid gap-5 xl:grid-cols-2"><Card className="p-5"><Title icon={UserRound} title="Identity & request" /><div className="mt-5 grid gap-4 sm:grid-cols-2"><Detail label="Current user identifier" value={item.currentUserId} mono /><Detail label="Historical user identifier" value={item.historicalUserId} mono /><Detail label="Request type" value={item.requestType} /><Detail label="Audit timestamp" value={formatDate(item.auditTimestamp)} /></div>{detail.deletionRequest && <div className="mt-5 border-t border-white/[0.05] pt-4"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-600">Deletion request details</p><pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#0b0e16] p-3 font-mono text-[11px] leading-5 text-slate-400">{JSON.stringify(detail.deletionRequest, null, 2)}</pre></div>}</Card><Card className="p-5"><Title icon={CalendarClock} title="System activity" />{detail.activity?.length ? <div className="mt-5 space-y-4">{detail.activity.map((activity, index) => <div key={`${activity.timestamp}-${index}`} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-cyan-300/70 ring-4 ring-cyan-300/[0.06]" /><div><p className="text-xs leading-5 text-slate-300">{activity.description}</p><p className="mt-1 text-[10px] text-slate-600">{formatDate(activity.timestamp)}{activity.source ? ` · ${activity.source}` : ""}</p></div></div>)}</div> : <NoData text="No system activity returned." />}</Card></div><div className="grid gap-5 xl:grid-cols-2"><RiskList title="Data retention policies" values={detail.policies?.map((entry) => ({ title: entry.name, description: entry.description, status: entry.status }))} /><RiskList title="Synchronization risks" values={detail.synchronizationRisks?.map((entry) => ({ title: entry.description, status: entry.status }))} /><RiskList title="Backup & restore risks" values={detail.backupRisks?.map((entry) => ({ title: entry.description, status: entry.status }))} /></div><Card className="flex items-start gap-3 border-amber-300/10 p-4"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-amber-200/70" /><p className="text-xs leading-5 text-slate-500">Verification remains evidence-based. A completed workflow alone does not establish that deletion has been verified.</p></Card></div>;
}

// AI summary is generated only on request (and cached by the backend) so browsing cases costs no model calls.
function AiSummary({ caseId }: { caseId: string }) {
  const [state, setState] = useState<{ loading: boolean; text?: string | null; error?: string }>({ loading: false });
  const load = () => {
    setState({ loading: true });
    api.explanation(caseId).then((result) => setState({ loading: false, text: result.explanation })).catch((cause: unknown) => setState({ loading: false, error: cause instanceof Error ? cause.message : "Explanation unavailable" }));
  };
  return <Card className="no-print mb-5 flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><Title icon={FileSearch} title="Agent explanation" />{state.text ? <p className="mt-3 text-xs leading-5 text-slate-300">{state.text}</p> : state.text === null ? <p className="mt-3 text-xs text-slate-500">AI explanations are disabled: set ANTHROPIC_API_KEY on the backend.</p> : state.error ? <p className="mt-3 text-xs text-rose-300">{state.error}</p> : <p className="mt-3 text-xs text-slate-500">Plain-language summary of the verdict, generated from this case&apos;s steps only.</p>}</div>{state.text === undefined && <Button variant="secondary" onClick={load} disabled={state.loading}>{state.loading ? "Generating…" : "Explain verdict"}</Button>}</Card>;
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Database; label: string; value?: string | number | null }) {
  return <Card className="p-4"><div className="flex items-center gap-2 text-[11px] text-slate-600"><Icon className="size-3.5 text-cyan-300/70" />{label}</div><p className="mt-3 truncate text-base font-semibold text-slate-200">{value ?? "—"}</p></Card>;
}
function Title({ icon: Icon, title }: { icon: typeof Database; title: string }) { return <div className="flex items-center gap-2"><Icon className="size-4 text-cyan-300" /><h2 className="text-sm font-semibold text-slate-200">{title}</h2></div>; }
function Detail({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) { return <div><p className="text-[10px] text-slate-600">{label}</p><p className={`mt-1.5 break-all text-xs text-slate-300 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p></div>; }
function NoData({ text }: { text: string }) { return <p className="py-8 text-center text-xs text-slate-600">{text}</p>; }
function RiskList({ title, values }: { title: string; values?: Array<{ title: string; description?: string | null; status?: string | null }> }) { return <Card className="p-5"><h2 className="text-sm font-semibold text-slate-200">{title}</h2>{values?.length ? <div className="mt-4 space-y-3">{values.map((entry, index) => <div key={`${entry.title}-${index}`} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-3 last:border-0 last:pb-0"><div><p className="text-xs text-slate-300">{entry.title}</p>{entry.description && <p className="mt-1 text-[11px] leading-5 text-slate-600">{entry.description}</p>}</div><StatusBadge value={entry.status} /></div>)}</div> : <NoData text="No backend records returned." />}</Card>; }

function EvidenceTab({ items }: { items: EvidenceRecord[] }) {
  return <Card className="p-5"><Title icon={Archive} title="Related evidence" />{items.length ? <div className="mt-4 divide-y divide-white/[0.05]">{items.map((item) => <div key={item.evidenceId} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-300/[0.07] text-cyan-200"><FileSearch className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-300">{item.name}</p><p className="mt-1 font-mono text-[10px] text-slate-600">{item.evidenceId} · {formatBytes(item.sizeBytes)}</p></div></div><div className="flex items-center gap-3"><Badge>{item.category ?? item.fileType ?? "Evidence"}</Badge>{item.previewUrl || item.downloadUrl ? <a href={item.previewUrl ?? item.downloadUrl ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-cyan-200"><Download className="size-3.5" /> Open</a> : <span className="text-[10px] text-slate-600">No preview URL</span>}</div><p className="basis-full pl-12 text-[11px] text-slate-600">{item.description ?? "No evidence description returned."}</p></div>)}</div> : <NoData text="No evidence records are linked to this case." />}</Card>;
}

function FindingsTab({ detail }: { detail: CaseDetail }) {
  return <Card className="p-5"><Title icon={ShieldAlert} title="Case findings" />{detail.findings?.length ? <div className="mt-4 space-y-3">{detail.findings.map((item) => <div key={item.findingId} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-mono text-xs text-slate-300">{item.findingId}</span><Badge>{item.violationCategory ?? "Uncategorized"}</Badge></div><SeverityBadge value={item.severity} /></div><p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p><div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-600"><span>Detected {formatDate(item.detectedAt)}</span>{item.evidenceReference && <span>Evidence: <span className="font-mono text-slate-400">{item.evidenceReference}</span></span>}</div></div>)}</div> : <NoData text="No findings returned for this case." />}</Card>;
}

function RemediationTab({ detail }: { detail: CaseDetail }) {
  const steps = detail.remediation ?? [];
  return <Card className="p-5"><Title icon={ClipboardList} title="Backend remediation sequence" />{steps.length ? <div className="relative mt-5 ml-4 border-l border-white/10 pl-7">{steps.map((step, index) => <div key={`${step.stepNumber}-${index}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[36px] flex size-8 items-center justify-center rounded-full border border-white/10 bg-[#10141f] text-[10px] text-slate-400">{step.stepNumber}</span><div className="rounded-xl border border-white/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Badge>{step.type}</Badge><StatusBadge value={step.completionStatus} /></div><p className="mt-3 text-xs leading-5 text-slate-300">{step.description}</p>{step.evidenceReference && <p className="mt-2 text-[10px] text-slate-600">Evidence {step.evidenceReference}</p>}</div></div>)}</div> : <NoData text="No remediation steps returned for this case." />}<p className="mt-5 flex items-center gap-2 border-t border-white/[0.05] pt-4 text-[11px] text-slate-600"><LockKeyhole className="size-3.5" /> Steps are read-only; completion does not imply verified deletion.</p></Card>;
}

function VerificationTab({ detail }: { detail: CaseDetail }) {
  const items = detail.verification ?? [];
  return <Card className="p-5"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-cyan-300" /><h2 className="text-sm font-semibold text-slate-200">Verification results</h2></div>{items.length ? <div className="mt-4 space-y-3">{items.map((item, index) => <div key={`${item.description}-${index}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[0.06] p-4"><div className="flex min-w-0 flex-1 items-start gap-3"><span className="mt-0.5 text-xs font-medium text-slate-600">{index + 1}.</span><div><p className="text-xs leading-5 text-slate-300">{item.description}</p>{item.evidenceReference && <p className="mt-2 font-mono text-[10px] text-slate-600">Evidence: {item.evidenceReference}</p>}</div></div><StatusBadge value={item.status} /></div>)}</div> : <NoData text="No verification results returned for this case." />}<div className="mt-5 rounded-xl border border-amber-300/10 bg-amber-300/[0.035] p-4 text-xs leading-5 text-amber-100/60"><LockKeyhole className="mr-2 inline size-3.5" />Only backend verification evidence can establish deletion. No result is inferred from remediation status.</div><Button variant="ghost" className="mt-4" onClick={() => window.location.reload()}><RefreshCw className="size-3.5" /> Refresh case data</Button><Link className="ml-2 text-xs text-slate-600 hover:text-cyan-200" href="/remediation">View remediation workflow</Link></Card>;
}
