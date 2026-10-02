#!/usr/bin/env python3
"""Bantay Suki chat commands: read-only text views for Telegram quick_commands.

Usage: bantay.py {brief|tickets|reviews|stockouts|expiring|suppliers|actions}

Runs without a model turn: it reads the same query core as the MCP server and the
Command Center pane (mcp-server/suki_core.py), so the numbers match. Stdlib only.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mcp-server"))
import suki_core as core  # noqa: E402

# (key, label, worst direction) - same five measures and ranking as the pane.
COLUMNS = [
    ("on_time_pct", "on-time", "min"),
    ("unreplied_bad_reviews", "bad reviews", "max"),
    ("urgent_tickets", "urgent", "max"),
    ("stockout_risks", "stockouts", "max"),
    ("absence_pct", "absence", "max"),
]
LIMIT = 8


def short(name: str) -> str:
    return name.removeprefix("Suki Mart").strip()


def brief() -> str:
    data = core.branch_scorecard()
    branches = data["branches"]
    score = {b["code"]: 0 for b in branches}
    for key, _, direction in COLUMNS:
        ordered = sorted((b for b in branches if b[key] is not None),
                         key=lambda b: b[key] if direction == "min" else -b[key])
        for i, b in enumerate(ordered):
            score[b["code"]] += len(ordered) - i
    ranked = sorted(branches, key=lambda b: -score[b["code"]])
    lines = [f"Bantay Suki brief - {data['as_of'][:10]}, last {data['window_days']} days",
             "Branches needing help first:"]
    for n, b in enumerate(ranked[:3], 1):
        ot = "n/a" if b["on_time_pct"] is None else f"{b['on_time_pct']}%"
        lines.append(f"{n}. {short(b['name'])} ({b['code']}): on-time {ot}, "
                     f"{b['unreplied_bad_reviews']} bad reviews, {b['urgent_tickets']} urgent tickets, "
                     f"{b['stockout_risks']} stockouts, {b['absence_pct']}% absence")
    pts = data["loyalty_points_expiring_30d"]
    lines.append(f"Loyalty: {pts['points']:,} points expiring in 30d across {pts['accounts']} accounts")
    lines.append("Drill down: /tickets /reviews /stockouts /expiring /suppliers")
    return "\n".join(lines)


def tickets() -> str:
    rows = core.list_open_tickets(limit=LIMIT)
    out = [f"Open tickets, most urgent first (top {len(rows)})"]
    out += [f"{r['ticket_number']} {r['branch']} [{r['priority']}] {r['subject']} - {r['age_days']}d old"
            for r in rows]
    return "\n".join(out)


def reviews() -> str:
    rows = core.list_unreplied_bad_reviews(limit=LIMIT)
    out = [f"Unreplied 1-2 star reviews (top {len(rows)})"]
    out += [f"#{r['review_id']} {r['branch']} {r['rating']}* {r['topic']}: {r['body'][:90]}" for r in rows]
    return "\n".join(out)


def stockouts() -> str:
    rows = core.list_stockout_risks(limit=LIMIT)
    out = [f"Stockout risks, no open PO (top {len(rows)})"]
    out += [f"{r['branch']} {r['product']}: {r['on_hand']} on hand, {r['days_of_cover']}d cover "
            f"({r['supplier']}, lead {r['promised_lead_time_days']}d)" for r in rows]
    return "\n".join(out)


def expiring() -> str:
    rows = core.list_expiring_stock(limit=LIMIT)
    out = [f"Expiring within 3 days, biggest cost first (top {len(rows)})"]
    out += [f"{r['branch']} {r['product']}: {r['on_hand']} units, {r['days_left']}d left, "
            f"PHP {r['cost_at_risk']:,.0f} at risk" for r in rows]
    return "\n".join(out)


def suppliers() -> str:
    rows = core.list_supplier_slips()[:LIMIT]
    out = [f"Supplier slips: actual vs promised lead time (top {len(rows)})"]
    out += [f"{r['supplier']}: promised {r['promised_days']}d, actual {r['actual_days']}d "
            f"(+{r['slip_days']}d), {r['partial_pct']}% partial, {r['orders']} orders" for r in rows]
    return "\n".join(out)


def actions() -> str:
    rows = core.list_actions(limit=LIMIT)
    if not rows:
        return "No actions recorded yet."
    out = [f"Recorded by Hermes (latest {len(rows)})"]
    out += [f"{r['created_at'][:16]} {r['action']} {r['target']}" for r in rows]
    return "\n".join(out)


COMMANDS = {f.__name__: f for f in (brief, tickets, reviews, stockouts, expiring, suppliers, actions)}

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else ""
    if name not in COMMANDS:
        sys.exit(f"Usage: bantay.py {{{'|'.join(COMMANDS)}}}")
    print(COMMANDS[name]())
