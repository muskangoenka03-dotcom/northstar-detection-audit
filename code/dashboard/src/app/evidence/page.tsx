"use client";

import { useMemo, useState } from "react";
import { Archive, CalendarClock, Download, File, FileCode2, FileImage, FileJson2, FileSpreadsheet, FileText, Filter, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { collectionItems, formatBytes, formatDate } from "@/lib/utils";
import type { EvidenceRecord } from "@/lib/types";
import { Card, Input, Badge } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/data-state";

const kinds = ["All evidence", "CSV files", "PDF documents", "Images", "System logs", "JSON files", "Text files", "SQL snapshots", "Synchronization records", "Backup records"];

function fileIcon(item: EvidenceRecord) {
  const kind = `${item.category ?? ""} ${item.fileType ?? ""} ${item.name}`.toLowerCase();
  if (kind.includes("csv") || kind.includes("spreadsheet")) return FileSpreadsheet;
  if (kind.includes("pdf")) return FileText;
  if (kind.includes("image") || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name)) return FileImage;
  if (kind.includes("json")) return FileJson2;
  if (kind.includes("sql") || kind.includes("log")) return FileCode2;
  return File;
}

function categoryMatches(item: EvidenceRecord, category: string) {
  if (category === "All evidence") return true;
  const value = `${item.category ?? ""} ${item.fileType ?? ""} ${item.name}`.toLowerCase();
  const terms: Record<string, string[]> = {
    "CSV files": ["csv"], "PDF documents": ["pdf"], Images: ["image", ".png", ".jpg", ".jpeg", ".gif", ".webp"], "System logs": ["log"], "JSON files": ["json"], "Text files": ["text", ".txt"], "SQL snapshots": ["sql", "snapshot"], "Synchronization records": ["sync", "synchronization"], "Backup records": ["backup", "restore"],
  };
  return terms[category]?.some((term) => value.includes(term)) ?? false;
}

