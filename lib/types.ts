// Domain model for the contractor tracker.
// FTE is expressed in "units" where 100 units = 1.0 FTE = one standard week
// (40 hours by default). The department also carries a total FTE budget,
// expressed in the same units (100 FTE = 10,000 units).

export type ID = string;

export type EngagementType = "direct" | "intermediated";

export type ContractorStatus =
  | "pipeline"
  | "onboarding"
  | "active"
  | "notice"
  | "ended";

export type RateBasis = "hourly" | "daily";

export interface Settings {
  /** Hours in a standard full-time week. Drives the FTE conversion. */
  standardWeekHours: number;
  /** FTE units that equal 1.0 FTE. 100 by convention. */
  fteScale: number;
  /** Department-wide FTE ceiling, expressed in whole FTE (not units). */
  departmentFteBudget: number;
  /** Portion of the ceiling notionally reserved for permanents, in whole FTE. */
  permanentFte: number;
  /** Working days in a standard week, for daily-rate conversion. */
  workingDaysPerWeek: number;
  /** Weeks used to annualise a run rate. */
  weeksPerYear: number;
  currency: string;
  /** Contract-end warning horizon, in days. */
  endWarningDays: number;
  /** Tenure at which a contractor is flagged for review, in months. */
  maxTenureMonths: number;
  /** PO consumption at which a burn warning fires, 0-1. */
  poBurnWarnRatio: number;
  /** Share of total contractor spend with one vendor that trips a concentration flag, 0-1. */
  vendorConcentrationWarnRatio: number;
  /** Total contract value above which extra approval is recorded. */
  approvalThreshold: number;
  /** Charge rate above benchmark that trips a rate-drift flag, 0-1. */
  rateVarianceWarnRatio: number;

  // --- Resource Manager operational settings ---
  /** GST rate applied to invoice values, 0-1. */
  gstRate: number;
  /** Working days an invoice may sit awaiting internal approval before it is chased. */
  invoiceApprovalSlaDays: number;
  /** Default supplier payment terms in days, used when the vendor has none set. */
  defaultPaymentTermsDays: number;
  /** Days an approval may sit with one approver before it is flagged for chasing. */
  approvalChaseAfterDays: number;
  /** Days after a period ends before a missing invoice is flagged as not received. */
  invoiceExpectedAfterDays: number;
  /** Organisation name used on generated emails and the reporting pack. */
  organisationName: string;
  /** Team the resource management function sits in. */
  teamName: string;
}

export type VendorType = "agency" | "consultancy" | "msp" | "direct" | "other";

export interface Vendor {
  id: ID;
  name: string;
  type: VendorType;
  accountManagerName: string;
  accountManagerEmail: string;
  accountManagerPhone: string;
  /** Master services agreement reference. */
  msaRef: string;
  msaExpiry: string; // ISO date
  /** Agency margin as a percentage of the charge rate, if known. */
  marginPct: number | null;
  paymentTermsDays: number | null;
  /** Professional indemnity cover expiry. */
  piInsuranceExpiry: string;
  /** Public liability cover expiry. */
  plInsuranceExpiry: string;
  active: boolean;
  notes: string;
}

/** Benchmark charge rates, so the register can flag rate drift by role. */
export interface RateCardEntry {
  id: ID;
  role: string;
  level: string;
  /** Benchmark charge rate per hour, in the settings currency. */
  benchmarkHourly: number;
  source: string;
  reviewedOn: string;
}

export interface Project {
  id: ID;
  name: string;
  code: string;
  costCentre: string;
  sponsor: string;
  /** Approved contractor budget for the project, in currency units. Null = untracked. */
  budget: number | null;
  active: boolean;
}

export interface Allocation {
  projectId: ID;
  /** Share of this contractor's FTE, in percent of their own FTE (0-100). */
  sharePct: number;
}

export type AccountStatus = "not-requested" | "requested" | "active" | "revoked";

export interface AccessAccount {
  system: string;
  status: AccountStatus;
  requestedOn: string;
  revokedOn: string;
}

