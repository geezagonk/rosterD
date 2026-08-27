# Power BI model and starter DAX

## Model

Import these views, not the base tables:

| Table in the model | Source view | Role |
| --- | --- | --- |
| `Contractor` | `wf.vw_Contractor` | Fact + dimension. One row per contractor with the derived measures already calculated. |
| `Allocation` | `wf.vw_Allocation` | Fact. One row per contractor per project, FTE and cost already split. |
| `Vendor` | `wf.vw_Vendor` | Dimension with vendor-level rollups. |
| `Project` | `wf.Project` | Dimension. |
| `Reminders` | `wf.vw_ReminderQueue` | Fact for the actions page. |
| `Capacity` | `wf.vw_Capacity` | Single-row table of the FTE ceiling position. |
| `Date` | `wf.DimDate` | Marked as the date table. |
| `ContractorDaily` | `wf.vw_ContractorDaily` | Optional. Only import if you want headcount and burn over time. It is a daily grain. |

Relationships:

- `Contractor[VendorId]` → `Vendor[VendorId]`, many to one, single direction
- `Allocation[ContractorId]` → `Contractor[ContractorId]`, many to one
- `Allocation[ProjectId]` → `Project[ProjectId]`, many to one
- `Reminders[ContractorId]` → `Contractor[ContractorId]`, many to one, **inactive** (activate with `USERELATIONSHIP` where needed, otherwise vendor-only reminders vanish)
- `ContractorDaily[Date]` → `Date[Date]`, many to one

Hide `Capacity` from the relationship diagram. It is a one-row table read with `MIN`/`MAX`, not related to anything.

## FTE convention

100 FTE units = 1.0 FTE = one 40 hour week. The department ceiling is 100 FTE, so 10,000 units. Keep everything in units internally and divide by `FteScale` only at display time, so part-time splits do not accumulate rounding error.

## Core measures

```dax
Engaged Headcount =
CALCULATE ( COUNTROWS ( Contractor ), Contractor[IsEngaged] = 1 )

Contractor FTE Units =
CALCULATE ( SUM ( Contractor[FteUnits] ), Contractor[IsEngaged] = 1 )

Contractor FTE =
DIVIDE ( [Contractor FTE Units], 100 )

Weekly Charge Cost =
CALCULATE ( SUM ( Contractor[WeeklyCost] ), Contractor[IsEngaged] = 1 )

Annualised Charge Cost =
CALCULATE ( SUM ( Contractor[AnnualisedCost] ), Contractor[IsEngaged] = 1 )

Committed Remaining Cost =
CALCULATE ( SUM ( Contractor[CommittedRemainingCost] ), Contractor[IsEngaged] = 1 )

Average Effective Rate =
DIVIDE (
    CALCULATE ( SUMX ( Contractor, Contractor[EffectiveHourlyRate] * Contractor[HoursPerWeek] ), Contractor[IsEngaged] = 1 ),
    CALCULATE ( SUM ( Contractor[HoursPerWeek] ), Contractor[IsEngaged] = 1 )
)
```

## Capacity measures

```dax
Department FTE Budget Units = MAX ( Capacity[BudgetUnits] )

Permanent FTE Units = MAX ( Capacity[PermanentUnits] )

Contractor Headroom Units = MAX ( Capacity[ContractorHeadroomUnits] )

Headroom Remaining Units = [Contractor Headroom Units] - [Contractor FTE Units]

Headroom Used % =
DIVIDE ( [Contractor FTE Units], [Contractor Headroom Units] )

Department Utilisation % =
DIVIDE ( [Permanent FTE Units] + [Contractor FTE Units], [Department FTE Budget Units] )

Capacity Status =
SWITCH (
    TRUE (),
    [Department Utilisation %] > 1,    "Over ceiling",
    [Department Utilisation %] > 0.95, "At ceiling",
    [Department Utilisation %] > 0.85, "Tight",
    "Within ceiling"
)
```

## Risk measures