export default function EvidencePage() {
  const { data, loading, error, refresh } = useApi((signal) => api.evidence(signal), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(kinds[0]);
  const [selected, setSelected] = useState<EvidenceRecord | null>(null);
  const evidence = useMemo(() => collectionItems(data).filter((item) => categoryMatches(item, category) && `${item.name} ${item.evidenceId} ${item.caseId ?? ""} ${item.source ?? ""}`.toLowerCase().includes(query.toLowerCase())), [data, category, query]);

  return <>
    <PageHeader title="Evidence explorer" description="Inspect backend-indexed artifacts and their case relationships without copying evidence into the frontend." breadcrumbs={["Workspace", "Evidence"]} />
    {loading ? <LoadingState label="Loading evidence index…" /> : error ? <ErrorState message={error} onRetry={refresh} /> : !collectionItems(data).length ? <EmptyState title="No evidence indexed" message="The backend returned no evidence records. Evidence is not fabricated or bundled with this interface." /> : <>
      <div className="mb-5 grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]"><Card className="h-fit p-4"><div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200"><Filter className="size-4 text-cyan-300" /> Categories</div><div className="space-y-1">{kinds.map((kind) => <button key={kind} onClick={() => setCategory(kind)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${category === kind ? "bg-cyan-300/10 text-cyan-200" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"}`}><span>{kind}</span>{category === kind && <span className="size-1.5 rounded-full bg-cyan-300" />}</button>)}</div></Card>
        <div><Card className="mb-4 flex flex-wrap items-center gap-3 p-4"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-600" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, evidence ID, case, source…" /></label><Badge><Archive className="size-3" /> {evidence.length} artifacts</Badge></Card>
          {evidence.length === 0 ? <EmptyState title="No matching evidence" message="Adjust your category or search query to view backend-returned records." /> : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{evidence.map((item) => <EvidenceCard item={item} key={item.evidenceId} onPreview={() => setSelected(item)} />)}</div>}
        </div></div>
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><CalendarClock className="size-4 text-cyan-300" /><h2 className="text-sm font-semibold text-slate-200">Evidence timeline</h2><span className="text-xs text-slate-600">timestamps returned by backend</span></div><div className="space-y-3">{[...collectionItems(data)].filter((item) => item.modifiedAt).sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt))).slice(0, 8).map((item) => <button key={item.evidenceId} onClick={() => setSelected(item)} className="flex w-full items-start gap-3 text-left"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-cyan-300/70 ring-4 ring-cyan-300/[0.07]" /><span className="min-w-0 flex-1 truncate text-xs text-slate-400">{item.name}<span className="ml-2 text-slate-600">· {item.caseId ?? "No case linked"}</span></span><time className="shrink-0 text-[11px] text-slate-600">{formatDate(item.modifiedAt)}</time></button>)}{!collectionItems(data).some((item) => item.modifiedAt) && <p className="text-xs text-slate-600">No evidence timestamps were provided.</p>}</div></Card>
    </>}
    {selected && <EvidencePreview item={selected} onClose={() => setSelected(null)} />}
  </>;
}

function EvidenceCard({ item, onPreview }: { item: EvidenceRecord; onPreview: () => void }) {
  const Icon = fileIcon(item);
  return <button onClick={onPreview} className="group rounded-2xl border border-white/[0.07] bg-[#10141f]/80 p-4 text-left transition hover:border-cyan-300/20 hover:bg-[#111722]"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.07] text-cyan-200"><Icon className="size-[18px]" /></div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium text-slate-200 group-hover:text-white">{item.name}</h3><p className="mt-1 truncate font-mono text-[10px] text-slate-600">{item.evidenceId}</p></div><span className="text-[10px] text-slate-600">{formatBytes(item.sizeBytes)}</span></div><div className="mt-4 flex flex-wrap gap-1.5">{item.category && <Badge>{item.category}</Badge>}{item.fileType && <Badge>{item.fileType}</Badge>}</div><div className="mt-4 space-y-2 border-t border-white/[0.05] pt-3 text-[11px] text-slate-500"><div className="flex justify-between gap-2"><span>Related case</span><span className="font-mono text-slate-300">{item.caseId ?? "—"}</span></div><div className="flex justify-between gap-2"><span>Source</span><span className="max-w-[65%] truncate text-slate-400">{item.source ?? "—"}</span></div><div className="flex justify-between gap-2"><span>Modified</span><span>{formatDate(item.modifiedAt)}</span></div></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">{item.description ?? "No description supplied by backend."}</p></button>;
}

function EvidencePreview({ item, onClose }: { item: EvidenceRecord; onClose: () => void }) {
  const url = item.previewUrl ?? item.downloadUrl;
  const type = `${item.fileType ?? ""} ${item.name}`.toLowerCase();
  const image = /image|\.(png|jpe?g|gif|webp|svg)/.test(type);
  const pdf = type.includes("pdf");
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Evidence preview: ${item.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><Card className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-100">{item.name}</h2><p className="mt-1 text-[11px] text-slate-600">{item.evidenceId} · {item.caseId ?? "No related case"}</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Close preview"><X className="size-4" /></button></div><div className="min-h-[280px] flex-1 overflow-auto bg-[#090b11] p-5">{!url ? <div className="flex h-64 flex-col items-center justify-center text-center"><File className="mb-3 size-8 text-slate-700" /><p className="text-sm text-slate-400">Preview not available</p><p className="mt-1 text-xs text-slate-600">The backend did not return a preview or download URL.</p></div> : image ? <img src={url} alt={item.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" /> : pdf ? <iframe title={`PDF preview ${item.name}`} src={url} className="h-[65vh] w-full rounded-lg border border-white/10 bg-white" /> : <div className="flex h-64 flex-col items-center justify-center text-center"><FileText className="mb-3 size-8 text-slate-700" /><p className="text-sm text-slate-400">Preview is not supported for this file type</p><p className="mt-1 text-xs text-slate-600">Use the backend-provided download link to view the original artifact.</p></div>}</div><div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3"><p className="text-xs text-slate-600">Read-only backend artifact</p>{url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"><Download className="size-3.5" /> Open source</a>}</div></Card></div>;
}
