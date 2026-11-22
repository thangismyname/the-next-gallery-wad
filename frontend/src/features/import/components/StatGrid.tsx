import React from "react";

/** Lưới số liệu hairline (cùng kiểu các khối thống kê khác của app). */
export const StatGrid: React.FC<{ rows: [string, number][] }> = ({ rows }) => (
  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border/60 sm:grid-cols-3">
    {rows.map(([label, n]) => (
      <div key={label} className="bg-card px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl tabular-nums">{n.toLocaleString()}</p>
      </div>
    ))}
  </div>
);
