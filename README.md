## RosterD

Contingent workforce register built around the job of a Resource Manager: keeping accurate oversight of contractors and contract terms, coordinating onboarding, extensions and offboarding, chasing approvals, invoices and payments through a manual process, and producing the regular reporting that makes all of it visible.

It assumes a relatively low-maturity environment. Nothing is a bare status field: every state carries an "as at" date and a chase history, so the app can always answer the only question that matters when a process is manual — how long has this been stuck, and with whom.

Built as a Next.js 15 app with browser-local storage, plus a T-SQL schema and reporting views so the same model can be pointed at Power BI.

The FTE model
This is the bit worth reading before anything else, because everything else derives from it.

1.0 FTE = 100 units = one 40 hour week. A contractor on 20 hours a week is 50 units. Three days is 60 units.
The department ceiling is 100 FTE, which is 10,000 units.
Of that ceiling, a portion is assumed to be permanent establishment (78 FTE by default). The remainder, 22 FTE or 2,200 units, is the contractor headroom. That is what the dashboard measures against.
Cost is calculated from contracted hours, not from timesheets. An hourly contract is rate × hours; a daily contract is rate × (hours ÷ 8), where 8 is standardWeekHours ÷ workingDaysPerWeek. Annualised is weekly × 52.
All of it is configurable in Settings. Change the standard week to 37.5 and every FTE unit, cost and flag in the app recalculates.

What it does
Dashboard. FTE used against the ceiling, annualised run rate, cost already committed to signed end dates, vendor concentration, spend by team, allocation by project, and the next actions due.

Register. Every contingent worker with sortable columns, filters by status, team and vendor, and inline risk flags: PO burn, tenure past threshold, charge rate above benchmark, missing employment status test.

Contractor record. Six tabs covering engagement, commercials, governance, project allocation, access and lifecycle, and personal details. Includes HRIS-style biographical fields, work rights and expiry, emergency contact, PO tracking with burn, extension history, agency margin where the pay rate is known, security clearance, rehire eligibility, system accounts, assets, and onboarding/offboarding checklists.

Projects. FTE and cost split across projects and cost centres by allocation percentage, with budget consumption. Anything unallocated is shown as its own line rather than being quietly absorbed.

Vendors. Agencies and consultancies with account manager details, MSA reference and expiry, professional indemnity and public liability certificate expiry, margin and payment terms, and their share of total contractor spend.

Approvals. Every contract, variation and purchase order change waiting on a decision, ordered by how long it has been sitting with somebody rather than by date raised. Records who it is with, when it landed with them, when the decision is actually needed, and every time you have chased. A "who is holding what" table rolls it up per approver, which is what turns "approvals are slow" into "approvals with Finance take 14 days and everywhere else takes 3".

Invoices and payments. The full lifecycle: expected, received, with an approver, approved, paid, disputed, on hold. Ageing runs from the payment due date; the approval clock runs separately from the day it went out for internal sign-off, because those are two different delays with two different owners. Flags cover invoices past the internal approval service level, payments past their due date, and expected invoices that never arrived — the last of which is the one that silently lands in the wrong accounting period and wrecks an accrual.

Contract history. Extensions, rate changes and hours changes recorded as individual variations with effective dates and value impact, rather than an extension counter. You can see what the engagement cost before the last three extensions, and which variation moved the rate above benchmark.

Reports. A one-page printable pack: position summary, commitment by team and by project, upcoming decisions with the notice dates, approvals outstanding with who is holding them, the invoice and payment position, supplier concentration, an auto-generated issues list, and a basis-of-preparation section so nobody has to guess what the numbers mean. Print or save as PDF straight from the browser.

Comms. An interaction log against contractors and vendors with follow-up dates, plus ten HTML email templates that merge real figures out of the register: extension request, non-extension, PO variation, pre-start chase, work rights evidence, tenure review, MSA renewal, offboarding instruction, rate benchmark challenge and a welcome note. Preview them in the app, copy as HTML, download as a file, or open in your mail client.