```dax
Ending Within 60 Days =
CALCULATE ( COUNTROWS ( Contractor ), Contractor[FlagEndingSoon] = 1 )

Past Tenure Threshold =
CALCULATE ( COUNTROWS ( Contractor ), Contractor[FlagTenure] = 1 )

PO Burn Warnings =
CALCULATE ( COUNTROWS ( Contractor ), Contractor[FlagPoBurn] = 1 )

Missing Status Test =
CALCULATE ( COUNTROWS ( Contractor ), Contractor[FlagStatusTest] = 1 )

Top Vendor Spend Share =
MAXX ( VALUES ( Vendor[VendorName] ), CALCULATE ( DIVIDE ( [Annualised Charge Cost], CALCULATE ( [Annualised Charge Cost], ALL ( Vendor ) ) ) ) )

Vendor Concentration Flag =
IF ( [Top Vendor Spend Share] > 0.4, "Concentrated", "Spread" )

Open Actions Overdue =
CALCULATE ( COUNTROWS ( Reminders ), Reminders[Severity] = "overdue", Reminders[ReminderStatus] = "open" )
```

## Allocation measures

Use the `Allocation` table when slicing by project or cost centre, and the `Contractor` table when slicing by person, team or vendor. Mixing them double counts.

```dax
Allocated FTE Units = SUM ( Allocation[AllocatedFteUnits] )

Allocated Annualised Cost = SUM ( Allocation[AllocatedAnnualisedCost] )

Unallocated FTE Units =
CALCULATE ( [Allocated FTE Units], Allocation[ProjectId] = "__unallocated" )

Project Budget = SUM ( Project[Budget] )

Project Budget Used % =
DIVIDE ( [Allocated Annualised Cost], [Project Budget] )
```

## Time series (only if `ContractorDaily` is imported)

```dax
Headcount On Date =
CALCULATE ( DISTINCTCOUNT ( ContractorDaily[ContractorId] ) )

FTE Units On Date = SUM ( ContractorDaily[FteUnits] )

Daily Charge Cost = SUM ( ContractorDaily[DailyCost] )

Cost YTD =
TOTALYTD ( [Daily Charge Cost], 'Date'[Date] )

Cost Financial YTD =
TOTALYTD ( [Daily Charge Cost], 'Date'[Date], "30/6" )
```

## A note on refresh

`wf.vw_Contractor` uses `GETDATE()` for the days-to-end, tenure and flag columns, so those values are as at refresh time, not as at the date slicer. If you need point-in-time flags, drive them from `ContractorDaily` and `DimDate` instead, and treat the view's flags as a "right now" operational view only.

---

# Resource Manager reporting

The operational views cover approvals, invoices, variations and the chase history. Import these alongside the workforce views.

| Table in the model | Source view | Role |
| --- | --- | --- |
| `Approvals` | `wf.vw_Approval` | Fact. One row per approval with ageing and stall flags. |
| `Invoices` | `wf.vw_Invoice` | Fact. One row per invoice with ageing buckets and breach flags. |
| `InvoicePosition` | `wf.vw_InvoicePosition` | Single-row summary for card visuals. |
| `Variations` | `wf.vw_Variation` | Fact. Contract change history. |
| `Chases` | `wf.vw_Chase` | Fact. Every follow-up, both parents. |
| `ContractorSpend` | `wf.vw_ContractorSpend` | Committed versus invoiced versus paid, per contractor. |

Relationships: `Approvals[ContractorId]`, `Invoices[ContractorId]`, `Variations[ContractorId]` and `Chases[ContractorId]` all join to `Contractor[ContractorId]`, many to one. Join `Invoices[DueDate]` to `Date[Date]` for payment ageing over time, and make the relationship inactive if you also want `PaidOn` analysis via `USERELATIONSHIP`.

## Approval measures

```dax
Open Approvals =
CALCULATE ( COUNTROWS ( Approvals ), Approvals[IsOpen] = 1 )

Open Approval Value =
CALCULATE ( SUM ( Approvals[ApprovalValue] ), Approvals[IsOpen] = 1 )

Stalled Approvals =
CALCULATE ( COUNTROWS ( Approvals ), Approvals[FlagStalled] = 1 )

Approvals Past Deadline =
CALCULATE ( COUNTROWS ( Approvals ), Approvals[FlagLate] = 1 )

Longest Approval Wait =
CALCULATE ( MAX ( Approvals[DaysWithApprover] ), Approvals[IsOpen] = 1 )

Average Approval Turnaround =
CALCULATE ( AVERAGE ( Approvals[AgeDays] ), Approvals[IsOpen] = 0 )

Never Chased Approvals =
CALCULATE ( COUNTROWS ( Approvals ), Approvals[IsOpen] = 1, Approvals[ChaseCount] = 0 )
```

