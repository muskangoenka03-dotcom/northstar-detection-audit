"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Archive, Bell, ChevronDown, FileSearch, FileText, Fingerprint, LayoutDashboard, ListChecks, Menu, Search, Settings, ShieldAlert, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const nav = [
  { label: "Overview", href: "/", icon: LayoutDashboard, group: "WORKSPACE" },
  { label: "Investigations", href: "/investigations", icon: FileSearch, group: "WORKSPACE" },
  { label: "Evidence explorer", href: "/evidence", icon: Archive, group: "WORKSPACE" },
  { label: "Findings", href: "/findings", icon: ShieldAlert, group: "ANALYSIS" },
  { label: "Remediation", href: "/remediation", icon: ListChecks, group: "ANALYSIS" },
  { label: "Reports", href: "/reports", icon: FileText, group: "ANALYSIS" },
  { label: "Settings", href: "/settings", icon: Settings, group: "SYSTEM" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => api.health().then(() => setConnected(true)).catch(() => setConnected(false));
    void check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const sidebar = <>
    <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.06] px-5"><div className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-500 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.22)]"><Fingerprint className="size-5" /><span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-[#0b0e16] bg-violet-300" /></div><div><div className="text-[13px] font-semibold tracking-tight text-white">GHOST<span className="text-cyan-300">.DATA</span></div><div className="mt-0.5 text-[10px] tracking-[.15em] text-slate-600">FORENSICS CONSOLE</div></div><button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-slate-500 lg:hidden" aria-label="Close navigation"><X className="size-4" /></button></div>
    <div className="px-3 pt-7">{["WORKSPACE", "ANALYSIS", "SYSTEM"].map((group) => <div key={group} className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold tracking-[.15em] text-slate-600">{group}</p>{nav.filter((item) => item.group === group).map(({ label, href, icon: Icon }) => { const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn("group mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition", active ? "bg-cyan-400/[0.09] font-medium text-cyan-200 ring-1 ring-inset ring-cyan-300/10" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")}><Icon className={cn("size-[17px]", active ? "text-cyan-300" : "text-slate-600 group-hover:text-slate-300")} />{label}{active && <span className="ml-auto size-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.8)]" />}</Link>; })}</div>)}</div>
    <div className="mt-auto p-3"><div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", connected === true ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.5)]" : connected === false ? "bg-rose-400" : "animate-pulse bg-amber-300")} /><span className="text-xs font-medium text-slate-300">{connected === true ? "Backend connected" : connected === false ? "Backend disconnected" : "Checking backend"}</span></div><p className="mt-2 text-[11px] leading-5 text-slate-600">{connected === false ? "API connection unavailable. Data will not be simulated." : "Investigation data is read-only and sourced from your API."}</p></div><div className="mt-4 flex items-center gap-2 px-2 text-[10px] text-slate-700"><Activity className="size-3" /> SECURE WORKSPACE <span className="ml-auto">v1.0.0</span></div></div>
  </>;

  return <div className="min-h-screen bg-[#090b11] text-slate-100"><aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[0.06] bg-[#0b0e16] lg:flex">{sidebar}</aside>{mobileOpen && <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)}><aside className="flex h-full w-[280px] flex-col border-r border-white/10 bg-[#0b0e16]" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div>}<div className="lg:pl-[248px]"><div className="no-print sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-white/[0.06] bg-[#090b11]/85 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button><div className="hidden items-center gap-2 text-xs text-slate-600 md:flex"><span>Ghost Data</span><span>/</span><span className="text-slate-300">{nav.find((item) => item.href === pathname)?.label ?? (pathname.includes("/investigations/") ? "Case detail" : "Workspace")}</span></div><div className="md:hidden text-sm font-medium text-slate-200">Ghost Data</div></div><div className="flex items-center gap-2"><button className="hidden h-9 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 text-xs text-slate-600 sm:flex"><Search className="size-3.5" /> Search workspace <kbd className="ml-4 rounded border border-white/10 px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button><button className="relative rounded-lg p-2 text-slate-500 hover:bg-white/5" aria-label="Notifications"><Bell className="size-[17px]" /></button><div className="mx-1 h-7 w-px bg-white/[0.08]" /><button className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-white/[0.04]"><div className="flex size-7 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-[10px] font-semibold text-violet-200">DF</div><div className="hidden text-left sm:block"><p className="text-xs font-medium text-slate-200">Forensics team</p><p className="text-[10px] text-slate-600">Investigator</p></div><ChevronDown className="hidden size-3 text-slate-600 sm:block" /></button></div></div><main className="mx-auto min-h-[calc(100vh-68px)] max-w-[1600px] px-4 py-7 sm:px-7 lg:px-9 lg:py-9">{children}</main></div><Toaster theme="dark" position="bottom-right" richColors toastOptions={{ className: "!border-white/10 !bg-[#151923] !text-slate-100" }} /></div>;
}
