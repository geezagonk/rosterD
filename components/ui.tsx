"use client";

import React from "react";
import { ContractorStatus } from "@/lib/types";

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "accent",
  meter,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "accent" | "pink" | "peach" | "green" | "blue" | "red";
  meter?: { pct: number; tone?: "fill" | "warn" | "over" };
}) {
  return (
    <div className="stat">
      {icon ? <span className={`icon ${tone}`}>{icon}</span> : null}
      <div className="stat-body">
        <div className="label">{label}</div>
        <div className="value">{value}</div>
        {sub ? <div className="sub">{sub}</div> : null}
        {meter ? (
          <div className="meter">
            <i
              className={`fill ${meter.tone === "warn" ? "warn" : meter.tone === "over" ? "over" : ""}`}
              style={{ width: `${Math.min(100, Math.max(0, meter.pct))}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Ring({
  pct,
  size = 54,
  stroke = 7,
  label,
  tone = "var(--accent)",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-tint)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span className="ring-label">{label ?? `${Math.round(clamped)}%`}</span>
    </span>
  );
}

export function Bar({
  label,
  value,
  max,
  display,
  tone,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  display: React.ReactNode;
  tone?: "alt" | "warn";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <div>{label}</div>
      <div className="bar-track">
        <i className={tone ?? ""} style={{ width: `${pct}%` }} />
      </div>
      <div className="num small muted">{display}</div>
    </div>
  );
}

const STATUS_TONE: Record<ContractorStatus, string> = {
  pipeline: "blue",
  onboarding: "warn",
  active: "good",
  notice: "pink",
  ended: "",
};

const STATUS_TEXT: Record<ContractorStatus, string> = {
  pipeline: "Pipeline",
  onboarding: "Onboarding",
  active: "Active",
  notice: "On notice",
  ended: "Ended",
};

export function StatusBadge({ status }: { status: ContractorStatus }) {
  return (
    <span className={`badge ${STATUS_TONE[status]}`}>{STATUS_TEXT[status]}</span>
  );
}

export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return <span className={`avatar c${(index % 5) + 1}`}>{initials || "?"}</span>;
}

export function Card({
  title,
  action,
  children,
  padded = true,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="card">
      {title ? (
        <header>
          <h2>{title}</h2>
          {action}
        </header>
      ) : null}
      {padded ? <div className="body">{children}</div> : children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
