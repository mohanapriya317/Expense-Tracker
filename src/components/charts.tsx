"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMoney } from "@/lib/hooks";

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false };

function TooltipBox({ title, rows }: { title?: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted">{r.label}</span>
          <span className="tabular ml-auto font-semibold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Donut({ data, total, size = 140 }: { data: { name: string; color: string; total: number }[]; total: number; size?: number }) {
  const money = useMoney();
  const shown = data.length ? data : [{ name: "No spending", color: "var(--surface-muted)", total: 1 }];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Spending by category, total ${money(total)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={shown} dataKey="total" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={data.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
            {shown.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          {data.length > 0 && (
            <Tooltip content={({ payload }) => (payload?.[0] ? <TooltipBox rows={[{ label: String(payload[0].name), value: money(Number(payload[0].value)), color: payload[0].payload.color }]} /> : null)} />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted">Total</span>
        <span className="tabular text-sm font-bold">{money(total, { compact: true })}</span>
      </div>
    </div>
  );
}

export function TrendChart({ data, height = 180, currentLabel = "This month", previousLabel = "Last month" }: { data: { day: number; current: number | null; previous: number | null }[]; height?: number; currentLabel?: string; previousLabel?: string }) {
  const money = useMoney();
  return (
    <div style={{ height }} role="img" aria-label="Cumulative daily spending compared with last month">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} width={48} tickFormatter={(v) => money(v, { compact: true })} />
          <Tooltip
            content={({ payload, label }) =>
              payload?.length ? (
                <TooltipBox
                  title={`Day ${label}`}
                  rows={payload.filter((p) => p.value != null).map((p) => ({ label: p.dataKey === "current" ? currentLabel : previousLabel, value: money(Number(p.value)), color: String(p.color) }))}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="previous" stroke="var(--muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="current" stroke="var(--primary)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BudgetLineChart({ data, height = 220 }: { data: { day: number; spent: number | null; limit: number; pace: number }[]; height?: number }) {
  const money = useMoney();
  const limit = data[0]?.limit ?? 0;
  return (
    <div style={{ height }} role="img" aria-label="Cumulative spending against the budget limit">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" {...axis} minTickGap={24} />
          <YAxis {...axis} width={52} tickFormatter={(v) => money(v, { compact: true })} />
          <Tooltip
            content={({ payload, label }) =>
              payload?.length ? (
                <TooltipBox
                  title={`Day ${label}`}
                  rows={payload.filter((p) => p.value != null).map((p) => ({ label: p.dataKey === "spent" ? "Spent" : "Even pace", value: money(Number(p.value)), color: String(p.color) }))}
                />
              ) : null
            }
          />
          <ReferenceLine y={limit} stroke="var(--danger)" strokeDasharray="6 4" label={{ value: "Limit", fill: "var(--danger)", fontSize: 12, position: "insideTopRight" }} />
          <Line type="linear" dataKey="pace" stroke="var(--muted)" strokeDasharray="3 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="spent" stroke="var(--primary)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBars({ data, height = 200, highlightLast }: { data: { label: string; value: number }[]; height?: number; highlightLast?: boolean }) {
  const money = useMoney();
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${money(d.value)}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} interval={0} tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <YAxis {...axis} width={48} tickFormatter={(v) => money(v, { compact: true })} />
          <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={({ payload, label }) => (payload?.[0] ? <TooltipBox title={String(label)} rows={[{ label: "Amount", value: money(Number(payload[0].value)) }]} /> : null)} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={d.label + i} fill={highlightLast && i === data.length - 1 ? "var(--primary)" : highlightLast ? "var(--line)" : "var(--primary)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareBars({ data, height = 280, currentLabel, previousLabel }: { data: { name: string; current: number; previous: number }[]; height?: number; currentLabel: string; previousLabel: string }) {
  const money = useMoney();
  return (
    <div style={{ height }} role="img" aria-label={`Spending by category, ${currentLabel} compared with ${previousLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" {...axis} tickFormatter={(v) => money(v, { compact: true })} />
          <YAxis type="category" dataKey="name" {...axis} width={92} tick={{ fontSize: 12, fill: "var(--fg)" }} />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            content={({ payload, label }) =>
              payload?.length ? (
                <TooltipBox title={String(label)} rows={payload.map((p) => ({ label: p.dataKey === "current" ? currentLabel : previousLabel, value: money(Number(p.value)), color: String(p.color) }))} />
              ) : null
            }
          />
          <Bar dataKey="previous" fill="var(--line)" radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={false} />
          <Bar dataKey="current" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
