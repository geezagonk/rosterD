/* ===========================================================================
   Rostered - reporting layer
   02_views.sql : the views Power BI should import. Point the model at these,
                  not the base tables, so the FTE and cost maths lives in one
                  place and matches the web app exactly.
   =========================================================================== */

/* --------------------------------------------------------- vw_Contractor -- */
/* One row per contractor, with every derived measure the app shows.          */

CREATE OR ALTER VIEW wf.vw_Contractor
AS
SELECT
    c.ContractorId,
    c.WorkerId,
    LTRIM(RTRIM(COALESCE(NULLIF(c.PreferredName, ''), c.FirstName) + ' ' + c.LastName)) AS FullName,
    c.FirstName,
    c.LastName,
    c.Email,
    c.Location,
    c.Nationality,
    c.WorkRightsType,
    c.WorkRightsExpiry,
    c.EngagementType,
    c.VendorId,
    COALESCE(v.VendorName, 'Direct engagement')      AS VendorName,
    v.VendorType,
    c.Role,
    c.Team,
    c.HiringManager,
    c.EngagementStatus,
    CASE WHEN c.EngagementStatus IN ('onboarding','active','notice') THEN 1 ELSE 0 END AS IsEngaged,
    c.StartDate,
    c.EndDate,
    c.OriginalEndDate,
    c.HoursPerWeek,

    /* FTE on the configured scale: 100 units = 1.0 FTE = one standard week */
    CAST(c.HoursPerWeek / s.StandardWeekHours * s.FteScale AS DECIMAL(18,4)) AS FteUnits,
    CAST(c.HoursPerWeek / s.StandardWeekHours          AS DECIMAL(18,4))     AS Fte,

    c.RateBasis,
    c.ChargeRate,
    c.PayRate,

    /* Effective hourly charge rate whatever basis the contract uses */
    CAST(CASE WHEN c.RateBasis = 'hourly'
              THEN c.ChargeRate
              ELSE c.ChargeRate / NULLIF(s.StandardWeekHours / s.WorkingDaysPerWeek, 0)
         END AS DECIMAL(18,4)) AS EffectiveHourlyRate,

    /* Weekly / monthly / annual charge cost at contracted hours */
    CAST(CASE WHEN c.RateBasis = 'hourly'
              THEN c.ChargeRate * c.HoursPerWeek
              ELSE c.ChargeRate * (c.HoursPerWeek / NULLIF(s.StandardWeekHours / s.WorkingDaysPerWeek, 0))
         END AS DECIMAL(18,2)) AS WeeklyCost,

    CAST(CASE WHEN c.RateBasis = 'hourly'
              THEN c.ChargeRate * c.HoursPerWeek
              ELSE c.ChargeRate * (c.HoursPerWeek / NULLIF(s.StandardWeekHours / s.WorkingDaysPerWeek, 0))
         END * s.WeeksPerYear AS DECIMAL(18,2)) AS AnnualisedCost,

    /* Charge cost still to run between today and the contracted end date */
    CAST(CASE
            WHEN c.EngagementStatus NOT IN ('onboarding','active','notice') THEN 0
            WHEN c.EndDate IS NULL OR c.EndDate < CAST(GETDATE() AS DATE) THEN 0
            ELSE (CASE WHEN c.RateBasis = 'hourly'
                       THEN c.ChargeRate * c.HoursPerWeek
                       ELSE c.ChargeRate * (c.HoursPerWeek / NULLIF(s.StandardWeekHours / s.WorkingDaysPerWeek, 0))
                  END / 7.0) * DATEDIFF(DAY, CAST(GETDATE() AS DATE), c.EndDate)
         END AS DECIMAL(18,2)) AS CommittedRemainingCost,

    c.ContractRef,
    c.PoNumber,
    c.PoValue,
    c.PoSpentToDate,
    CAST(CASE WHEN ISNULL(c.PoValue, 0) = 0 THEN NULL
              ELSE c.PoSpentToDate / c.PoValue END AS DECIMAL(9,4)) AS PoBurnRatio,
    c.ExtensionCount,
    c.NoticePeriodDays,
    DATEADD(DAY, -c.NoticePeriodDays, c.EndDate)                    AS NoticeDecisionDate,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), c.EndDate)               AS DaysToEnd,
    DATEDIFF(MONTH, c.StartDate, CAST(GETDATE() AS DATE))           AS TenureMonths,

    c.StatusTestCompleted,
    c.BackgroundCheckCompleted,
    c.HealthSafetyInducted,
    c.SecurityClearance,
    c.RehireEligible,

    rc.BenchmarkHourly,
    CAST(CASE WHEN rc.BenchmarkHourly IS NULL OR rc.BenchmarkHourly = 0 THEN NULL
              ELSE ((CASE WHEN c.RateBasis = 'hourly'
                          THEN c.ChargeRate
                          ELSE c.ChargeRate / NULLIF(s.StandardWeekHours / s.WorkingDaysPerWeek, 0)
                     END) - rc.BenchmarkHourly) / rc.BenchmarkHourly
         END AS DECIMAL(9,4)) AS RateVariance,

    /* Governance flags, so the report does not have to re-derive them */
    CASE WHEN DATEDIFF(MONTH, c.StartDate, CAST(GETDATE() AS DATE)) >= s.MaxTenureMonths
              AND c.EngagementStatus IN ('onboarding','active','notice')
         THEN 1 ELSE 0 END AS FlagTenure,
    CASE WHEN ISNULL(c.PoValue, 0) > 0 AND c.PoSpentToDate / c.PoValue >= s.PoBurnWarnRatio
         THEN 1 ELSE 0 END AS FlagPoBurn,
    CASE WHEN c.WorkRightsExpiry IS NOT NULL AND c.WorkRightsExpiry < c.EndDate
         THEN 1 ELSE 0 END AS FlagWorkRights,
    CASE WHEN c.StatusTestCompleted = 0 AND c.EngagementStatus IN ('onboarding','active','notice')
         THEN 1 ELSE 0 END AS FlagStatusTest,
    CASE WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), c.EndDate) BETWEEN 0 AND s.EndWarningDays
              AND c.EngagementStatus IN ('onboarding','active','notice')
         THEN 1 ELSE 0 END AS FlagEndingSoon
