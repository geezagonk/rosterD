import {
  allocationTotal,
  annualisedCost,
  committedRemainingCost,
  effectiveHourlyRate,
  fteUnits,
  fullName,
  tenureMonths,
  weeklyCost,
} from "./calc";
import { allReminders } from "./reminders";
import {
  ageingBucket,
  approvalAge,
  daysAwaitingApproval,
  daysSinceLastChase,
  daysToPaymentDue,
  daysWithApprover,
  invoiceTotal,
  isApprovalOpen,
  paidTotal,
} from "./operations";
import { AppData } from "./types";

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\r\n");
}

/** Flat register export, shaped for a Power BI / Excel load. */
export function registerRows(data: AppData) {
  const s = data.settings;
  return data.contractors.map((c) => {
    const vendor = data.vendors.find((v) => v.id === c.vendorId);
    return {
      ContractorId: c.id,
      WorkerId: c.workerId,
      Name: fullName(c),
      FirstName: c.firstName,
      LastName: c.lastName,
      Email: c.email,
      Location: c.location,
      Nationality: c.nationality,
      WorkRightsType: c.workRightsType,
      WorkRightsExpiry: c.workRightsExpiry,
      EngagementType: c.engagementType,
      VendorId: c.vendorId ?? "",
      VendorName: vendor?.name ?? "Direct",
      Role: c.role,
      Team: c.team,
      HiringManager: c.hiringManager,
      Status: c.status,
      StartDate: c.startDate,
      EndDate: c.endDate,
      OriginalEndDate: c.originalEndDate,
      HoursPerWeek: c.hoursPerWeek,
      FteUnits: Number(fteUnits(c, s).toFixed(2)),
      Fte: Number((fteUnits(c, s) / s.fteScale).toFixed(4)),
      RateBasis: c.rateBasis,
      ChargeRate: c.chargeRate,
      PayRate: c.payRate ?? "",
      EffectiveHourlyRate: Number(effectiveHourlyRate(c, s).toFixed(2)),
      WeeklyCost: Number(weeklyCost(c, s).toFixed(2)),
      AnnualisedCost: Number(annualisedCost(c, s).toFixed(2)),
      CommittedRemainingCost: Number(committedRemainingCost(c, s).toFixed(2)),
      ContractRef: c.contractRef,
      PoNumber: c.poNumber,
      PoValue: c.poValue ?? "",
      PoSpentToDate: c.poSpentToDate,
      ExtensionCount: c.extensionCount,
      NoticePeriodDays: c.noticePeriodDays,
      TenureMonths: tenureMonths(c) ?? "",
      StatusTestCompleted: c.statusTestCompleted ? 1 : 0,
      BackgroundCheckCompleted: c.backgroundCheckCompleted ? 1 : 0,
      HealthSafetyInducted: c.healthSafetyInducted ? 1 : 0,
      SecurityClearance: c.securityClearance,
      RehireEligible: c.rehireEligible,
      AllocationTotalPct: allocationTotal(c),
    };
  });
}

export function allocationRows(data: AppData) {
  const s = data.settings;
  const rows: Array<Record<string, unknown>> = [];
  for (const c of data.contractors) {
    for (const a of c.allocations) {
      const project = data.projects.find((p) => p.id === a.projectId);
      rows.push({
        ContractorId: c.id,
        ContractorName: fullName(c),
        ProjectId: a.projectId,
        ProjectName: project?.name ?? "",
        ProjectCode: project?.code ?? "",
        CostCentre: project?.costCentre ?? "",
        SharePct: a.sharePct,
        AllocatedFteUnits: Number(((fteUnits(c, s) * a.sharePct) / 100).toFixed(2)),
        AllocatedWeeklyCost: Number(
          ((weeklyCost(c, s) * a.sharePct) / 100).toFixed(2)
        ),
      });
    }
  }
  return rows;
}

export function commsRows(data: AppData) {
  return data.comms.map((e) => ({
    CommsId: e.id,
    Date: e.date,
    Channel: e.channel,
    Direction: e.direction,
    ContractorId: e.contractorId ?? "",
    VendorId: e.vendorId ?? "",
    Topic: e.topic,
    Subject: e.subject,
    Summary: e.summary,
    Participants: e.participants,
    FollowUpDate: e.followUpDate,
  }));
}

