"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardStats } from "@/lib/types";
import { Card, SectionTitle } from "@/components/ui/primitives";

const COLORS = ["#67e8f9", "#818cf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185"];
// fixed meaning beats palette order: outcomes and severities always read the same everywhere
const SEMANTIC: Record<string, string> = { COMPLETE: "#34d399", INCOMPLETE: "#fb7185", CRITICAL: "#fb7185", HIGH: "#fb923c", MEDIUM: "#fbbf24", LOW: "#34d399" };
const tooltip = { background: "#151923", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, color: "#e2e8f0", fontSize: 12 };

// "search_service" -> "Search", "integration_service" -> "Integration (sync)"
const SYSTEM_NAMES: Record<string, string> = { integration_service: "Integration (sync)", backup_service: "Backups", account_service: "Accounts", support_platform: "Support", analytics_platform: "Analytics", search_service: "Search index", export_service: "Exports", identity_service: "Identity tombstones", security_service: "Security logs" };
export const pretty = (name: string) => SYSTEM_NAMES[name] ?? name.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const fill = (name: string, index: number) => SEMANTIC[name.toUpperCase()] ?? COLORS[index % COLORS.length];

function ChartCard({ title, description, children, height = 230 }: { title: string; description: string; children: React.ReactNode; height?: number }) {
  return <Card className="p-5"><SectionTitle title={title} description={description} /><div style={{ height }}>{children}</div></Card>;
}

function Unavailable({ name }: { name: string }) {
  return <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center"><p className="text-sm text-slate-400">No {name} data returned</p><p className="mt-1 text-xs text-slate-600">Chart appears when the API provides actual results.</p></div>;
}

function PiePanel({ data, name }: { data?: Array<{ name: string; value: number }>; name: string }) {
  if (!data?.length) return <Unavailable name={name} />;
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  return <div className="flex h-full flex-col items-center gap-4">
    {/* fixed-size box: a percentage-width ResponsiveContainer inside flex measures 0 and the donut never draws */}
    <div className="relative h-[140px] w-[140px] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={46} outerRadius={68} paddingAngle={3} stroke="none" isAnimationActive={false}>{data.map((entry, index) => <Cell key={entry.name} fill={fill(entry.name, index)} />)}</Pie><Tooltip contentStyle={tooltip} formatter={(value: number, label: string) => [value.toLocaleString(), pretty(label)]} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-semibold text-slate-100">{total.toLocaleString()}</span><span className="text-[10px] uppercase tracking-wider text-slate-500">total</span></div></div>
    <div className="w-full space-y-2">{data.slice(0, 6).map((entry, index) => <div key={entry.name} className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: fill(entry.name, index) }} /><span className="min-w-0 flex-1 truncate text-xs text-slate-400">{pretty(entry.name)}</span><span className="text-xs font-medium tabular-nums text-slate-200">{entry.value.toLocaleString()}</span><span className="w-9 text-right text-[10px] tabular-nums text-slate-600">{Math.round((entry.value / total) * 100)}%</span></div>)}</div>
  </div>;
}

// horizontal bars keep long category names readable instead of colliding on an x axis
function BarPanel({ data, name, color }: { data?: Array<{ name: string; value: number }>; name: string; color?: string }) {
  if (!data?.length) return <Unavailable name={name} />;
  const rows = data.map((entry) => ({ ...entry, label: pretty(entry.name) }));
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={6}><XAxis type="number" hide /><YAxis type="category" dataKey="label" width={118} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} /><Tooltip cursor={{ fill: "rgba(255,255,255,.03)" }} contentStyle={tooltip} /><Bar dataKey="value" name="Count" radius={[0, 5, 5, 0]} fill={color ?? COLORS[0]} isAnimationActive={false}><LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#cbd5e1" }} /></Bar></BarChart></ResponsiveContainer>;
}

export function DashboardAnalytics({ stats }: { stats: DashboardStats }) {
  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title="Where ghost data hides" description="Systems still holding the subject's data, by finding count" height={250}><BarPanel data={stats.violationTypes} name="violation category" color="#fb7185" /></ChartCard>
      <ChartCard title="Remediation required" description="Fix operations the agent ordered across all cases" height={250}><BarPanel data={stats.remediationStatus} name="remediation status" color="#fbbf24" /></ChartCard>
    </div>
    <div className="grid gap-5 xl:grid-cols-3">
      <ChartCard title="Audit verdicts" description="Deletions proven complete vs. still leaving data" height={290}><PiePanel data={stats.analysisStatus} name="analysis status" /></ChartCard>
      <ChartCard title="Risk severity" description="Worst finding per case" height={290}><PiePanel data={stats.riskSeverity} name="risk severity" /></ChartCard>
      <ChartCard title="Evidence relied on" description="Evidence types cited by audit steps" height={290}><PiePanel data={stats.evidenceSources} name="evidence source" /></ChartCard>
    </div>
  </div>;
}