FROM wf.Contractor c
CROSS JOIN wf.Settings s
LEFT JOIN wf.Vendor v   ON v.VendorId = c.VendorId
LEFT JOIN wf.RateCard rc ON rc.Role = c.Role
WHERE s.SettingsId = 1;
GO

/* --------------------------------------------------------- vw_Allocation -- */
/* Fact-shaped: one row per contractor per project, with the FTE and cost
   already split. Unallocated remainder is emitted as its own row so nothing
   silently disappears from the totals.                                       */

CREATE OR ALTER VIEW wf.vw_Allocation
AS
SELECT
    c.ContractorId,
    c.FullName,
    c.Team,
    c.VendorName,
    a.ProjectId,
    p.ProjectName,
    p.ProjectCode,
    p.CostCentre,
    a.SharePct,
    CAST(c.FteUnits   * a.SharePct / 100.0 AS DECIMAL(18,4)) AS AllocatedFteUnits,
    CAST(c.WeeklyCost * a.SharePct / 100.0 AS DECIMAL(18,2)) AS AllocatedWeeklyCost,
    CAST(c.AnnualisedCost * a.SharePct / 100.0 AS DECIMAL(18,2)) AS AllocatedAnnualisedCost
FROM wf.vw_Contractor c
JOIN wf.Allocation a ON a.ContractorId = c.ContractorId
JOIN wf.Project    p ON p.ProjectId = a.ProjectId

UNION ALL

SELECT
    c.ContractorId,
    c.FullName,
    c.Team,
    c.VendorName,
    '__unallocated'                     AS ProjectId,
    'Unallocated'                       AS ProjectName,
    NULL                                AS ProjectCode,
    NULL                                AS CostCentre,
    100.0 - ISNULL(x.TotalShare, 0)     AS SharePct,
    CAST(c.FteUnits   * (100.0 - ISNULL(x.TotalShare, 0)) / 100.0 AS DECIMAL(18,4)),
    CAST(c.WeeklyCost * (100.0 - ISNULL(x.TotalShare, 0)) / 100.0 AS DECIMAL(18,2)),
    CAST(c.AnnualisedCost * (100.0 - ISNULL(x.TotalShare, 0)) / 100.0 AS DECIMAL(18,2))
FROM wf.vw_Contractor c
OUTER APPLY (
    SELECT SUM(a.SharePct) AS TotalShare
    FROM wf.Allocation a
    WHERE a.ContractorId = c.ContractorId
) x
WHERE ISNULL(x.TotalShare, 0) < 100;
GO

