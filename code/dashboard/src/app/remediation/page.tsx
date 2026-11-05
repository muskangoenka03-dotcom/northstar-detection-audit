"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, CircleDot, ClipboardCheck, FileSearch, ListChecks, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { collectionItems } from "@/lib/utils";
import type { WorkflowStep } from "@/lib/types";
import { Badge, Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/data-state";
import { StatusBadge } from "@/components/shared/status-badge";

const kinds = ["ALL", "FINDING", "REMEDIATION", "VERIFICATION"];
const iconByType = { FINDING: FileSearch, REMEDIATION: ListChecks, VERIFICATION: ClipboardCheck };
const styleByType = { FINDING: "text-rose-300 bg-rose-300/10 border-rose-300/15", REMEDIATION: "text-violet-300 bg-violet-300/10 border-violet-300/15", VERIFICATION: "text-cyan-300 bg-cyan-300/10 border-cyan-300/15" };

export default function RemediationPage() {
  const { data, loading, error, refresh } = useApi((signal) => api.remediation(signal), []);
  const [filter, setFilter] = useState("ALL");
  const steps = collectionItems(data);
  const visible = useMemo(() => filter === "ALL" ? steps : steps.filter((step) => step.type === filter), [steps, filter]);
  const counts = kinds.slice(1).map((type) => ({ type, count: steps.filter((step) => step.type === type).length }));

  return <>
    <PageHeader title="Remediation workflow" description="Read the exact backend-returned sequence of findings, remediation actions, and verification checks." breadcrumbs={["Analysis", "Remediation"]} />
    {loading ? <LoadingState label="Loading remediation workflow…" /> : error ? <ErrorState message={error} onRetry={refresh} /> : !steps.length ? <EmptyState title="No workflow steps returned" message="There are no backend remediation records to display. No steps have been invented or marked complete." /> : <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">{counts.map(({ type, count }) => <Card key={type} className="p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold tracking-[.12em] text-slate-500">{type}</span><span className="text-lg font-semibold text-slate-100">{count}</span></div></Card>)}</div>
      <Card className="p-4"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-200">Investigation sequence</h2><p className="mt-1 text-xs text-slate-600">Order is preserved exactly as received from the API.</p></div><div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-[#0b0e16] p-1">{kinds.map((kind) => <button key={kind} onClick={() => setFilter(kind)} className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${filter === kind ? "bg-white/[0.08] text-slate-200" : "text-slate-600 hover:text-slate-300"}`}>{kind === "ALL" ? "All steps" : kind}</button>)}</div></div><div className="relative ml-5 border-l border-white/[0.08] pl-7">{visible.map((step, index) => <WorkflowStepCard key={`${step.stepNumber}-${index}`} step={step} last={index === visible.length - 1} />)}</div><div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.035] p-3.5 text-xs leading-5 text-amber-100/60"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-amber-200/60" />Workflow completion does not prove deletion. Verification status is displayed only as reported by backend evidence; this interface cannot modify it.</div></Card>
    </>}
  </>;
}

function WorkflowStepCard({ step, last }: { step: WorkflowStep; last: boolean }) {
  const Icon = step.type in iconByType ? iconByType[step.type as keyof typeof iconByType] : CircleDot;
  const tone = step.type in styleByType ? styleByType[step.type as keyof typeof styleByType] : "text-slate-300 bg-white/5 border-white/10";
  return <article className={`relative pb-6 ${last ? "pb-1" : ""}`}><span className="absolute -left-[36px] top-1 flex size-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#10141f] text-[10px] font-semibold text-slate-400">{step.stepNumber}</span><Card className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2"><Badge className={tone}><Icon className="size-3" />{step.type}</Badge><span className="text-xs text-slate-600">Step {step.stepNumber}</span></div><StatusBadge value={step.completionStatus} /></div><p className="mt-4 text-sm leading-6 text-slate-300">{step.description}</p><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.05] pt-3 text-xs">{step.caseId && <Link className="text-cyan-200 hover:text-cyan-100" href={`/investigations/${encodeURIComponent(step.caseId)}`}>Case {step.caseId}</Link>}{step.evidenceReference && <span className="text-slate-500">Evidence: <span className="font-mono text-slate-400">{step.evidenceReference}</span></span>}{!step.caseId && !step.evidenceReference && <span className="text-slate-700">No related case or evidence reference returned</span>}</div></Card>{!last && <span className="absolute -bottom-0.5 -left-[25px] flex size-2 items-center justify-center text-slate-700"><ArrowDown className="size-3" /></span>}<span className="sr-only">{step.completionStatus === "COMPLETE" || step.completionStatus === "COMPLETED" ? <Check /> : <ArrowUp />}</span></article>;
}
