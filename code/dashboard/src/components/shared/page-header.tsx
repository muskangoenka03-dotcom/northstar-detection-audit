import type { ReactNode } from "react";
import { ChevronRight, Home } from "lucide-react";

export function PageHeader({ title, description, breadcrumbs, action }: { title: string; description: string; breadcrumbs?: string[]; action?: ReactNode }) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>{breadcrumbs && <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-xs text-slate-600"><Home className="size-3" />{breadcrumbs.map((item, index) => <span className="flex items-center gap-1.5" key={`${item}-${index}`}><ChevronRight className="size-3" /><span className={index === breadcrumbs.length - 1 ? "text-slate-400" : ""}>{item}</span></span>)}</nav>}<h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p></div>{action}
  </header>;
}