/* ------------------------------------------------------------ vw_Capacity - */
/* One row: the department capacity position in FTE units.                    */

CREATE OR ALTER VIEW wf.vw_Capacity
AS
SELECT
    CAST(s.DepartmentFteBudget * s.FteScale AS DECIMAL(18,2))                  AS BudgetUnits,
    CAST(s.PermanentFte * s.FteScale AS DECIMAL(18,2))                         AS PermanentUnits,
    CAST((s.DepartmentFteBudget - s.PermanentFte) * s.FteScale AS DECIMAL(18,2)) AS ContractorHeadroomUnits,
    CAST(ISNULL(eng.Units, 0) AS DECIMAL(18,2))                                AS EngagedContractorUnits,
    CAST(ISNULL(pipe.Units, 0) AS DECIMAL(18,2))                               AS PipelineContractorUnits,
    CAST((s.DepartmentFteBudget - s.PermanentFte) * s.FteScale - ISNULL(eng.Units, 0) AS DECIMAL(18,2)) AS RemainingHeadroomUnits,
    CAST(CASE WHEN s.DepartmentFteBudget = 0 THEN NULL
              ELSE (s.PermanentFte * s.FteScale + ISNULL(eng.Units, 0))
                   / (s.DepartmentFteBudget * s.FteScale) END AS DECIMAL(9,4)) AS DepartmentUtilisation
FROM wf.Settings s
OUTER APPLY (SELECT SUM(FteUnits) AS Units FROM wf.vw_Contractor WHERE IsEngaged = 1) eng
OUTER APPLY (SELECT SUM(FteUnits) AS Units FROM wf.vw_Contractor WHERE EngagementStatus = 'pipeline') pipe
WHERE s.SettingsId = 1;
GO

/* -------------------------------------------------------------- vw_Vendor - */

CREATE OR ALTER VIEW wf.vw_Vendor
AS
SELECT
    v.VendorId,
    v.VendorName,
    v.VendorType,
    v.AccountManagerName,
    v.AccountManagerEmail,
    v.MsaRef,
    v.MsaExpiry,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), v.MsaExpiry)          AS DaysToMsaExpiry,
    v.PiInsuranceExpiry,
    v.PlInsuranceExpiry,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), v.PiInsuranceExpiry)  AS DaysToPiExpiry,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), v.PlInsuranceExpiry)  AS DaysToPlExpiry,
    v.MarginPct,
    v.PaymentTermsDays,
    v.IsActive,
    ISNULL(x.EngagedHeadcount, 0)   AS EngagedHeadcount,
    ISNULL(x.EngagedUnits, 0)       AS EngagedFteUnits,
    ISNULL(x.AnnualisedCost, 0)     AS AnnualisedCost,
    CAST(CASE WHEN t.TotalSpend = 0 THEN 0
              ELSE ISNULL(x.AnnualisedCost, 0) / t.TotalSpend END AS DECIMAL(9,4)) AS SpendShare
FROM wf.Vendor v
OUTER APPLY (
    SELECT COUNT(*) AS EngagedHeadcount,
           SUM(FteUnits) AS EngagedUnits,
           SUM(AnnualisedCost) AS AnnualisedCost
    FROM wf.vw_Contractor c
    WHERE c.VendorId = v.VendorId AND c.IsEngaged = 1
) x
CROSS JOIN (
    SELECT ISNULL(SUM(AnnualisedCost), 0) AS TotalSpend
    FROM wf.vw_Contractor WHERE IsEngaged = 1
) t;
GO

/* ---------------------------------------------------- vw_ReminderQueue ----- */
/* Derived reminders computed in SQL, mirroring lib/reminders.ts, unioned with
   the hand-entered ones. Use this for an "actions due" page in Power BI.      */

