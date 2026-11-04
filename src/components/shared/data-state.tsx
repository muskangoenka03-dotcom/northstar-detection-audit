import { AlertTriangle, LoaderCircle, Radio, SearchX } from "lucide-react";
import { Card, Button } from "@/components/ui/primitives";

export function LoadingState({ label = "Loading backend data…" }: { label?: string }) {
  return <Card className="flex min-h-44 flex-col items-center justify-center gap-3 p-8 text-center"><LoaderCircle className="size-6 animate-spin text-cyan-300" /><p className="text-sm text-slate-400">{label}</p><div className="h-1 w-32 overflow-hidden rounded-full bg-white/5"><div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300/70" /></div></Card>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <Card className="flex min-h-52 flex-col items-center justify-center p-8 text-center"><SearchX className="mb-3 size-8 text-slate-600" /><h3 className="font-medium text-slate-200">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{message}</p></Card>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const disconnected = message.toLowerCase().includes("connect") || message.toLowerCase().includes("backend");
  return <Card className="flex min-h-52 flex-col items-center justify-center p-8 text-center"><div className="mb-3 flex size-11 items-center justify-center rounded-full bg-rose-400/10 text-rose-300">{disconnected ? <Radio className="size-5" /> : <AlertTriangle className="size-5" />}</div><h3 className="font-medium text-slate-100">{disconnected ? "Backend disconnected" : "Data unavailable"}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{message}</p><p className="mt-2 text-xs text-slate-600">Start the Python API and check <span className="text-slate-400">NEXT_PUBLIC_API_BASE_URL</span>.</p>{onRetry && <Button variant="secondary" className="mt-5 h-9" onClick={onRetry}>Retry connection</Button>}</Card>;
}
