# Changelog

## 0.2.0

Reframed around the Resource Manager role: coordination, chasing and reporting rather than register-keeping alone.

- Approvals: contracts, variations and PO changes as tracked records with current approver, time-with-approver, required-by date and a chase history. "Who is holding what" rollup per approver.
- Invoices and payments: full lifecycle with separate approval and payment clocks, standard ageing buckets, GST handling, dispute and hold reasons, and detection of expected invoices that never arrived.
- Variations as first-class records with effective dates, previous and new terms, and value impact.
- Chase history on approvals and invoices, with channel, who was chased, what was asked and what they said.
- Reporting pack: printable one-page position, commitments, decisions, approvals, invoice position, supplier concentration, auto-generated issues and a basis of preparation.
- Six new derived reminders covering stalled approvals, approval deadlines, invoice approval breaches, overdue payments, missing invoices and blocked invoices.
- Six new email templates: approval chase, invoice approval chase, payment chase, missing invoice chase, credit note request and a weekly position update.
- Contract history tab on the contractor record pulling variations, approvals and invoices together.
- SQL: `Approval`, `Variation`, `Invoice` and `Chase` tables, six new reporting views, an expanded reminder queue, and DAX for turnaround, ageing, on-time payment and chase effort.
- Demo data reframed for an AUT Strategy and Transformation portfolio, with invented suppliers and people.

## 0.1.0

First cut.

- FTE model on a 100-unit scale against a 40 hour week, with a departmental ceiling and a permanent/contractor split
- Dashboard: capacity against the ceiling, annualised run rate, committed cost to contract end, vendor concentration, spend by team, allocation by project, next actions
- Register with sorting, filtering and inline risk flags (PO burn, tenure, rate variance, missing status test)
- Contractor record across engagement, commercials, governance, allocation, access and lifecycle, and personal tabs
- Project and cost centre allocation with unallocated remainder shown explicitly
- Vendor management including MSA and insurance certificate expiry, margin and payment terms
- Comms log plus ten merge-field HTML email templates with preview, copy, download and mailto
- Derived reminder engine covering notice decisions, contract end, offboarding, PO burn, tenure, work rights, MSA and insurance expiry, and comms follow-ups
- Calendar export of the open reminder queue as `.ics`
- JSON backup and restore, per-table CSV export, T-SQL insert generation
- `db/` schema, reporting views and starter DAX for Power BI
- Docker multi-stage build with Compose bound to loopback