CREATE OR ALTER VIEW wf.vw_ReminderQueue
AS
WITH derived AS (
    SELECT 'notice-decision' AS ReminderType,
           'Extend or release: ' + c.FullName AS Title,
           c.NoticeDecisionDate AS DueDate,
           c.ContractorId, CAST(NULL AS VARCHAR(40)) AS VendorId
    FROM wf.vw_Contractor c
    WHERE c.IsEngaged = 1 AND c.EndDate IS NOT NULL

    UNION ALL
    SELECT 'contract-end', 'Contract end: ' + c.FullName, c.EndDate, c.ContractorId, NULL
    FROM wf.vw_Contractor c
    WHERE c.IsEngaged = 1 AND c.EndDate IS NOT NULL

    UNION ALL
    SELECT 'po-burn', 'PO nearly consumed: ' + c.FullName, CAST(GETDATE() AS DATE), c.ContractorId, NULL
    FROM wf.vw_Contractor c
    WHERE c.FlagPoBurn = 1

    UNION ALL
    SELECT 'tenure-review', 'Tenure review: ' + c.FullName, CAST(GETDATE() AS DATE), c.ContractorId, NULL
    FROM wf.vw_Contractor c
    WHERE c.FlagTenure = 1

    UNION ALL
    SELECT 'work-rights', 'Work rights expiring: ' + c.FullName,
           DATEADD(DAY, -60, c.WorkRightsExpiry), c.ContractorId, NULL
    FROM wf.vw_Contractor c
    WHERE c.IsEngaged = 1 AND c.WorkRightsExpiry IS NOT NULL

    UNION ALL
    SELECT 'msa-expiry', 'MSA renewal: ' + v.VendorName,
           DATEADD(DAY, -90, v.MsaExpiry), NULL, v.VendorId
    FROM wf.Vendor v
    WHERE v.IsActive = 1 AND v.MsaExpiry IS NOT NULL

    UNION ALL
    SELECT 'insurance-expiry', 'Insurance certificate: ' + v.VendorName,
           DATEADD(DAY, -30, x.Expiry), NULL, v.VendorId
    FROM wf.Vendor v
    CROSS APPLY (VALUES (v.PiInsuranceExpiry), (v.PlInsuranceExpiry)) x(Expiry)
    WHERE v.IsActive = 1 AND x.Expiry IS NOT NULL

    UNION ALL
    SELECT 'comms-followup', 'Follow up: ' + ISNULL(m.Subject, ''), m.FollowUpDate, m.ContractorId, m.VendorId
    FROM wf.Comms m
    WHERE m.FollowUpDate IS NOT NULL

    UNION ALL
    SELECT CASE ci.Phase WHEN 'onboarding' THEN 'onboarding' ELSE 'offboarding' END,
           ci.Phase + ': ' + ci.Task, ci.DueDate, ci.ContractorId, NULL
    FROM wf.ChecklistItem ci
    WHERE ci.IsDone = 0 AND ci.DueDate IS NOT NULL
)
SELECT
    d.ReminderType,
    d.Title,
    d.DueDate,
    d.ContractorId,
    d.VendorId,
    'open'    AS ReminderStatus,
    CAST(1 AS BIT) AS IsDerived,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) AS DaysOut,
    CASE
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) < 0  THEN 'overdue'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) <= 7 THEN 'due'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) <= 30 THEN 'soon'
        ELSE 'later'
    END AS Severity
FROM derived d

UNION ALL

SELECT
    r.ReminderType, r.Title, r.DueDate, r.ContractorId, r.VendorId,
    r.ReminderStatus, r.IsDerived,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate),
    CASE
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate) < 0  THEN 'overdue'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate) <= 7 THEN 'due'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate) <= 30 THEN 'soon'
        ELSE 'later'
    END
FROM wf.Reminder r
WHERE r.IsDerived = 0;
GO

/* ------------------------------------------------- vw_ContractorDaily ------ */
/* One row per contractor per active day, for burn-down and headcount-over-time
   visuals. Joins to wf.DimDate on [Date]. Filter it in Power BI - it is a
   deliberately fine grain and will be large if you import ten years.          */

CREATE OR ALTER VIEW wf.vw_ContractorDaily
AS
SELECT
    d.[Date],
    c.ContractorId,
    c.FullName,
    c.Team,
    c.VendorName,
    c.EngagementStatus,
    CAST(c.FteUnits AS DECIMAL(18,4))            AS FteUnits,
    CAST(c.WeeklyCost / 7.0 AS DECIMAL(18,4))    AS DailyCost
FROM wf.DimDate d
JOIN wf.vw_Contractor c
  ON d.[Date] >= c.StartDate
 AND d.[Date] <= ISNULL(c.EndDate, d.[Date])
WHERE c.EngagementStatus <> 'pipeline';
GO

/* ===========================================================================
   Resource Manager reporting views
   =========================================================================== */

/* ------------------------------------------------------------ vw_Approval - */

