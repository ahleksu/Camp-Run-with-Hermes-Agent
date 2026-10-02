---
name: suki-command-center
description: >-
  Use when a Suki Mart admin or CX lead asks how the branches are doing, wants a
  daily or weekly briefing, asks where to focus (late deliveries, unreplied
  bad reviews, open tickets, stockouts, expiring stock, supplier problems), or asks to escalate
  a ticket or draft a review reply.
---

# Suki Command Center

Gives the admin a ranked, evidence-backed view across all 12 branches, then helps
them act. Vocabulary is defined in `GLOSSARY.md`. The sandbox "today" is
**2026-09-30**; tools default to it, so never use the real date.

## Tools (MCP server `suki`, shown as `mcp_suki_<name>`)

Read:
- `branch_scorecard` - always the first call. One row per branch.
- `list_open_tickets`, `list_unreplied_bad_reviews`, `list_stockout_risks`, `list_expiring_stock` - drill-downs, take `branch_code`.
- `list_supplier_slips` - explains stockouts; no branch filter.
- `list_recent_actions` - what has already been escalated or drafted.

Write (confirm first):
- `escalate_ticket(ticket_number, reason)`
- `draft_review_reply(review_id, reply_text)` - saves a draft only; nothing is published.

## Procedure

1. Call `branch_scorecard`. If the admin named a branch or period, pass `days` / `as_of`.
2. Pick up to **3 branches** that need attention. Use the same ranking as the
   Command Center pane, so the chat and the pane name the same branches: rank all
   branches on each of on-time % (lowest is worst), unreplied bad reviews, urgent
   tickets, stockout risks, and absence % (highest is worst). Give 12 points for
   worst, 11 for next, and so on, then sum. Skip on-time % when it is null
   (`has_delivery = 0`).
3. For each picked branch, call only the drill-downs that match why it was picked
   (`limit` 5 is enough). If stockouts are the reason, call `list_supplier_slips` once.
   If many items expire soon, call `list_expiring_stock`.
4. Call `list_recent_actions` before proposing any write, so you do not repeat one.
5. Propose at most **3 actions**, each tied to a row you saw. When proposing a
   write, show the exact ticket number or review text and ask "Go ahead?".
   Call the write tool only after an explicit yes.
6. After a write, report what changed using the tool's result.

## Single-action requests

The pane's buttons send narrow prompts, for example "escalate ticket TKT-01393" or
"draft a reply to review #2538". For these, skip the scorecard:

1. Read the one row the request names (`list_open_tickets` or
   `list_unreplied_bad_reviews` with the branch), and call `list_recent_actions`.
2. Propose the one write with its exact reason or reply text, then ask "Go ahead?".
3. Call the write tool only after an explicit yes, and report the result.

## Output format

The chat column is narrow, so do not use tables wider than two columns.

- One-line headline: the single most important finding, with its number.
- One short paragraph per picked branch, starting with the branch code in bold:
  the issue, the evidence (numbers, ticket or review ids), and the suggested action.
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
