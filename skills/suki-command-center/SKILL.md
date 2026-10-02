---
name: suki-command-center
description: >-
  Use when a Suki Mart admin or CX lead asks how the branches are doing, wants a
  daily or weekly briefing, asks where to focus (late deliveries, unreplied
  bad reviews, open tickets, stockouts, supplier problems), or asks to escalate
  a ticket or draft a review reply.
---

# Suki Command Center

Gives the admin a ranked, evidence-backed view across all 12 branches, then helps
them act. Vocabulary is defined in `GLOSSARY.md`. The sandbox "today" is
**2026-09-30**; tools default to it, so never use the real date.

## Tools (MCP server `suki`, shown as `mcp_suki_<name>`)

Read:
- `branch_scorecard` - always the first call. One row per branch.
- `list_open_tickets`, `list_unreplied_bad_reviews`, `list_stockout_risks` - drill-downs, take `branch_code`.
- `list_supplier_slips` - explains stockouts; no branch filter.
- `list_recent_actions` - what has already been escalated or drafted.

Write (confirm first):
- `escalate_ticket(ticket_number, reason)`
- `draft_review_reply(review_id, reply_text)` - saves a draft only; nothing is published.

## Procedure

1. Call `branch_scorecard`. If the admin named a branch or period, pass `days` / `as_of`.
2. Pick up to **3 branches** that need attention. Rank by the worst of: lowest
   on-time %, most unreplied bad reviews, most urgent tickets, most stockout risks,
   highest absence %. Ignore on-time % for branches with `has_delivery = 0` (it is null).
3. For each picked branch, call only the drill-downs that match why it was picked
   (`limit` 5 is enough). If stockouts are the reason, call `list_supplier_slips` once.
4. Call `list_recent_actions` before proposing any write, so you do not repeat one.
5. Propose at most **3 actions**, each tied to a row you saw. When proposing a
   write, show the exact ticket number or review text and ask "Go ahead?".
   Call the write tool only after an explicit yes.
6. After a write, report what changed using the tool's result.

## Output format

- One-line headline: the single most important finding, with its number.
- A short table: `branch | issue | evidence | suggested action`.
- Then the numbered proposed actions. Keep it under 250 words unless asked for more.

## Pitfalls

- Open tickets include very old ones (months). Say "aging backlog" rather than
  treating them as new; prefer urgent and recent first.
- Delivery, review and absence figures are windowed (default 30 days); tickets,
  stockouts and expiry are a current snapshot. State the window when quoting a number.
- A branch with a pending or in-transit purchase order is already excluded from
  stockout risks; do not suggest reordering those.
- Never write reply drafts for reviews you have not read, and never claim a reply
  was "sent" or "published". Drafts are for a human to publish.
- Do not invent causes. If the data does not show why, say so.