CREATE OR ALTER VIEW wf.vw_Approval
AS
SELECT
    a.ApprovalId,
    a.Reference,
    a.ContractorId,
    c.FullName          AS ContractorName,
    c.Team,
    c.VendorName,
    a.ApprovalKind,
    a.ApprovalState,
    a.ApprovalDescription,
    a.ApprovalValue,
    a.RaisedOn,
    a.RequiredBy,
    a.CurrentApprover,
    a.CurrentApproverRole,
    a.WithApproverSince,
    a.DecidedOn,
    CASE WHEN a.ApprovalState IN ('draft','submitted','with-approver') THEN 1 ELSE 0 END AS IsOpen,
    DATEDIFF(DAY, a.RaisedOn, ISNULL(a.DecidedOn, CAST(GETDATE() AS DATE)))              AS AgeDays,
    CASE WHEN a.ApprovalState IN ('draft','submitted','with-approver')
         THEN DATEDIFF(DAY, ISNULL(a.WithApproverSince, a.RaisedOn), CAST(GETDATE() AS DATE))
    END AS DaysWithApprover,
    CASE WHEN a.ApprovalState IN ('draft','submitted','with-approver')
         THEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), a.RequiredBy)
    END AS DaysToDeadline,
    CASE WHEN a.ApprovalState IN ('draft','submitted','with-approver')
              AND DATEDIFF(DAY, ISNULL(a.WithApproverSince, a.RaisedOn), CAST(GETDATE() AS DATE)) >= s.ApprovalChaseAfterDays
         THEN 1 ELSE 0 END AS FlagStalled,
    CASE WHEN a.ApprovalState IN ('draft','submitted','with-approver')
              AND a.RequiredBy IS NOT NULL
              AND a.RequiredBy < CAST(GETDATE() AS DATE)
         THEN 1 ELSE 0 END AS FlagLate,
    ISNULL(ch.ChaseCount, 0) AS ChaseCount,
    DATEDIFF(DAY, ch.LastChase, CAST(GETDATE() AS DATE)) AS DaysSinceLastChase
FROM wf.Approval a
CROSS JOIN wf.Settings s
LEFT JOIN wf.vw_Contractor c ON c.ContractorId = a.ContractorId
OUTER APPLY (
    SELECT COUNT(*) AS ChaseCount, MAX(ChaseDate) AS LastChase
    FROM wf.Chase x WHERE x.ParentType = 'approval' AND x.ParentId = a.ApprovalId
) ch
WHERE s.SettingsId = 1;
GO

/* ------------------------------------------------------------- vw_Invoice - */

CREATE OR ALTER VIEW wf.vw_Invoice
AS
SELECT
    i.InvoiceId,
    i.InvoiceNumber,
    i.ContractorId,
    c.FullName            AS ContractorName,
    c.Team,
    i.VendorId,
    ISNULL(v.VendorName, 'Direct') AS VendorName,
    i.PoNumber,
    i.PeriodStart,
    i.PeriodEnd,
    i.HoursClaimed,
    i.AmountExGst,
    CAST(i.AmountExGst * s.GstRate AS DECIMAL(18,2))       AS Gst,
    CAST(i.AmountExGst * (1 + s.GstRate) AS DECIMAL(18,2)) AS AmountIncGst,
    i.InvoiceStatus,
    i.Approver,
    i.ReceivedOn,
    i.SentForApprovalOn,
    i.ApprovedOn,
    i.DueDate,
    i.PaidOn,
    i.DisputeReason,

    CASE WHEN i.InvoiceStatus IN ('received','with-approver')
         THEN DATEDIFF(DAY, ISNULL(i.SentForApprovalOn, i.ReceivedOn), CAST(GETDATE() AS DATE))
    END AS DaysAwaitingApproval,

    CASE WHEN i.InvoiceStatus NOT IN ('paid','expected')
         THEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), i.DueDate)
    END AS DaysToPaymentDue,

    /* Ageing measured from the payment due date, matching the app. */
    CASE
        WHEN i.InvoiceStatus IN ('paid','expected') THEN 'current'
        WHEN i.DueDate IS NULL THEN 'current'
        WHEN i.DueDate >= CAST(GETDATE() AS DATE) THEN 'current'
        WHEN DATEDIFF(DAY, i.DueDate, CAST(GETDATE() AS DATE)) <= 30 THEN '1-30'
        WHEN DATEDIFF(DAY, i.DueDate, CAST(GETDATE() AS DATE)) <= 60 THEN '31-60'
        WHEN DATEDIFF(DAY, i.DueDate, CAST(GETDATE() AS DATE)) <= 90 THEN '61-90'
        ELSE '90+'
    END AS AgeingBucket,

    CASE WHEN i.InvoiceStatus NOT IN ('paid','expected')
              AND i.DueDate IS NOT NULL
              AND i.DueDate < CAST(GETDATE() AS DATE)
         THEN 1 ELSE 0 END AS FlagOverdue,
    CASE WHEN i.InvoiceStatus IN ('received','with-approver')
              AND DATEDIFF(DAY, ISNULL(i.SentForApprovalOn, i.ReceivedOn), CAST(GETDATE() AS DATE)) >= s.InvoiceApprovalSlaDays
         THEN 1 ELSE 0 END AS FlagApprovalBreach,
    CASE WHEN i.InvoiceStatus = 'expected'
              AND i.PeriodEnd IS NOT NULL
              AND DATEDIFF(DAY, i.PeriodEnd, CAST(GETDATE() AS DATE)) >= s.InvoiceExpectedAfterDays
         THEN 1 ELSE 0 END AS FlagMissing,
    CASE WHEN i.InvoiceStatus IN ('disputed','on-hold') THEN 1 ELSE 0 END AS FlagBlocked,

    ISNULL(ch.ChaseCount, 0) AS ChaseCount,
    DATEDIFF(DAY, ch.LastChase, CAST(GETDATE() AS DATE)) AS DaysSinceLastChase
