"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Archive, ArrowRight, CheckCircle2, Clock3, Database, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import type { CaseRecord, DashboardStats } from "@/lib/types";
import { Card, Button } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/data-state";
import { SeverityBadge } from "@/components/shared/status-badge";
import { DashboardAnalytics } from "@/components/dashboard/analytics";
import { collectionItems, formatDate } from "@/lib/utils";

type Stat = { key: keyof DashboardStats | "verified"; label: string; icon: typeof Database; color: string; bg: string; note: string };
const cards: Stat[] = [
  { key: "totalCases", label: "Deletion requests audited", icon: Database, color: "text-cyan-300", bg: "bg-cyan-300/10", note: "From deletion_requests.csv" },
  { key: "verified", label: "Proven deleted", icon: ShieldCheck, color: "text-emerald-300", bg: "bg-emerald-300/10", note: "Every check backed by evidence" },
  { key: "deletedDataDetected", label: "Ghost data found", icon: ShieldAlert, color: "text-rose-300", bg: "bg-rose-300/10", note: "Reported complete, data remains" },
  { key: "activeSyncRisks", label: "Live sync pipelines", icon: RefreshCw, color: "text-amber-200", bg: "bg-amber-200/10", note: "Can recreate deleted data" },
  { key: "backupRestoreRisks", label: "Restorable backups", icon: Archive, color: "text-blue-300", bg: "bg-blue-300/10", note: "Restore would resurrect data" },
  { key: "pendingRemediations", label: "Remediation steps", icon: Clock3, color: "text-violet-300", bg: "bg-violet-300/10", note: "Ordered fixes to apply" },
];

export default function DashboardPage() {
  const { data, loading, error, refresh } = useApi((signal) => api.dashboard(signal), []);
  const casesResult = useApi((signal) => api.cases(new URLSearchParams(), signal), []);
  const updated = useMemo(() => formatDate(data?.updatedAt), [data?.updatedAt]);
  const total = data?.totalCases ?? 0;
  const verified = data?.analysisStatus?.find((entry) => entry.name === "COMPLETE")?.value ?? 0;
  const ghost = data?.deletedDataDetected ?? 0;
  const ghostPct = total ? Math.round((ghost / total) * 100) : 0;
  const critical = useMemo(() => collectionItems<CaseRecord>(casesResult.data).filter((c) => c.riskLevel === "CRITICAL").slice(0, 6), [casesResult.data]);
  const value = (key: Stat["key"]) => (key === "verified" ? verified : data?.[key as keyof DashboardStats]);

  return <>
    <PageHeader title="Investigation overview" description="Is every deleted customer really gone? Results of the deletion audit agent." action={<Button variant="secondary" onClick={refresh}><RefreshCw className="size-4" /> Refresh data</Button>} />
    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <Card key={card.key} className="h-[126px] animate-pulse p-5"><div className="h-3 w-24 rounded bg-white/5" /><div className="mt-5 h-7 w-16 rounded bg-white/5" /></Card>)}</div> : error ? <ErrorState message={error} onRetry={refresh} /> : <>
      {/* the one number that matters, stated plainly */}
      <Card className="mb-6 overflow-hidden p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-rose-300/80">Audit verdict</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl"><span className="text-rose-300">{ghostPct}%</span> of “completed” deletions still leave data behind</h2><p className="mt-2 text-sm text-slate-500">{ghost.toLocaleString()} of {total.toLocaleString()} requests need remediation · {verified.toLocaleString()} proven fully deleted</p></div>
          <Link href="/investigations" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-200">Review cases <ArrowRight className="size-4" /></Link>
        </div>
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/[0.04]" role="img" aria-label={`${ghost} incomplete, ${verified} complete`}><div className="bg-rose-400/80 transition-all duration-700" style={{ width: `${ghostPct}%` }} /><div className="bg-emerald-400/80 transition-all duration-700" style={{ width: `${100 - ghostPct}%` }} /></div>
        <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-400" />Incomplete</span><span className="flex items-center gap-1.5">Complete<span className="size-2 rounded-full bg-emerald-400" /></span></div>
      </Card>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => { const Icon = card.icon; const v = value(card.key); return <Card key={card.key} className="group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-white/[0.12]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{card.label}</span><span className={`flex size-8 items-center justify-center rounded-lg ${card.bg} ${card.color}`}><Icon className="size-4" /></span></div><div className="mt-4 text-3xl font-semibold tracking-tight tabular-nums text-slate-100">{typeof v === "number" ? v.toLocaleString() : "—"}</div><p className="mt-1 text-[11px] text-slate-600">{card.note}</p></Card>; })}</div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-100">Analytics &amp; risk signals</h2><p className="mt-1 text-sm text-slate-500">Aggregated from the agent&apos;s audit results.</p></div><span className="flex items-center gap-1.5 text-[11px] text-slate-600"><CheckCircle2 className="size-3.5 text-emerald-400/70" />{data?.updatedAt ? `Updated ${updated}` : "Awaiting analysis timestamps"}</span></div>
      <DashboardAnalytics stats={data ?? {}} />

      <Card className="mt-5 p-5">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-100">Critical cases to act on first</h2><p className="mt-1 text-xs text-slate-500">A live sync pipeline or restorable backup can bring the data back after deletion.</p></div><Link href="/investigations" className="text-xs text-cyan-300 hover:text-cyan-200">View all</Link></div>
        {critical.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{critical.map((c) => <Link key={c.caseId} href={`/investigations/${encodeURIComponent(c.caseId)}`} className="group flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition hover:border-rose-300/30 hover:bg-rose-300/[0.04]"><div><p className="font-mono text-sm text-slate-200">{c.caseId}</p><p className="mt-0.5 text-[11px] text-slate-500">{c.currentUserId} · audited {formatDate(c.auditTimestamp)}</p></div><div className="flex items-center gap-2"><SeverityBadge value={c.riskLevel} /><ArrowRight className="size-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-rose-200" /></div></Link>)}</div> : <p className="text-xs text-slate-500">{casesResult.loading ? "Loading cases…" : "No critical cases."}</p>}
      </Card>
    </>}
  </>;
}
