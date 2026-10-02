# Demo script and rubric map

Total time: 5 minutes. Run `python data/seed.py` first, so the escalation you show is the first one in the log. Restart Hermes and reload desktop plugins before you start.

## The 5 minutes

1. Problem (45 seconds). Say: "We are Bantay Suki: Justine, Alex, JP and Gab. An admin who runs 12 branches cannot see which one needs help first. The answer sits in five places: deliveries, tickets, reviews, stock, and shifts."
2. The pane (60 seconds). Open Command Center. Point at the headline sentence, then the red values. Click a branch to open its tickets, reviews, stockouts, and expiring stock. Say that this view needs no model turn, because the pane reads the same query core as the agent.
3. The agent (90 seconds). Click "Brief me". Hermes loads the skill, calls `branch_scorecard`, drills into up to 3 branches, and proposes at most 3 actions with evidence.
4. The action (60 seconds). Approve one escalation. Open the pane: "Recorded by Hermes" now shows it, and the branch's urgent count went up by one.
5. Close (45 seconds). Say: "Hermes can only do two writes: escalate a ticket, or save a reply draft. Both are logged. Nothing is ever published."

## Rubric map

| Criterion | Points | Where to show it |
|---|---:|---|
| MCP Server | 20 | 11 domain tools. No generic SQL tool. Docstrings tell the agent when to call each. Two writes only, both logged (ADR 0002). Tests run on a temporary copy of the database. |
| Skill | 20 | `SKILL.md` has a fixed procedure: scorecard, at most 3 branches, drill-downs, check recent actions, at most 3 confirmed actions. It also lists pitfalls (aging backlog, windowed numbers). |
| Desktop Plugin | 20 | Native components and theme variables, so it follows the Hermes theme in light and dark. Sortable table, inline drill-down, keyboard focus, loading and error states. |
| Integration | 10 | Pane button, then skill, then MCP write, then the pane refreshes by itself when the chat turn ends. |
| Relevance | 15 | Built on planted problems in the data: unreplied bad reviews, stockouts with no purchase order, a supplier that runs 6.3 days late, an aging ticket backlog. |
| Uniqueness | 10 | One query core behind two doors (ADR 0001). The ranking is the sum of ranks across five measures, and the pane states how it is computed. |
| Demo and Pitch | 5 | Follow the five steps above. Rehearse once with a timer. |

## Facts you can quote

These come from the sandbox at 2026-09-30, and `python data/seed.py` reproduces them.

- 264 open tickets, 23 of them urgent.
- 76 unreplied 1 or 2 star reviews in the last 30 days.
- 67 stockout risks with no purchase order pending or in transit.
- Visayas Canning Corp. promises 5 days and delivers in 11.3.