Reminders. Most reminders are derived, not stored, so they cannot drift out of step with the register:

Reminder	Fires when
Extend or release	Notice period before the contract end date
Contract end	The end date itself
Offboarding	Two weeks before the end date, plus any incomplete checklist item
PO burn	Invoiced-to-date reaches 80% of PO value
Tenure review	Continuous engagement passes 24 months
Work rights	60 days before entitlement expiry
MSA renewal	90 days before the agreement expires
Insurance	30 days before a PI or PL certificate lapses
Follow-up	Any comms entry with a follow-up date
Approval stalled	An approval sits with the same person past the chase threshold
Approval deadline	The date a decision was needed by
Invoice approval	An invoice sits past the internal approval service level
Payment overdue	An invoice passes its payment due date unpaid
Invoice missing	An expected invoice has not arrived after the period closed
Invoice disputed	Anything disputed or on hold, which blocks everything behind it
Only the done/dismissed state of a derived reminder is stored. Export the open queue as an .ics file and every one lands in Outlook as an all-day event with a seven-day alarm.

Running it
npm install
npm run dev          # http://localhost:3000

Production:

npm run build
npm start

Docker, bound to loopback for a tunnel or reverse proxy:

docker compose up -d --build   # http://127.0.0.1:3111

The app ships with a demo IT department loaded: ten contractors, four vendors, five projects and a rate card. Settings → Reset clears it.

Data and the SQL side
State lives in browser local storage under the key rostered.v1. That is deliberate for v0.1 — no server, no auth, no database to stand up. It also means the data lives in one browser on one machine, so export regularly.

Settings gives you:

JSON backup / restore for the whole store
CSV per table (register, allocations, vendors, projects, comms, reminders), shaped for a Power BI or Excel load
T-SQL insert script matching the schema below
The db/ folder holds the database side:

File	What it is
01_schema.sql	Tables, check constraints, indexes and a date dimension. SQL Server 2019+ / Azure SQL.
02_views.sql	The reporting layer. FTE, cost and flag logic mirrored from the app so both agree.
03_dax_measures.md	Power BI model guidance and starter DAX measures, including approvals, invoices, variations and chase analytics.
The workflow: run 01_schema.sql, then 02_views.sql, then export the T-SQL inserts from Settings and run them. Point Power BI at the wf.vw_* views, not the base tables.

Note that wf.vw_Contractor uses GETDATE() for tenure, days-to-end and the flag columns, so those are "as at refresh", not point-in-time. Use wf.vw_ContractorDaily with the date dimension if you need history.

What it deliberately does not do yet
Being straight about the gaps rather than letting you find them:

No timesheets. Cost is committed cost from contracted hours and rates. Invoice amounts are entered as received, so the app can show committed versus invoiced versus paid, but it cannot validate hours claimed against hours worked. That needs a timesheet source.
No email sending. Templates produce HTML and a mailto link. Nothing is dispatched from the app, and reminders do not email anyone — they surface in the app and export to your calendar.
No auth, no audit trail, no multi-user. One browser, one person. If this goes anywhere near production the store needs to move server-side first.
Approvals are tracked, not routed. The app records where an approval sits and how long it has been there. It does not send it anywhere or enforce a delegation matrix. That is deliberate for a first version in a manual environment: recording reality is more useful than imposing a workflow nobody has agreed to yet.
No integration with the HR system of record. WorkerId is there as a join key for Cornerstone or whatever else holds the master record, but nothing syncs.
A note on the demo data
The app ships with a demonstration data set framed around an AUT Strategy and Transformation portfolio. Every person, supplier, contract reference and figure in it is invented. No real supplier relationship, individual or commercial term is implied. Settings → Reset clears it entirely.

Stack
Next.js 15 (App Router), React 19, TypeScript, plain CSS with custom properties, lucide-react. No CSS framework, no state library, no external calls at runtime.

The visual system is a single token block at the top of app/globals.css — re-skin the whole app by changing those values.
