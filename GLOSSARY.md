# Suki Mart Command Center

An admin-facing view over the Suki Mart sandbox that shows where the 12 branches need attention across delivery, customer experience, supply and staffing, and lets the admin act on it.

## Language

**Sandbox now**:
The fixed "today" inside the data (2026-09-30 21:00). Every relative period is measured from it, or from an explicit as-of date.
_Avoid_: today, current date, now()

**Admin**:
The CX lead or operations head who looks across all branches and decides where to send help first.
_Avoid_: user, manager (a branch manager is a different role)

**Command center**:
The single view of all branches with one scorecard row each, plus drill-downs into what is behind a number.
_Avoid_: dashboard, report

**Branch scorecard**:
One row per branch with the same handful of health measures over the same window.
_Avoid_: leaderboard, KPI table

**On-time rate**:
Share of delivered deliveries that arrived at or before their promised time.
_Avoid_: SLA, punctuality

**Unreplied bad review**:
A review rated 1 or 2 stars that the store has not replied to.
_Avoid_: negative review, complaint

**Open ticket**:
A support ticket whose status is open or pending.
_Avoid_: active ticket, unresolved ticket

**Stockout risk**:
A branch-product pair with two days of cover or less and no purchase order pending or in transit.
_Avoid_: low stock, shortage

**Days of cover**:
On-hand units divided by average daily sales.
_Avoid_: runway, stock days

**Expiring soon**:
Perishable stock on hand whose nearest expiry date is within three days of the as-of date.
_Avoid_: near expiry, aging stock

**Absence rate**:
Share of past shifts that ended as a no-show or a sick call.
_Avoid_: attrition, no-show rate

**Supplier slip**:
The gap between a supplier's promised lead time and the lead time actually experienced.
_Avoid_: supplier delay, lateness

## Actions

**Escalation**:
Raising an open ticket to urgent priority with a recorded reason.
_Avoid_: bump, flag

**Reply draft**:
Proposed text for a review reply that is saved for a human to publish and is never published by the system.
_Avoid_: reply, response
