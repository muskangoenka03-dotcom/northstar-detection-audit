import { Badge } from "@/components/ui/primitives";
import type { Severity } from "@/lib/types";

export function SeverityBadge({ value }: { value?: Severity | null }) {
  const key = value?.toUpperCase() ?? "UNKNOWN";
  const style = key === "CRITICAL" ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : key === "HIGH" ? "border-orange-400/20 bg-orange-400/10 text-orange-300" : key === "MEDIUM" ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : key === "LOW" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "text-slate-400";
  return <Badge className={style}><span className="size-1.5 rounded-full bg-current" />{value ?? "Unknown"}</Badge>;
}

export function StatusBadge({ value }: { value?: string | null }) {
  const key = value?.toUpperCase() ?? "UNKNOWN";
  const style = ["COMPLETE", "COMPLETED", "ANALYZED", "DELETED", "VERIFIED"].includes(key) ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : ["PENDING", "IN_PROGRESS", "INVESTIGATING"].includes(key) ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : ["FAILED", "NOT_DELETED", "PARTIAL"].includes(key) ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : "text-slate-400";
  return <Badge className={style}>{(value ?? "Unknown").replaceAll("_", " ")}</Badge>;
}
