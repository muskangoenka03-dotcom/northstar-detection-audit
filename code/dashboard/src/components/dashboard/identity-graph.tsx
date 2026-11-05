"use client";

import { useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";

// Radial layout: the subject in the centre, their identifiers on the inner ring,
// every linked record on the outer ring coloured by its audit outcome.
const W = 640, H = 420, CX = W / 2, CY = H / 2, R_ID = 95, R_RES = 180;

function ring(nodes: GraphNode[], radius: number, offset = 0) {
  return nodes.map((node, i) => {
    const angle = offset + (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
    return [node.id, { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }] as const;
  });
}

function color(node: GraphNode) {
  if (node.type === "user") return "#67e8f9";
  if (node.type === "id") return "#94a3b8";
  return node.status === "open" ? "#fb7185" : "#34d399";
}

export function IdentityGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<string | null>(null);
  if (!nodes.length) return <p className="mt-4 text-xs text-slate-500">No identity graph returned for this case.</p>;
  const ids = nodes.filter((n) => n.type === "id");
  const res = nodes.filter((n) => n.type === "res");
  const pos = new Map([...nodes.filter((n) => n.type === "user").map((n) => [n.id, { x: CX, y: CY }] as const), ...ring(ids, R_ID), ...ring(res, R_RES, Math.PI / Math.max(res.length, 1))]);
  const near = hover ? new Set(edges.flatMap((e) => (e.source === hover || e.target === hover ? [e.source, e.target] : []))) : null;
  const active = nodes.find((n) => n.id === hover);
  return <div>
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Identity graph of the deletion subject">
      {edges.map((e, i) => {
        const a = pos.get(e.source), b = pos.get(e.target);
        if (!a || !b) return null;
        const dim = near && !(near.has(e.source) && near.has(e.target));
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.kind === "inferred" ? "#fbbf24" : "#475569"} strokeWidth={1.2} strokeDasharray={e.kind === "inferred" ? "4 4" : undefined} opacity={dim ? 0.12 : 0.8} />;
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const r = n.type === "user" ? 16 : n.type === "id" ? 6 : 9;
        const dim = near && !near.has(n.id);
        return <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} opacity={dim ? 0.25 : 1} className="cursor-default">
          <circle cx={p.x} cy={p.y} r={r} fill={color(n)} stroke={n.inferred ? "#fbbf24" : "#0b0e16"} strokeWidth={n.inferred ? 2 : 1.5} strokeDasharray={n.inferred ? "3 2" : undefined} />
          {n.type !== "id" && <text x={p.x} y={p.y + r + 12} textAnchor="middle" className="fill-slate-400 font-mono" fontSize={10}>{n.label}</text>}
        </g>;
      })}
    </svg>
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span><span className="mr-1.5 inline-block size-2 rounded-full bg-cyan-300" />Subject</span>
      <span><span className="mr-1.5 inline-block size-2 rounded-full bg-slate-400" />Identifier (email · phone · hash)</span>
      <span><span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-400" />Record compliant</span>
      <span><span className="mr-1.5 inline-block size-2 rounded-full bg-rose-400" />Record needs remediation</span>
      <span><span className="mr-1.5 inline-block h-0 w-4 border-t border-dashed border-amber-400 align-middle" />Inferred from activity timing</span>
    </div>
    <p className="mt-2 min-h-5 font-mono text-[11px] text-slate-400">{active ? `${active.label}${active.system ? ` · ${active.system}` : ""}${active.target ? ` · target ${active.target}` : ""} · links: ${edges.filter((e) => e.source === active.id || e.target === active.id).map((e) => `${e.kind}${e.evidence ? ` (${e.evidence})` : ""}`).join(", ")}` : "Hover a node to see why it is linked."}</p>
  </div>;
}