FROM wf.Invoice i
CROSS JOIN wf.Settings s
LEFT JOIN wf.vw_Contractor c ON c.ContractorId = i.ContractorId
LEFT JOIN wf.Vendor v        ON v.VendorId = i.VendorId
OUTER APPLY (
    SELECT COUNT(*) AS ChaseCount, MAX(ChaseDate) AS LastChase
    FROM wf.Chase x WHERE x.ParentType = 'invoice' AND x.ParentId = i.InvoiceId
) ch
WHERE s.SettingsId = 1;
GO

/* ----------------------------------------------------- vw_InvoicePosition - */
/* Single row summarising the money position, for card visuals.               */

CREATE OR ALTER VIEW wf.vw_InvoicePosition
AS
SELECT
    SUM(CASE WHEN InvoiceStatus IN ('received','with-approver') THEN AmountExGst ELSE 0 END) AS AwaitingApprovalValue,
    SUM(CASE WHEN InvoiceStatus IN ('received','with-approver') THEN 1 ELSE 0 END)           AS AwaitingApprovalCount,
    SUM(CASE WHEN InvoiceStatus = 'approved' THEN AmountExGst ELSE 0 END)                    AS AwaitingPaymentValue,
    SUM(CASE WHEN InvoiceStatus = 'approved' THEN 1 ELSE 0 END)                              AS AwaitingPaymentCount,
    SUM(CASE WHEN FlagOverdue = 1 THEN AmountExGst ELSE 0 END)                               AS OverdueValue,
    SUM(CAST(FlagOverdue AS INT))                                                            AS OverdueCount,
    SUM(CASE WHEN FlagBlocked = 1 THEN AmountExGst ELSE 0 END)                               AS BlockedValue,
    SUM(CAST(FlagBlocked AS INT))                                                            AS BlockedCount,
    SUM(CASE WHEN FlagMissing = 1 THEN AmountExGst ELSE 0 END)                               AS MissingValue,
    SUM(CAST(FlagMissing AS INT))                                                            AS MissingCount,
    SUM(CAST(FlagApprovalBreach AS INT))                                                     AS ApprovalSlaBreachCount
FROM wf.vw_Invoice;
GO

/* ----------------------------------------------------------- vw_Variation - */

CREATE OR ALTER VIEW wf.vw_Variation
AS
SELECT
    v.VariationId,
    v.Reference,
    v.ContractorId,
    c.FullName AS ContractorName,
    c.Team,
    c.VendorName,
    v.VariationType,
    v.EffectiveFrom,
    v.RecordedOn,
    v.PreviousEndDate,
    v.NewEndDate,
    DATEDIFF(DAY, v.PreviousEndDate, v.NewEndDate) AS DaysAdded,
    v.PreviousRate,
    v.NewRate,
    CASE WHEN ISNULL(v.PreviousRate, 0) = 0 THEN NULL
         ELSE CAST((v.NewRate - v.PreviousRate) / v.PreviousRate AS DECIMAL(9,4)) END AS RateChangePct,
    v.PreviousHoursPerWeek,
    v.NewHoursPerWeek,
    v.ValueImpact,
    v.ApprovalId