`Average Approval Turnaround` sliced by `CurrentApproverRole` is the measure that turns "approvals are slow" into "approvals sitting with Finance take 14 days and everywhere else takes 3". That is the argument for a process change, and it is the one thing a spreadsheet will not give you.

## Invoice and payment measures

```dax
Invoice Value = SUM ( Invoices[AmountExGst] )

Awaiting Approval Value =
CALCULATE ( [Invoice Value], Invoices[InvoiceStatus] IN { "received", "with-approver" } )

Awaiting Payment Value =
CALCULATE ( [Invoice Value], Invoices[InvoiceStatus] = "approved" )

Overdue Value =
CALCULATE ( [Invoice Value], Invoices[FlagOverdue] = 1 )

Blocked Value =
CALCULATE ( [Invoice Value], Invoices[FlagBlocked] = 1 )

Missing Invoice Value =
CALCULATE ( [Invoice Value], Invoices[FlagMissing] = 1 )

Paid Value =
CALCULATE ( [Invoice Value], Invoices[InvoiceStatus] = "paid" )

Approval SLA Breaches =
CALCULATE ( COUNTROWS ( Invoices ), Invoices[FlagApprovalBreach] = 1 )

Average Days To Approve =
CALCULATE (
    AVERAGEX ( Invoices, DATEDIFF ( Invoices[SentForApprovalOn], Invoices[ApprovedOn], DAY ) ),
    NOT ISBLANK ( Invoices[ApprovedOn] )
)

Average Days To Pay =
CALCULATE (
    AVERAGEX ( Invoices, DATEDIFF ( Invoices[ApprovedOn], Invoices[PaidOn], DAY ) ),
    NOT ISBLANK ( Invoices[PaidOn] )
)

On Time Payment Rate =
DIVIDE (
    CALCULATE ( COUNTROWS ( Invoices ), Invoices[InvoiceStatus] = "paid", Invoices[PaidOn] <= Invoices[DueDate] ),
    CALCULATE ( COUNTROWS ( Invoices ), Invoices[InvoiceStatus] = "paid" )
)
```

For an ageing visual, put `Invoices[AgeingBucket]` on the axis and `[Invoice Value]` on values. Sort the bucket column by a numeric sort column if you add one; alphabetical ordering puts "1-30" before "current", which reads badly.

## Variation measures

```dax
Variation Count = COUNTROWS ( Variations )

Cumulative Value Impact = SUM ( Variations[ValueImpact] )

Average Rate Increase =
CALCULATE ( AVERAGE ( Variations[RateChangePct] ), Variations[VariationType] = "rate-change" )

Days Added By Extensions =
CALCULATE ( SUM ( Variations[DaysAdded] ), Variations[VariationType] = "extension" )

Original vs Current Contract Value =
[Annualised Charge Cost] - [Cumulative Value Impact]
```

## Chase measures

```dax
Chase Count = COUNTROWS ( Chases )

Chases Per Open Item =
DIVIDE ( [Chase Count], [Open Approvals] + CALCULATE ( COUNTROWS ( Invoices ), Invoices[InvoiceStatus] <> "paid" ) )
```

A high `Chases Per Open Item` is not a sign that the Resource Manager is doing badly. It is evidence of how much manual effort the current process needs, which is exactly the number to take into a business case for improving it.

## Committed, invoiced, paid

```dax
Committed Cost = SUM ( ContractorSpend[CommittedRemainingCost] )
Invoiced To Date = SUM ( ContractorSpend[InvoicedExGst] )
Paid To Date = SUM ( ContractorSpend[PaidExGst] )
Unbilled Gap = [Committed Cost] - [Invoiced To Date]
```

Three figures that a spreadsheet almost never reconciles: what we have committed, what has been billed, and what has actually left the building. Showing them side by side per contractor is usually the fastest way to find the invoice nobody sent.
