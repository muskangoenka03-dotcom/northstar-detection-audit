"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight, ExternalLink, Filter, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { collectionItems } from "@/lib/utils";
import { CaseRecord } from "@/lib/types";
import { Card, Input, SectionTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/data-state";
import { SeverityBadge, StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 10;

type SortKey = "caseId" | "investigationStatus" | "riskLevel";

export default function InvestigationsPage() {
  const { data, loading, error, refresh } = useApi((signal) => api.cases(new URLSearchParams(), signal), []);
  const [caseSearch, setCaseSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [deletion, setDeletion] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [date, setDate] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("caseId");
  const [page, setPage] = useState(1);

  const cases = useMemo(() => {
    const result = collectionItems(data).filter((item) => {
      const matchesCase = item.caseId.toLowerCase().includes(caseSearch.toLowerCase());
      const matchesUser = !userSearch || `${item.currentUserId ?? ""} ${item.historicalUserId ?? ""}`.toLowerCase().includes(userSearch.toLowerCase());
      const matchesDeletion = deletion === "all" || (item.deletionStatus ?? "").toUpperCase() === deletion;
      const matchesSeverity = severity === "all" || (item.riskLevel ?? "").toUpperCase() === severity;
      const matchesDate = !date || (item.auditTimestamp ?? "").startsWith(date);
      return matchesCase && matchesUser && matchesDeletion && matchesSeverity && matchesDate;
    });
    // numeric-aware so case_33 precedes case_100; severity sorts most severe first
    const rank = (value: unknown) => ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(String(value ?? "").toUpperCase());
    return result.sort((a, b) => sortBy === "riskLevel" ? rank(a.riskLevel) - rank(b.riskLevel) : String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? ""), undefined, { numeric: true }));
  }, [data, caseSearch, userSearch, deletion, severity, date, sortBy]);
  const pages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const visible = cases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return <>
    <PageHeader title="Case investigations" description="Search, filter, and review deletion assurance cases returned by the connected backend." breadcrumbs={["Workspace", "Investigations"]} />
    {loading ? <LoadingState label="Loading investigation cases…" /> : error ? <ErrorState message={error} onRetry={refresh} /> : !cases.length && !caseSearch && !userSearch && deletion === "all" && severity === "all" && !date ? <EmptyState title="No cases returned" message="The backend returned no case records. No sample cases are shown here." /> : <>
      <Card className="mb-5 p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><SectionTitle title="Case register" description={`${cases.length.toLocaleString()} matching records · filters apply to backend results`} /><button onClick={() => { setCaseSearch(""); setUserSearch(""); setDeletion("all"); setSeverity("all"); setDate(""); setPage(1); }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-200"><Filter className="size-3.5" /> Clear filters</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="relative xl:col-span-1"><Search className="absolute left-3 top-3 size-4 text-slate-600" /><Input className="pl-9" value={caseSearch} onChange={(event) => { setCaseSearch(event.target.value); setPage(1); }} placeholder="Search case ID" /></label><Input value={userSearch} onChange={(event) => { setUserSearch(event.target.value); setPage(1); }} placeholder="Filter by user ID" /><select aria-label="Filter by deletion status" value={deletion} onChange={(event) => { setDeletion(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-white/10 bg-[#0b0e16] px-3 text-sm text-slate-300"><option value="all">All deletion states</option>{[...new Set(collectionItems(data).map((item) => item.deletionStatus).filter(Boolean))].map((value) => <option key={value} value={value?.toUpperCase()}>{value}</option>)}</select><select aria-label="Filter by risk severity" value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-white/10 bg-[#0b0e16] px-3 text-sm text-slate-300"><option value="all">All risk levels</option>{[...new Set(collectionItems(data).map((item) => item.riskLevel).filter(Boolean))].map((value) => <option key={value} value={value?.toUpperCase()}>{value}</option>)}</select><Input type="date" aria-label="Filter by audit date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></div><div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500"><ArrowDownUp className="size-3.5" /><label htmlFor="case-sort">Sort by</label><select id="case-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)} className="rounded-lg border border-white/10 bg-[#0b0e16] px-2 py-1.5 text-xs text-slate-300"><option value="caseId">Case ID</option><option value="investigationStatus">Investigation status</option><option value="riskLevel">Severity</option></select></div></Card>
      {cases.length === 0 ? <EmptyState title="No matching cases" message="Try changing or clearing the active filters." /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1060px] text-left"><thead className="border-b border-white/[0.06] bg-white/[0.02]"><tr>{["Case ID", "Current user", "Historical user", "Request type", "Audit timestamp", "Deletion status", "Risk", "Investigation"].map((name) => <th key={name} className="px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-600">{name}</th>)}<th className="w-10" /></tr></thead><tbody className="divide-y divide-white/[0.045]">{visible.map((item) => <CaseRow item={item} key={item.caseId} />)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3"><p className="text-xs text-slate-600">Page {page} of {pages} · {cases.length} cases</p><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="size-4" /></button><button disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 disabled:opacity-30" aria-label="Next page"><ChevronRight className="size-4" /></button></div></div></Card>}
    </>}
  </>;
}

function CaseRow({ item }: { item: CaseRecord }) {
  return <tr className="group transition hover:bg-white/[0.025]"><td className="px-4 py-3.5"><Link className="flex items-center gap-2 font-mono text-xs font-medium text-cyan-200 hover:text-cyan-100" href={`/investigations/${encodeURIComponent(item.caseId)}`}>{item.caseId}<ExternalLink className="size-3 opacity-0 transition group-hover:opacity-70" /></Link></td><td className="px-4 py-3.5 font-mono text-xs text-slate-400">{item.currentUserId ?? "—"}</td><td className="px-4 py-3.5 font-mono text-xs text-slate-500">{item.historicalUserId ?? "—"}</td><td className="px-4 py-3.5 text-xs text-slate-400">{item.requestType ?? "—"}</td><td className="px-4 py-3.5 text-xs text-slate-500">{formatDate(item.auditTimestamp)}</td><td className="px-4 py-3.5"><StatusBadge value={item.deletionStatus} /></td><td className="px-4 py-3.5"><SeverityBadge value={item.riskLevel} /></td><td className="px-4 py-3.5"><StatusBadge value={item.investigationStatus} /></td><td className="px-3"><Link aria-label={`Open case ${item.caseId}`} href={`/investigations/${encodeURIComponent(item.caseId)}`}><ChevronRight className="size-4 text-slate-700 group-hover:text-cyan-300" /></Link></td></tr>;
}