FROM wf.Variation v
LEFT JOIN wf.vw_Contractor c ON c.ContractorId = v.ContractorId;
GO

/* --------------------------------------------------------------- vw_Chase - */

CREATE OR ALTER VIEW wf.vw_Chase
AS
SELECT
    ch.ChaseId,
    ch.ParentType,
    ch.ParentId,
    ch.ChaseDate,
    ch.Channel,
    ch.ChasedWho,
    ch.Note,
    ch.Outcome,
    COALESCE(a.Reference, i.InvoiceNumber)   AS ParentReference,
    COALESCE(a.ContractorId, i.ContractorId) AS ContractorId
FROM wf.Chase ch
LEFT JOIN wf.Approval a ON ch.ParentType = 'approval' AND a.ApprovalId = ch.ParentId
LEFT JOIN wf.Invoice  i ON ch.ParentType = 'invoice'  AND i.InvoiceId  = ch.ParentId;
GO

/* --------------------------------------------------- vw_ContractorSpend ---- */
/* Committed versus invoiced versus actually paid, per contractor. The three
   figures diverging is the single most common question a Resource Manager gets
   asked and the hardest one to answer from a spreadsheet.                     */

CREATE OR ALTER VIEW wf.vw_ContractorSpend
AS
SELECT
    c.ContractorId,
    c.FullName,
    c.Team,
    c.VendorName,
    c.PoNumber,
    c.PoValue,
    c.PoSpentToDate,
    c.AnnualisedCost,
    c.CommittedRemainingCost,
    ISNULL(x.InvoicedExGst, 0) AS InvoicedExGst,
    ISNULL(x.PaidExGst, 0)     AS PaidExGst,
    ISNULL(x.OpenExGst, 0)     AS OpenExGst,
    CASE WHEN ISNULL(c.PoValue, 0) = 0 THEN NULL
         ELSE CAST(ISNULL(x.InvoicedExGst, 0) / c.PoValue AS DECIMAL(9,4)) END AS PoConsumedByInvoices
FROM wf.vw_Contractor c
OUTER APPLY (
    SELECT
        SUM(CASE WHEN i.InvoiceStatus <> 'expected' THEN i.AmountExGst ELSE 0 END) AS InvoicedExGst,
        SUM(CASE WHEN i.InvoiceStatus = 'paid' THEN i.AmountExGst ELSE 0 END)      AS PaidExGst,
        SUM(CASE WHEN i.InvoiceStatus NOT IN ('paid','expected') THEN i.AmountExGst ELSE 0 END) AS OpenExGst
    FROM wf.Invoice i WHERE i.ContractorId = c.ContractorId
) x;
GO

/* ------------------------------------------------ vw_ReminderQueue (final) -
   Redefined here, after the operational views exist, so the action queue also
   covers approvals and invoices. This is the definitive version: the earlier
   definition above is superseded when the script runs top to bottom.
   --------------------------------------------------------------------------- */

