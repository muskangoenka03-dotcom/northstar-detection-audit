"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, Search, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { collectionItems, formatDate } from "@/lib/utils";
import type { Finding } from "@/lib/types";
import { Card, Input, Badge } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/data-state";
import { SeverityBadge } from "@/components/shared/status-badge";

const severityOptions = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const categories = ["Data still present after deletion", "Historical user identifier found", "Active synchronization", "Backup restoration risk", "Incomplete redaction", "Retention policy violation", "Account tombstone failure"];

export default function FindingsPage() {
  const { data, loading, error, refresh } = useApi((signal) => api.findings(signal), []);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const findings = useMemo(() => collectionItems(data).filter((finding) => {
    const haystack = `${finding.findingId} ${finding.caseId} ${finding.description} ${finding.evidenceReference ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (severity === "all" || (finding.severity ?? "").toUpperCase() === severity) && (category === "all" || finding.violationCategory === category);
  }), [data, query, severity, category]);

  return <>
    <PageHeader title="Findings & risk analysis" description="Backend-generated privacy and retention findings, linked to the evidence and cases that support them." breadcrumbs={["Analysis", "Findings"]} />
    {loading ? <LoadingState label="Loading investigation findings…" /> : error ? <ErrorState message={error} onRetry={refresh} /> : !collectionItems(data).length ? <EmptyState title="No findings returned" message="Only confirmed backend findings appear here. The backend has not returned finding records." /> : <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{severityOptions.map((level) => <SeveritySummary key={level} level={level} findings={collectionItems(data)} />)}</div>
      <Card className="mb-5 flex flex-wrap gap-3 p-4"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-600" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search findings, cases, evidence…" /></label><select aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-10 min-w-40 rounded-xl border border-white/10 bg-[#0b0e16] px-3 text-sm text-slate-300"><option value="all">All severities</option>{severityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 min-w-52 rounded-xl border border-white/10 bg-[#0b0e16] px-3 text-sm text-slate-300"><option value="all">All categories</option>{[...new Set([...categories, ...collectionItems(data).map((finding) => finding.violationCategory).filter((item): item is string => Boolean(item))])].map((item) => <option key={item} value={item}>{item}</option>)}</select><Badge className="self-center">{findings.length} findings</Badge></Card>
      {!findings.length ? <EmptyState title="No findings match" message="Adjust your filters to see findings returned by the backend." /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left"><thead className="border-b border-white/[0.06] bg-white/[0.02]"><tr>{["Finding", "Case", "Description", "Category", "Severity", "Detected", "Evidence"].map((item) => <th key={item} className="px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-600">{item}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.045]">{findings.map((item) => <FindingRow key={item.findingId} finding={item} />)}</tbody></table></div></Card>}
      <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-600"><ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-cyan-300/60" />Categories are supplied by the backend. The listed categories are recognized labels only; they are not populated as findings unless returned by the API.</div>
    </>}
  </>;
}

function SeveritySummary({ level, findings }: { level: string; findings: Finding[] }) {
  const count = findings.filter((item) => item.severity?.toUpperCase() === level).length;
  const ring = level === "CRITICAL" ? "border-rose-400/20" : level === "HIGH" ? "border-orange-400/20" : level === "MEDIUM" ? "border-amber-300/20" : "border-emerald-400/20";
  return <Card className={`flex items-center justify-between border-l-2 ${ring} p-4`}><div><SeverityBadge value={level} /><p className="mt-3 text-[11px] text-slate-600">Backend findings</p></div><span className="text-2xl font-semibold text-slate-100">{count}</span></Card>;
}

function FindingRow({ finding }: { finding: Finding }) {
  return <tr className="hover:bg-white/[0.02]"><td className="px-4 py-4 font-mono text-xs text-slate-300">{finding.findingId}</td><td className="px-4 py-4"><Link className="font-mono text-xs text-cyan-200 hover:text-cyan-100" href={`/investigations/${encodeURIComponent(finding.caseId)}`}>{finding.caseId}</Link></td><td className="max-w-[280px] px-4 py-4 text-xs leading-5 text-slate-400">{finding.description}</td><td className="px-4 py-4"><Badge>{finding.violationCategory ?? "Uncategorized"}</Badge></td><td className="px-4 py-4"><SeverityBadge value={finding.severity} /></td><td className="px-4 py-4 text-xs text-slate-500">{formatDate(finding.detectedAt)}</td><td className="px-4 py-4">{finding.evidenceReference ? <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-400"><ExternalLink className="size-3" />{finding.evidenceReference}</span> : <span className="text-xs text-slate-700">—</span>}</td></tr>;
}