export interface AssetItem {
  item: string;
  assetTag: string;
  issuedOn: string;
  returnedOn: string;
}

export interface ChecklistItem {
  task: string;
  done: boolean;
  dueDate: string;
  owner: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface Contractor {
  id: ID;

  // --- Identity / HRIS biographical ---
  firstName: string;
  lastName: string;
  preferredName: string;
  /** Worker ID in the HR system of record, if mirrored there. */
  workerId: string;
  email: string;
  phone: string;
  dateOfBirth: string; // ISO date
  gender: string;
  nationality: string;
  /** e.g. NZ Citizen, Resident, Work Visa. */
  workRightsType: string;
  workRightsExpiry: string; // ISO date, blank if not time-limited
  location: string;
  emergencyContact: EmergencyContact;

  // --- Engagement ---
  engagementType: EngagementType;
  /** Required when engagementType is "intermediated". */
  vendorId: ID | null;
  role: string;
  team: string;
  hiringManager: string;
  status: ContractorStatus;
  startDate: string;
  endDate: string;
  /** End date on the original contract, before any extensions. */
  originalEndDate: string;
  hoursPerWeek: number;

  // --- Commercials ---
  rateBasis: RateBasis;
  /** Charge rate paid by the business, per hour or per day. */
  chargeRate: number;
  /** Rate the worker receives, where known (intermediated engagements). */
  payRate: number | null;

  // --- Governance ---
  contractRef: string;
  poNumber: string;
  poValue: number | null;
  /** Invoiced to date against the PO. */
  poSpentToDate: number;
  extensionCount: number;
  noticePeriodDays: number;
  /** Independent-contractor test / employment-status assessment completed. */
  statusTestCompleted: boolean;
  backgroundCheckCompleted: boolean;
  healthSafetyInducted: boolean;
  securityClearance: string;
  approvalRef: string;
  /** Whether the business would take this person back. Vendor-neutral. */
  rehireEligible: "yes" | "no" | "unknown";
  performanceNote: string;

  // --- Allocation ---
  allocations: Allocation[];

  // --- Access and lifecycle ---
  accounts: AccessAccount[];
  assets: AssetItem[];
  onboarding: ChecklistItem[];
  offboarding: ChecklistItem[];

  notes: string;
}

export type CommsChannel = "email" | "call" | "meeting" | "teams" | "note";
export type CommsDirection = "outbound" | "inbound" | "internal";

export interface CommsEntry {
  id: ID;
  date: string; // ISO date
  channel: CommsChannel;
  direction: CommsDirection;
  /** Either or both may be set. */
  contractorId: ID | null;
  vendorId: ID | null;
  subject: string;
  summary: string;
  participants: string;
  followUpDate: string;
  /** Tag for what the exchange was about. */
  topic: string;
}

export type ReminderType =
  | "contract-end"
  | "notice-decision"
  | "po-burn"
  | "work-rights"
  | "tenure-review"
  | "msa-expiry"
  | "insurance-expiry"
  | "approval-stalled"
  | "approval-deadline"
  | "invoice-approval"
  | "invoice-overdue"
  | "invoice-missing"
  | "invoice-disputed"
  | "onboarding"
  | "offboarding"
  | "comms-followup"
  | "custom";

export type ReminderStatus = "open" | "done" | "dismissed";

export interface Reminder {
  id: ID;
  type: ReminderType;
  title: string;
  detail: string;
  dueDate: string;
  contractorId: ID | null;
  vendorId: ID | null;
  status: ReminderStatus;
  /** True when derived from the data rather than entered by hand. */
  derived: boolean;
  owner: string;
}

// ---------------------------------------------------------------------------
// Chasing
// ---------------------------------------------------------------------------

/**
 * A single act of following something up. The point of recording these is that
 * in a low-maturity, manual environment the chase history IS the process: it is
 * the evidence of where the delay actually sits.
 */
export interface Chase {
  date: string;
  channel: "email" | "call" | "teams" | "in-person";
  chasedWho: string;
  note: string;
  outcome: string;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type ApprovalKind =
  | "new-engagement"
  | "extension"
  | "rate-change"
  | "hours-change"
  | "scope-change"
  | "po-increase"
  | "early-termination";

export type ApprovalState =
  | "draft"
  | "submitted"
  | "with-approver"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface Approval {
  id: ID;
  contractorId: ID;
  kind: ApprovalKind;
  /** Change request or approval reference in whatever system holds it. */
  reference: string;
  description: string;
  /** Financial impact of the change, where it has one. */
  value: number | null;
  raisedOn: string;
  /** Date the decision is actually needed by, usually a notice date. */
  requiredBy: string;
  state: ApprovalState;
  /** Who it is currently sitting with. The single most useful field here. */
  currentApprover: string;
  currentApproverRole: string;
  /** When it landed with the current approver, for ageing. */
  withApproverSince: string;
  decidedOn: string;
  chases: Chase[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Variations
// ---------------------------------------------------------------------------

export type VariationType =
  | "extension"
  | "rate-change"
  | "hours-change"
  | "scope-change"
  | "early-termination";

/**
 * A recorded change to an engagement. Kept as its own record rather than just
 * incrementing a counter, so contract value history survives and you can answer
 * "what did this cost before the last three extensions".
 */
export interface Variation {
  id: ID;
  contractorId: ID;
  type: VariationType;
  reference: string;
  effectiveFrom: string;
  recordedOn: string;
  previousEndDate: string;
  newEndDate: string;
  previousRate: number | null;
  newRate: number | null;
  previousHoursPerWeek: number | null;
  newHoursPerWeek: number | null;
  /** Change in whole-of-contract charge value, positive or negative. */
  valueImpact: number | null;
  /** The approval that authorised it, if one exists. */
  approvalId: ID | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceStatus =
  | "expected"
  | "received"
  | "with-approver"
  | "approved"
  | "paid"
  | "disputed"
  | "on-hold";

export interface Invoice {
  id: ID;
  contractorId: ID;
  vendorId: ID | null;
  invoiceNumber: string;
  poNumber: string;
  periodStart: string;
  periodEnd: string;
  /** Hours claimed on the invoice, for reconciliation against contracted hours. */
  hoursClaimed: number | null;
  amountExGst: number;
  receivedOn: string;
  dueDate: string;
  status: InvoiceStatus;
  approver: string;
  /** When it went out for internal approval. */
  sentForApprovalOn: string;
  approvedOn: string;
  paidOn: string;
  disputeReason: string;
  chases: Chase[];
  notes: string;
}

export interface AppData {
  version: number;
  settings: Settings;
  vendors: Vendor[];
  projects: Project[];
  rateCard: RateCardEntry[];
  contractors: Contractor[];
  approvals: Approval[];
  variations: Variation[];
  invoices: Invoice[];
  comms: CommsEntry[];
  /** Manually created reminders plus the resolution state of derived ones. */
  reminders: Reminder[];
  /** Keys of derived reminders that have been actioned or dismissed. */
  derivedState: Record<string, { status: ReminderStatus; actionedOn: string }>;
}

export const DEFAULT_SETTINGS: Settings = {
  standardWeekHours: 40,
  fteScale: 100,
  departmentFteBudget: 100,
  permanentFte: 78,
  workingDaysPerWeek: 5,
  weeksPerYear: 52,
  currency: "NZD",
  endWarningDays: 60,
  maxTenureMonths: 24,
  poBurnWarnRatio: 0.8,
  vendorConcentrationWarnRatio: 0.4,
  approvalThreshold: 100000,
  rateVarianceWarnRatio: 0.1,
  gstRate: 0.15,
  invoiceApprovalSlaDays: 5,
  defaultPaymentTermsDays: 30,
  approvalChaseAfterDays: 5,
  invoiceExpectedAfterDays: 10,
  organisationName: "AUT",
  teamName: "Strategy and Transformation",
};
