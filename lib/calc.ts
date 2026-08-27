import {
  AppData,
  Contractor,
  ContractorStatus,
  Project,
  Settings,
  Vendor,
} from "./types";

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const MS_PER_DAY = 86_400_000;

export function today(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseDate(iso: string): Date | null {
  if (!iso) return null;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function toISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function daysUntil(iso: string): number | null {
  const d = parseDate(iso);
  if (!d) return null;
  return daysBetween(today(), d);
}

export function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1)
  );
}

// ---------------------------------------------------------------------------
// FTE
// ---------------------------------------------------------------------------

/**
 * FTE in units, where `fteScale` units (100 by default) equal one full-time
 * week of `standardWeekHours` hours. 20 hours on a 40 hour week -> 50 units.
 */
export function fteUnits(c: Contractor, s: Settings): number {
  if (!s.standardWeekHours) return 0;
  return (c.hoursPerWeek / s.standardWeekHours) * s.fteScale;
}

/** The same figure expressed as whole FTE, e.g. 0.5. */
export function fteDecimal(c: Contractor, s: Settings): number {
  return fteUnits(c, s) / s.fteScale;
}

/** Department ceiling expressed in the same units as `fteUnits`. */
export function departmentBudgetUnits(s: Settings): number {
  return s.departmentFteBudget * s.fteScale;
}

/** Ceiling left for contractors once permanent establishment is set aside. */
export function contractorHeadroomUnits(s: Settings): number {
  return Math.max(0, (s.departmentFteBudget - s.permanentFte) * s.fteScale);
}

/** Statuses that consume capacity and cost right now. */
export const CONSUMING_STATUSES: ContractorStatus[] = [
  "onboarding",
  "active",
  "notice",
];