CREATE OR ALTER VIEW wf.vw_ReminderQueue
AS
WITH derived AS (
    SELECT 'notice-decision' AS ReminderType,
           'Extend or release: ' + c.FullName AS Title,
           c.NoticeDecisionDate AS DueDate,
           c.ContractorId, CAST(NULL AS VARCHAR(40)) AS VendorId
    FROM wf.vw_Contractor c
    WHERE c.IsEngaged = 1 AND c.EndDate IS NOT NULL

    UNION ALL
    SELECT 'contract-end', 'Contract end: ' + c.FullName, c.EndDate, c.ContractorId, NULL
    FROM wf.vw_Contractor c WHERE c.IsEngaged = 1 AND c.EndDate IS NOT NULL

    UNION ALL
    SELECT 'po-burn', 'PO nearly consumed: ' + c.FullName, CAST(GETDATE() AS DATE), c.ContractorId, NULL
    FROM wf.vw_Contractor c WHERE c.FlagPoBurn = 1

    UNION ALL
    SELECT 'tenure-review', 'Tenure review: ' + c.FullName, CAST(GETDATE() AS DATE), c.ContractorId, NULL
    FROM wf.vw_Contractor c WHERE c.FlagTenure = 1

    UNION ALL
    SELECT 'work-rights', 'Work rights expiring: ' + c.FullName,
           DATEADD(DAY, -60, c.WorkRightsExpiry), c.ContractorId, NULL
    FROM wf.vw_Contractor c
    WHERE c.IsEngaged = 1 AND c.WorkRightsExpiry IS NOT NULL

    UNION ALL
    SELECT 'msa-expiry', 'MSA renewal: ' + v.VendorName, DATEADD(DAY, -90, v.MsaExpiry), NULL, v.VendorId
    FROM wf.Vendor v WHERE v.IsActive = 1 AND v.MsaExpiry IS NOT NULL

    UNION ALL
    SELECT 'insurance-expiry', 'Insurance certificate: ' + v.VendorName,
           DATEADD(DAY, -30, x.Expiry), NULL, v.VendorId
    FROM wf.Vendor v
    CROSS APPLY (VALUES (v.PiInsuranceExpiry), (v.PlInsuranceExpiry)) x(Expiry)
    WHERE v.IsActive = 1 AND x.Expiry IS NOT NULL

    UNION ALL
    SELECT 'comms-followup', 'Follow up: ' + ISNULL(m.Subject, ''), m.FollowUpDate, m.ContractorId, m.VendorId
    FROM wf.Comms m WHERE m.FollowUpDate IS NOT NULL

    UNION ALL
    SELECT CASE ci.Phase WHEN 'onboarding' THEN 'onboarding' ELSE 'offboarding' END,
           ci.Phase + ': ' + ci.Task, ci.DueDate, ci.ContractorId, NULL
    FROM wf.ChecklistItem ci WHERE ci.IsDone = 0 AND ci.DueDate IS NOT NULL

    /* --- operational --- */
    UNION ALL
    SELECT 'approval-stalled',
           'Chase approval: ' + ISNULL(a.Reference, '') + ' with ' + ISNULL(a.CurrentApprover, 'nobody'),
           CAST(GETDATE() AS DATE), a.ContractorId, NULL
    FROM wf.vw_Approval a WHERE a.FlagStalled = 1

    UNION ALL
    SELECT 'approval-deadline', 'Approval needed by this date: ' + ISNULL(a.ContractorName, ''),
           a.RequiredBy, a.ContractorId, NULL
    FROM wf.vw_Approval a WHERE a.IsOpen = 1 AND a.RequiredBy IS NOT NULL

    UNION ALL
    SELECT 'invoice-approval', 'Chase invoice approval: ' + ISNULL(i.InvoiceNumber, '(no number)'),
           CAST(GETDATE() AS DATE), i.ContractorId, i.VendorId
    FROM wf.vw_Invoice i WHERE i.FlagApprovalBreach = 1

    UNION ALL
    SELECT 'invoice-overdue', 'Payment overdue: ' + ISNULL(i.InvoiceNumber, '(no number)'),
           i.DueDate, i.ContractorId, i.VendorId
    FROM wf.vw_Invoice i WHERE i.FlagOverdue = 1

    UNION ALL
    SELECT 'invoice-missing', 'Invoice not received: ' + ISNULL(i.ContractorName, ''),
           CAST(GETDATE() AS DATE), i.ContractorId, i.VendorId
    FROM wf.vw_Invoice i WHERE i.FlagMissing = 1

    UNION ALL
    SELECT 'invoice-disputed', 'Blocked: ' + ISNULL(i.InvoiceNumber, '(no number)'),
           CAST(GETDATE() AS DATE), i.ContractorId, i.VendorId
    FROM wf.vw_Invoice i WHERE i.FlagBlocked = 1
)
SELECT
    d.ReminderType, d.Title, d.DueDate, d.ContractorId, d.VendorId,
    'open' AS ReminderStatus, CAST(1 AS BIT) AS IsDerived,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) AS DaysOut,
    CASE
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) < 0   THEN 'overdue'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) <= 7  THEN 'due'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.DueDate) <= 30 THEN 'soon'
        ELSE 'later'
    END AS Severity
FROM derived d

UNION ALL

SELECT
    r.ReminderType, r.Title, r.DueDate, r.ContractorId, r.VendorId,
    r.ReminderStatus, r.IsDerived,
    DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate),
    CASE
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate) < 0   THEN 'overdue'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate) <= 7  THEN 'due'
        WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.DueDate) <= 30 THEN 'soon'
        ELSE 'later'
    END
FROM wf.Reminder r
WHERE r.IsDerived = 0;
GO