export function reminderRows(data: AppData) {
  return allReminders(data).map((r) => ({
    ReminderKey: r.key,
    Type: r.type,
    Title: r.title,
    Detail: r.detail,
    DueDate: r.dueDate,
    DaysOut: r.daysOut ?? "",
    Severity: r.severity,
    Status: r.status,
    Derived: r.derived ? 1 : 0,
    ContractorId: r.contractorId ?? "",
    VendorId: r.vendorId ?? "",
    Subject: r.subjectLabel,
  }));
}

export function vendorRows(data: AppData) {
  return data.vendors.map((v) => ({
    VendorId: v.id,
    VendorName: v.name,
    VendorType: v.type,
    AccountManager: v.accountManagerName,
    AccountManagerEmail: v.accountManagerEmail,
    AccountManagerPhone: v.accountManagerPhone,
    MsaRef: v.msaRef,
    MsaExpiry: v.msaExpiry,
    MarginPct: v.marginPct ?? "",
    PaymentTermsDays: v.paymentTermsDays ?? "",
    PiInsuranceExpiry: v.piInsuranceExpiry,
    PlInsuranceExpiry: v.plInsuranceExpiry,
    Active: v.active ? 1 : 0,
  }));
}

export function projectRows(data: AppData) {
  return data.projects.map((p) => ({
    ProjectId: p.id,
    ProjectName: p.name,
    ProjectCode: p.code,
    CostCentre: p.costCentre,
    Sponsor: p.sponsor,
    Budget: p.budget ?? "",
    Active: p.active ? 1 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function icsDate(iso: string) {
  return iso.replace(/-/g, "");
}

function icsEscape(s: string) {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

/** All-day VEVENTs for every open reminder, for Outlook or Google. */
export function remindersToIcs(data: AppData): string {
  const events = allReminders(data)
    .filter((r) => r.status === "open" && r.dueDate)
    .map((r) => {
      const start = icsDate(r.dueDate);
      const endDate = new Date(r.dueDate);
      endDate.setDate(endDate.getDate() + 1);
      const end = icsDate(endDate.toISOString().slice(0, 10));
      return [
        "BEGIN:VEVENT",
        `UID:${r.key.replace(/[^A-Za-z0-9]/g, "-")}@rostered`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsEscape(r.title)}`,
        `DESCRIPTION:${icsEscape(r.detail)}`,
        "BEGIN:VALARM",
        "TRIGGER:-P7D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape(r.title)}`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rostered//Contingent Workforce Tracker//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

function sqlStr(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `N'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v: unknown): string {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v)))
    return "NULL";
  return String(Number(v));
}
function sqlBit(v: boolean): string {
  return v ? "1" : "0";
}
function sqlDate(v: string): string {
  return v ? `'${v}'` : "NULL";
}

/**
 * T-SQL INSERT script matching db/01_schema.sql, so the browser-local register
 * can be pushed into SQL Server / Azure SQL and picked up by Power BI.
 */
export function toSqlInserts(data: AppData): string {
  const out: string[] = [
    "-- Generated by Rostered (contingent workforce tracker)",
    "-- Target: SQL Server / Azure SQL. Run db/01_schema.sql first.",
    "SET NOCOUNT ON;",
    "BEGIN TRANSACTION;",
    "",
    "DELETE FROM wf.Allocation;",
    "DELETE FROM wf.AccessAccount;",
    "DELETE FROM wf.Asset;",
    "DELETE FROM wf.ChecklistItem;",
    "DELETE FROM wf.Chase;",
    "DELETE FROM wf.Invoice;",
    "DELETE FROM wf.Variation;",
    "DELETE FROM wf.Approval;",
    "DELETE FROM wf.Comms;",
    "DELETE FROM wf.Reminder;",
    "DELETE FROM wf.Contractor;",
    "DELETE FROM wf.RateCard;",
    "DELETE FROM wf.Project;",
    "DELETE FROM wf.Vendor;",
    "DELETE FROM wf.Settings;",
    "",
  ];

  const s = data.settings;
  out.push(
    "INSERT INTO wf.Settings (SettingsId, StandardWeekHours, FteScale, DepartmentFteBudget, PermanentFte, WorkingDaysPerWeek, WeeksPerYear, Currency, EndWarningDays, MaxTenureMonths, PoBurnWarnRatio, VendorConcentrationWarnRatio, ApprovalThreshold, RateVarianceWarnRatio, GstRate, InvoiceApprovalSlaDays, DefaultPaymentTermsDays, ApprovalChaseAfterDays, InvoiceExpectedAfterDays, OrganisationName, TeamName) VALUES",
    `  (1, ${sqlNum(s.standardWeekHours)}, ${sqlNum(s.fteScale)}, ${sqlNum(s.departmentFteBudget)}, ${sqlNum(s.permanentFte)}, ${sqlNum(s.workingDaysPerWeek)}, ${sqlNum(s.weeksPerYear)}, ${sqlStr(s.currency)}, ${sqlNum(s.endWarningDays)}, ${sqlNum(s.maxTenureMonths)}, ${sqlNum(s.poBurnWarnRatio)}, ${sqlNum(s.vendorConcentrationWarnRatio)}, ${sqlNum(s.approvalThreshold)}, ${sqlNum(s.rateVarianceWarnRatio)}, ${sqlNum(s.gstRate)}, ${sqlNum(s.invoiceApprovalSlaDays)}, ${sqlNum(s.defaultPaymentTermsDays)}, ${sqlNum(s.approvalChaseAfterDays)}, ${sqlNum(s.invoiceExpectedAfterDays)}, ${sqlStr(s.organisationName)}, ${sqlStr(s.teamName)});`,
    ""
  );

  for (const v of data.vendors) {
    out.push(
      `INSERT INTO wf.Vendor (VendorId, VendorName, VendorType, AccountManagerName, AccountManagerEmail, AccountManagerPhone, MsaRef, MsaExpiry, MarginPct, PaymentTermsDays, PiInsuranceExpiry, PlInsuranceExpiry, IsActive, Notes) VALUES (${sqlStr(v.id)}, ${sqlStr(v.name)}, ${sqlStr(v.type)}, ${sqlStr(v.accountManagerName)}, ${sqlStr(v.accountManagerEmail)}, ${sqlStr(v.accountManagerPhone)}, ${sqlStr(v.msaRef)}, ${sqlDate(v.msaExpiry)}, ${sqlNum(v.marginPct)}, ${sqlNum(v.paymentTermsDays)}, ${sqlDate(v.piInsuranceExpiry)}, ${sqlDate(v.plInsuranceExpiry)}, ${sqlBit(v.active)}, ${sqlStr(v.notes)});`
    );
  }
  out.push("");

  for (const p of data.projects) {
    out.push(
      `INSERT INTO wf.Project (ProjectId, ProjectName, ProjectCode, CostCentre, Sponsor, Budget, IsActive) VALUES (${sqlStr(p.id)}, ${sqlStr(p.name)}, ${sqlStr(p.code)}, ${sqlStr(p.costCentre)}, ${sqlStr(p.sponsor)}, ${sqlNum(p.budget)}, ${sqlBit(p.active)});`
    );
  }
  out.push("");

  for (const r of data.rateCard) {
    out.push(
      `INSERT INTO wf.RateCard (RateCardId, Role, RoleLevel, BenchmarkHourly, Source, ReviewedOn) VALUES (${sqlStr(r.id)}, ${sqlStr(r.role)}, ${sqlStr(r.level)}, ${sqlNum(r.benchmarkHourly)}, ${sqlStr(r.source)}, ${sqlDate(r.reviewedOn)});`
    );
  }
  out.push("");

  for (const c of data.contractors) {
    out.push(
      `INSERT INTO wf.Contractor (ContractorId, WorkerId, FirstName, LastName, PreferredName, Email, Phone, DateOfBirth, Gender, Nationality, WorkRightsType, WorkRightsExpiry, Location, EmergencyContactName, EmergencyContactRelationship, EmergencyContactPhone, EngagementType, VendorId, Role, Team, HiringManager, EngagementStatus, StartDate, EndDate, OriginalEndDate, HoursPerWeek, RateBasis, ChargeRate, PayRate, ContractRef, PoNumber, PoValue, PoSpentToDate, ExtensionCount, NoticePeriodDays, StatusTestCompleted, BackgroundCheckCompleted, HealthSafetyInducted, SecurityClearance, ApprovalRef, RehireEligible, PerformanceNote, Notes) VALUES (` +
        [
          sqlStr(c.id),
          sqlStr(c.workerId),
          sqlStr(c.firstName),
          sqlStr(c.lastName),
          sqlStr(c.preferredName),
          sqlStr(c.email),
          sqlStr(c.phone),
          sqlDate(c.dateOfBirth),
          sqlStr(c.gender),
          sqlStr(c.nationality),
          sqlStr(c.workRightsType),
          sqlDate(c.workRightsExpiry),
          sqlStr(c.location),
          sqlStr(c.emergencyContact.name),
          sqlStr(c.emergencyContact.relationship),
          sqlStr(c.emergencyContact.phone),
          sqlStr(c.engagementType),
          sqlStr(c.vendorId),
          sqlStr(c.role),
          sqlStr(c.team),
          sqlStr(c.hiringManager),
          sqlStr(c.status),
          sqlDate(c.startDate),
          sqlDate(c.endDate),
          sqlDate(c.originalEndDate),
          sqlNum(c.hoursPerWeek),
          sqlStr(c.rateBasis),
          sqlNum(c.chargeRate),
          sqlNum(c.payRate),
          sqlStr(c.contractRef),
          sqlStr(c.poNumber),
          sqlNum(c.poValue),
          sqlNum(c.poSpentToDate),
          sqlNum(c.extensionCount),
          sqlNum(c.noticePeriodDays),
          sqlBit(c.statusTestCompleted),
          sqlBit(c.backgroundCheckCompleted),
          sqlBit(c.healthSafetyInducted),
          sqlStr(c.securityClearance),
          sqlStr(c.approvalRef),
          sqlStr(c.rehireEligible),
          sqlStr(c.performanceNote),
          sqlStr(c.notes),
        ].join(", ") +
        ");"
    );
    for (const a of c.allocations) {
      out.push(
        `INSERT INTO wf.Allocation (ContractorId, ProjectId, SharePct) VALUES (${sqlStr(c.id)}, ${sqlStr(a.projectId)}, ${sqlNum(a.sharePct)});`
      );
    }
    for (const a of c.accounts) {
      out.push(
        `INSERT INTO wf.AccessAccount (ContractorId, SystemName, AccountStatus, RequestedOn, RevokedOn) VALUES (${sqlStr(c.id)}, ${sqlStr(a.system)}, ${sqlStr(a.status)}, ${sqlDate(a.requestedOn)}, ${sqlDate(a.revokedOn)});`
      );
    }
    for (const a of c.assets) {
      out.push(
        `INSERT INTO wf.Asset (ContractorId, ItemName, AssetTag, IssuedOn, ReturnedOn) VALUES (${sqlStr(c.id)}, ${sqlStr(a.item)}, ${sqlStr(a.assetTag)}, ${sqlDate(a.issuedOn)}, ${sqlDate(a.returnedOn)});`
      );
    }
    for (const [phase, items] of [
      ["onboarding", c.onboarding],
      ["offboarding", c.offboarding],
    ] as const) {
      for (const i of items) {
        out.push(
          `INSERT INTO wf.ChecklistItem (ContractorId, Phase, Task, IsDone, DueDate, Owner) VALUES (${sqlStr(c.id)}, ${sqlStr(phase)}, ${sqlStr(i.task)}, ${sqlBit(i.done)}, ${sqlDate(i.dueDate)}, ${sqlStr(i.owner)});`
        );
      }
    }
  }
  out.push("");

  for (const e of data.comms) {
    out.push(
      `INSERT INTO wf.Comms (CommsId, CommsDate, Channel, Direction, ContractorId, VendorId, Subject, Summary, Participants, FollowUpDate, Topic) VALUES (${sqlStr(e.id)}, ${sqlDate(e.date)}, ${sqlStr(e.channel)}, ${sqlStr(e.direction)}, ${sqlStr(e.contractorId)}, ${sqlStr(e.vendorId)}, ${sqlStr(e.subject)}, ${sqlStr(e.summary)}, ${sqlStr(e.participants)}, ${sqlDate(e.followUpDate)}, ${sqlStr(e.topic)});`
    );
  }
  out.push("");

  for (const r of data.reminders) {
    out.push(
      `INSERT INTO wf.Reminder (ReminderId, ReminderType, Title, Detail, DueDate, ContractorId, VendorId, ReminderStatus, IsDerived, Owner) VALUES (${sqlStr(r.id)}, ${sqlStr(r.type)}, ${sqlStr(r.title)}, ${sqlStr(r.detail)}, ${sqlDate(r.dueDate)}, ${sqlStr(r.contractorId)}, ${sqlStr(r.vendorId)}, ${sqlStr(r.status)}, ${sqlBit(r.derived)}, ${sqlStr(r.owner)});`
    );
  }

  out.push("");

  for (const a of data.approvals) {
    out.push(
      `INSERT INTO wf.Approval (ApprovalId, ContractorId, ApprovalKind, Reference, ApprovalDescription, ApprovalValue, RaisedOn, RequiredBy, ApprovalState, CurrentApprover, CurrentApproverRole, WithApproverSince, DecidedOn, Notes) VALUES (${sqlStr(a.id)}, ${sqlStr(a.contractorId)}, ${sqlStr(a.kind)}, ${sqlStr(a.reference)}, ${sqlStr(a.description)}, ${sqlNum(a.value)}, ${sqlDate(a.raisedOn)}, ${sqlDate(a.requiredBy)}, ${sqlStr(a.state)}, ${sqlStr(a.currentApprover)}, ${sqlStr(a.currentApproverRole)}, ${sqlDate(a.withApproverSince)}, ${sqlDate(a.decidedOn)}, ${sqlStr(a.notes)});`
    );
    for (const ch of a.chases) {
      out.push(
        `INSERT INTO wf.Chase (ParentType, ParentId, ChaseDate, Channel, ChasedWho, Note, Outcome) VALUES ('approval', ${sqlStr(a.id)}, ${sqlDate(ch.date)}, ${sqlStr(ch.channel)}, ${sqlStr(ch.chasedWho)}, ${sqlStr(ch.note)}, ${sqlStr(ch.outcome)});`
      );
    }
  }
  out.push("");

  for (const v of data.variations) {
    out.push(
      `INSERT INTO wf.Variation (VariationId, ContractorId, VariationType, Reference, EffectiveFrom, RecordedOn, PreviousEndDate, NewEndDate, PreviousRate, NewRate, PreviousHoursPerWeek, NewHoursPerWeek, ValueImpact, ApprovalId, Notes) VALUES (${sqlStr(v.id)}, ${sqlStr(v.contractorId)}, ${sqlStr(v.type)}, ${sqlStr(v.reference)}, ${sqlDate(v.effectiveFrom)}, ${sqlDate(v.recordedOn)}, ${sqlDate(v.previousEndDate)}, ${sqlDate(v.newEndDate)}, ${sqlNum(v.previousRate)}, ${sqlNum(v.newRate)}, ${sqlNum(v.previousHoursPerWeek)}, ${sqlNum(v.newHoursPerWeek)}, ${sqlNum(v.valueImpact)}, ${sqlStr(v.approvalId)}, ${sqlStr(v.notes)});`
    );
  }
  out.push("");

  for (const i of data.invoices) {
    out.push(
      `INSERT INTO wf.Invoice (InvoiceId, ContractorId, VendorId, InvoiceNumber, PoNumber, PeriodStart, PeriodEnd, HoursClaimed, AmountExGst, ReceivedOn, SentForApprovalOn, ApprovedOn, DueDate, PaidOn, InvoiceStatus, Approver, DisputeReason, Notes) VALUES (${sqlStr(i.id)}, ${sqlStr(i.contractorId)}, ${sqlStr(i.vendorId)}, ${sqlStr(i.invoiceNumber)}, ${sqlStr(i.poNumber)}, ${sqlDate(i.periodStart)}, ${sqlDate(i.periodEnd)}, ${sqlNum(i.hoursClaimed)}, ${sqlNum(i.amountExGst)}, ${sqlDate(i.receivedOn)}, ${sqlDate(i.sentForApprovalOn)}, ${sqlDate(i.approvedOn)}, ${sqlDate(i.dueDate)}, ${sqlDate(i.paidOn)}, ${sqlStr(i.status)}, ${sqlStr(i.approver)}, ${sqlStr(i.disputeReason)}, ${sqlStr(i.notes)});`
    );
    for (const ch of i.chases) {
      out.push(
        `INSERT INTO wf.Chase (ParentType, ParentId, ChaseDate, Channel, ChasedWho, Note, Outcome) VALUES ('invoice', ${sqlStr(i.id)}, ${sqlDate(ch.date)}, ${sqlStr(ch.channel)}, ${sqlStr(ch.chasedWho)}, ${sqlStr(ch.note)}, ${sqlStr(ch.outcome)});`
      );
    }
  }

  out.push("", "COMMIT TRANSACTION;");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Resource Manager tables
// ---------------------------------------------------------------------------

export function invoiceRows(data: AppData) {
  const s = data.settings;
  return data.invoices.map((i) => {
    const c = data.contractors.find((x) => x.id === i.contractorId);
    const v = data.vendors.find((x) => x.id === i.vendorId);
    return {
      InvoiceId: i.id,
      InvoiceNumber: i.invoiceNumber,
      ContractorId: i.contractorId,
      ContractorName: c ? fullName(c) : "",
      VendorId: i.vendorId ?? "",
      VendorName: v?.name ?? "Direct",
      PoNumber: i.poNumber,
      PeriodStart: i.periodStart,
      PeriodEnd: i.periodEnd,
      HoursClaimed: i.hoursClaimed ?? "",
      AmountExGst: i.amountExGst,
      Gst: Number((i.amountExGst * s.gstRate).toFixed(2)),
      AmountIncGst: Number(invoiceTotal(i, s).toFixed(2)),
      InvoiceStatus: i.status,
      Approver: i.approver,
      ReceivedOn: i.receivedOn,
      SentForApprovalOn: i.sentForApprovalOn,
      ApprovedOn: i.approvedOn,
      DueDate: i.dueDate,
      PaidOn: i.paidOn,
      DaysAwaitingApproval: daysAwaitingApproval(i) ?? "",
      DaysToPaymentDue: daysToPaymentDue(i) ?? "",
      AgeingBucket: ageingBucket(i),
      ChaseCount: i.chases.length,
      DaysSinceLastChase: daysSinceLastChase(i.chases) ?? "",
      DisputeReason: i.disputeReason,
    };
  });
}

export function approvalRows(data: AppData) {
  return data.approvals.map((a) => {
    const c = data.contractors.find((x) => x.id === a.contractorId);
    return {
      ApprovalId: a.id,
      Reference: a.reference,
      ContractorId: a.contractorId,
      ContractorName: c ? fullName(c) : "",
      ApprovalKind: a.kind,
      ApprovalState: a.state,
      Description: a.description,
      Value: a.value ?? "",
      RaisedOn: a.raisedOn,
      RequiredBy: a.requiredBy,
      CurrentApprover: a.currentApprover,
      CurrentApproverRole: a.currentApproverRole,
      WithApproverSince: a.withApproverSince,
      DecidedOn: a.decidedOn,
      IsOpen: isApprovalOpen(a) ? 1 : 0,
      AgeDays: approvalAge(a) ?? "",
      DaysWithApprover: daysWithApprover(a) ?? "",
      ChaseCount: a.chases.length,
      DaysSinceLastChase: daysSinceLastChase(a.chases) ?? "",
    };
  });
}

export function variationRows(data: AppData) {
  return data.variations.map((v) => {
    const c = data.contractors.find((x) => x.id === v.contractorId);
    return {
      VariationId: v.id,
      Reference: v.reference,
      ContractorId: v.contractorId,
      ContractorName: c ? fullName(c) : "",
      VariationType: v.type,
      EffectiveFrom: v.effectiveFrom,
      RecordedOn: v.recordedOn,
      PreviousEndDate: v.previousEndDate,
      NewEndDate: v.newEndDate,
      PreviousRate: v.previousRate ?? "",
      NewRate: v.newRate ?? "",
      PreviousHoursPerWeek: v.previousHoursPerWeek ?? "",
      NewHoursPerWeek: v.newHoursPerWeek ?? "",
      ValueImpact: v.valueImpact ?? "",
      ApprovalId: v.approvalId ?? "",
    };
  });
}

export function chaseRows(data: AppData) {
  const rows: Array<Record<string, unknown>> = [];
  for (const a of data.approvals) {
    for (const ch of a.chases) {
      rows.push({
        ParentType: "approval",
        ParentId: a.id,
        ParentReference: a.reference,
        ChaseDate: ch.date,
        Channel: ch.channel,
        ChasedWho: ch.chasedWho,
        Note: ch.note,
        Outcome: ch.outcome,
      });
    }
  }
  for (const i of data.invoices) {
    for (const ch of i.chases) {
      rows.push({
        ParentType: "invoice",
        ParentId: i.id,
        ParentReference: i.invoiceNumber,
        ChaseDate: ch.date,
        Channel: ch.channel,
        ChasedWho: ch.chasedWho,
        Note: ch.note,
        Outcome: ch.outcome,
      });
    }
  }
  return rows;
}

/** Paid-to-date per contractor, the figure Finance will actually recognise. */
export function spendRows(data: AppData) {
  return data.contractors.map((c) => ({
    ContractorId: c.id,
    ContractorName: fullName(c),
    PoNumber: c.poNumber,
    PoValue: c.poValue ?? "",
    PoSpentToDate: c.poSpentToDate,
    InvoicedExGst: Number(
      data.invoices
        .filter((i) => i.contractorId === c.id && i.status !== "expected")
        .reduce((sum, i) => sum + i.amountExGst, 0)
        .toFixed(2)
    ),
    PaidExGst: Number(paidTotal(data, c.id).toFixed(2)),
  }));
}