export function isConsuming(c: Contractor): boolean {
  return CONSUMING_STATUSES.includes(c.status);
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export function standardDayHours(s: Settings): number {
  return s.workingDaysPerWeek > 0
    ? s.standardWeekHours / s.workingDaysPerWeek
    : 8;
}

/** Charge cost for one standard week at the contractor's contracted hours. */
export function weeklyCost(c: Contractor, s: Settings): number {
  if (c.rateBasis === "hourly") return c.chargeRate * c.hoursPerWeek;
  const dayHours = standardDayHours(s);
  if (!dayHours) return 0;
  return c.chargeRate * (c.hoursPerWeek / dayHours);
}

export function annualisedCost(c: Contractor, s: Settings): number {
  return weeklyCost(c, s) * s.weeksPerYear;
}

export function monthlyCost(c: Contractor, s: Settings): number {
  return (annualisedCost(c, s) / 12);
}

/** Effective hourly charge rate, whatever basis the contract is written on. */
export function effectiveHourlyRate(c: Contractor, s: Settings): number {
  if (c.rateBasis === "hourly") return c.chargeRate;
  const dayHours = standardDayHours(s);
  return dayHours ? c.chargeRate / dayHours : 0;
}

/** Charge cost still to run between today and the contract end date. */
export function committedRemainingCost(c: Contractor, s: Settings): number {
  const end = parseDate(c.endDate);
  if (!end || !isConsuming(c)) return 0;
  const days = Math.max(0, daysBetween(today(), end));
  return (weeklyCost(c, s) / 7) * days;
}

/** Whole-of-contract charge value, start to end. */
export function totalContractValue(c: Contractor, s: Settings): number {
  const start = parseDate(c.startDate);
  const end = parseDate(c.endDate);
  if (!start || !end) return 0;
  const days = Math.max(0, daysBetween(start, end));
  return (weeklyCost(c, s) / 7) * days;
}

export function poBurnRatio(c: Contractor): number | null {
  if (!c.poValue || c.poValue <= 0) return null;
  return c.poSpentToDate / c.poValue;
}

/** Agency margin in currency per week, where both rates are known. */
export function weeklyMargin(c: Contractor, s: Settings): number | null {
  if (c.engagementType !== "intermediated" || c.payRate == null) return null;
  const shadow: Contractor = { ...c, chargeRate: c.payRate };
  return weeklyCost(c, s) - weeklyCost(shadow, s);
}

/**
 * Variance of this contractor's effective hourly charge rate against the
 * benchmark for their role. Positive means we are paying over the card.
 * Returns null when no benchmark exists for the role.
 */
export function rateVariance(
  c: Contractor,
  data: AppData
): { benchmark: number; effective: number; variance: number } | null {
  const entry = data.rateCard.find(
    (r) => r.role.toLowerCase() === c.role.toLowerCase()
  );
  if (!entry || !entry.benchmarkHourly) return null;
  const effective = effectiveHourlyRate(c, data.settings);
  return {
    benchmark: entry.benchmarkHourly,
    effective,
    variance: (effective - entry.benchmarkHourly) / entry.benchmarkHourly,
  };
}

// ---------------------------------------------------------------------------
// Tenure and allocation
// ---------------------------------------------------------------------------

export function tenureMonths(c: Contractor): number | null {
  const start = parseDate(c.startDate);
  if (!start) return null;
  return monthsBetween(start, today());
}

export function allocationTotal(c: Contractor): number {
  return c.allocations.reduce((sum, a) => sum + (a.sharePct || 0), 0);
}

/** Unallocated share of a contractor's own FTE, in percent. */
export function unallocatedPct(c: Contractor): number {
  return 100 - allocationTotal(c);
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export interface Rollup {
  headcount: number;
  fteUnits: number;
  weeklyCost: number;
  annualisedCost: number;
  committedRemaining: number;
}

export function emptyRollup(): Rollup {
  return {
    headcount: 0,
    fteUnits: 0,
    weeklyCost: 0,
    annualisedCost: 0,
    committedRemaining: 0,
  };
}

export function rollup(list: Contractor[], s: Settings): Rollup {
  return list.reduce<Rollup>((acc, c) => {
    acc.headcount += 1;
    acc.fteUnits += fteUnits(c, s);
    acc.weeklyCost += weeklyCost(c, s);
    acc.annualisedCost += annualisedCost(c, s);
    acc.committedRemaining += committedRemainingCost(c, s);
    return acc;
  }, emptyRollup());
}

export function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item) || "Unassigned";
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export interface GroupedRollup extends Rollup {
  key: string;
  label: string;
}

export function rollupBy(
  list: Contractor[],
  s: Settings,
  key: (c: Contractor) => string,
  label?: (k: string) => string
): GroupedRollup[] {
  const groups = groupBy(list, key);
  const rows: GroupedRollup[] = [];
  groups.forEach((members, k) => {
    rows.push({ key: k, label: label ? label(k) : k, ...rollup(members, s) });
  });
  return rows.sort((a, b) => b.annualisedCost - a.annualisedCost);
}

/** FTE units per project, respecting each contractor's allocation split. */
export function projectRollup(
  data: AppData
): Array<{ project: Project | null; fteUnits: number; weeklyCost: number; headcount: number }> {
  const s = data.settings;
  const map = new Map<string, { fteUnits: number; weeklyCost: number; headcount: number }>();
  const push = (id: string, fte: number, cost: number) => {
    const row = map.get(id) ?? { fteUnits: 0, weeklyCost: 0, headcount: 0 };
    row.fteUnits += fte;
    row.weeklyCost += cost;
    row.headcount += 1;
    map.set(id, row);
  };

  for (const c of data.contractors.filter(isConsuming)) {
    const fte = fteUnits(c, s);
    const cost = weeklyCost(c, s);
    let allocated = 0;
    for (const a of c.allocations) {
      const share = (a.sharePct || 0) / 100;
      if (share <= 0) continue;
      allocated += share;
      push(a.projectId, fte * share, cost * share);
    }
    if (allocated < 1) {
      push("__unallocated", fte * (1 - allocated), cost * (1 - allocated));
    }
  }

  const rows = Array.from(map.entries()).map(([id, row]) => ({
    project: data.projects.find((p) => p.id === id) ?? null,
    ...row,
  }));
  return rows.sort((a, b) => b.weeklyCost - a.weeklyCost);
}

export function vendorConcentration(
  data: AppData
): Array<{ vendor: Vendor | null; label: string; annualisedCost: number; share: number; headcount: number }> {
  const s = data.settings;
  const active = data.contractors.filter(isConsuming);
  const total = active.reduce((sum, c) => sum + annualisedCost(c, s), 0);
  const rows = rollupBy(active, s, (c) => c.vendorId ?? "__direct");
  return rows.map((r) => ({
    vendor: data.vendors.find((v) => v.id === r.key) ?? null,
    label:
      r.key === "__direct"
        ? "Direct engagement"
        : data.vendors.find((v) => v.id === r.key)?.name ?? "Unknown vendor",
    annualisedCost: r.annualisedCost,
    share: total > 0 ? r.annualisedCost / total : 0,
    headcount: r.headcount,
  }));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMoney(value: number, currency = "NZD", dp = 0): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatFte(units: number, s: Settings): string {
  return `${units.toFixed(0)} (${(units / s.fteScale).toFixed(2)} FTE)`;
}

export function formatDate(iso: string): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fullName(c: Contractor): string {
  const first = c.preferredName || c.firstName;
  return `${first} ${c.lastName}`.trim();
}

/** "1 person" / "3 people". Small thing, but a report that says "1 people" reads as untrustworthy. */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

/** "1 day" / "5 days". */
export function days(n: number): string {
  return plural(n, "day");
}
