# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2,<2"]  # pinned: v1 API (FastMCP) — what most docs & AI assistants use
# ///
"""
LAYER 1 — MCP SERVER (the hands)

Suki Mart Command Center tools over the sandbox (data/store.db).
All dates are relative to the sandbox "now" unless `as_of` is given.

Run standalone to check it starts (Ctrl+C to stop):
    uv run mcp-server/server.py

Register with Hermes (use the ABSOLUTE path to this file):
    hermes mcp add suki --command uv --args run /ABSOLUTE/PATH/TO/mcp-server/server.py
    # restart Hermes, then:
    hermes mcp test suki

Rules of thumb for good tools:
  * One tool = one business question. Name it like a verb phrase:
      find_stockout_risks, list_overdue_tickets, draft_winback_list ...
  * A generic "run any SQL" tool scores low with the judges. Keep SQL inside
    your tools; expose clear parameters (branch_code, days, limit ...).
  * Return small, structured results (lists of dicts). The agent reasons
    better over 20 clean rows than 2,000 raw ones.
  * Write the docstring for the AI: it's what Hermes reads to decide when to
    call your tool and what to pass.
"""
import os
import sqlite3
from typing import Any

from mcp.server.fastmcp import FastMCP

import suki_core as core  # command-center queries, shared with the desktop plugin (ADR 0001)

# The database path is resolved relative to THIS file, not the working
# directory — Hermes launches MCP servers from its own folder.
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "store.db")

mcp = FastMCP("suki")  # rename to your team's server name


def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Read helper: returns rows as dicts."""
    con = sqlite3.connect(f"file:{os.path.abspath(DB_PATH)}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()


def execute(sql: str, params: tuple = ()) -> int:
    """Write helper: returns affected row count. Use for tools that take action
    (e.g. resolve a ticket, create a purchase order). Reset data anytime with
    `python data/seed.py`."""
    con = sqlite3.connect(os.path.abspath(DB_PATH))
    try:
        cur = con.execute(sql, params)
        con.commit()
        return cur.rowcount
    finally:
        con.close()


# --------------------------------------------------------------------------
# Scaffolding — helps the agent (and you) explore. Keep or remove.
# --------------------------------------------------------------------------
@mcp.tool()
def describe_sandbox() -> dict:
    """Describe the Suki Mart sandbox: business context, the current date
    inside the data ("sandbox_now"), and every table with its columns and
    row count. Call this first when you need to understand the data."""
    info = {r["key"]: r["value"] for r in query("SELECT key, value FROM sandbox_info")}
    tables = {}
    for t in query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
        name = t["name"]
        cols = [f'{c["name"]} {c["type"]}' for c in query(f"PRAGMA table_info({name})")]
        count = query(f"SELECT COUNT(*) AS n FROM {name}")[0]["n"]
        tables[name] = {"rows": count, "columns": cols}
    return {"info": info, "tables": tables}


# --------------------------------------------------------------------------
# Example domain tool — shows the pattern. Replace it with your own.
# --------------------------------------------------------------------------
@mcp.tool()
def list_branches(city: str | None = None) -> list[dict]:
    """List Suki Mart branches with their code, type, city and whether they
    offer delivery. Optionally filter by city (e.g. "Quezon City")."""
    sql = "SELECT code, name, branch_type, city, area, has_delivery FROM branches"
    if city:
        return query(sql + " WHERE city = ? ORDER BY code", (city,))
    return query(sql + " ORDER BY code")


# --------------------------------------------------------------------------
# Command center: reads. One tool = one business question. SQL lives in suki_core.
# --------------------------------------------------------------------------
@mcp.tool()
def branch_scorecard(days: int = 30, as_of: str | None = None) -> dict:
    """Start here for "how are the branches doing". One row per branch: on-time
    delivery %, failed deliveries, open and urgent tickets, unreplied 1-2 star
    reviews, stockout risks, items expiring within 3 days, and absence %.
    Delivery/review/absence figures cover the last `days` days (default 30);
    tickets, stockouts and expiry are current. Also returns loyalty points
    expiring in the next 30 days. `as_of` is YYYY-MM-DD; default is sandbox now."""
    return core.branch_scorecard(days, as_of)


@mcp.tool()
def list_open_tickets(branch_code: str | None = None, limit: int = 10, as_of: str | None = None) -> list[dict]:
    """Open or pending support tickets, most urgent then oldest first. Use after
    the scorecard shows a branch with many open or urgent tickets. Note that
    age_days can be large: the backlog contains tickets months old."""
    return core.list_open_tickets(branch_code, limit, as_of)


@mcp.tool()
def list_unreplied_bad_reviews(branch_code: str | None = None, days: int = 30, limit: int = 10,
                               as_of: str | None = None) -> list[dict]:
    """1-2 star reviews the store has not replied to, worst and newest first,
    with review_id (needed by draft_review_reply) and the review text."""
    return core.list_unreplied_bad_reviews(branch_code, days, limit, as_of)


@mcp.tool()
def list_stockout_risks(branch_code: str | None = None, limit: int = 10) -> list[dict]:
    """Products with 2 days of cover or less and no pending or in-transit
    purchase order, lowest cover first, with the supplier and its promised lead time."""
    return core.list_stockout_risks(branch_code, limit)


@mcp.tool()
def list_expiring_stock(branch_code: str | None = None, limit: int = 10, as_of: str | None = None) -> list[dict]:
    """Stock that expires within 3 days, largest cost at risk first, with days_left
    and cost_at_risk. Use when the scorecard shows a branch with many expiring items,
    to decide what to mark down or move first."""
    return core.list_expiring_stock(branch_code, limit, as_of)


@mcp.tool()
def list_supplier_slips(min_orders: int = 10) -> list[dict]:
    """Suppliers ranked by how much longer deliveries actually take than the
    lead time they promise, plus the share of partial deliveries. Use to explain
    stockouts or to decide which supplier to chase."""
    return core.list_supplier_slips(min_orders)


@mcp.tool()
def list_recent_actions(limit: int = 20) -> list[dict]:
    """Escalations and reply drafts recorded by the write tools, newest first."""
    return core.list_actions(limit)


# --------------------------------------------------------------------------
# Command center: writes (ADR 0002). Confirm with the admin before calling.
# --------------------------------------------------------------------------
@mcp.tool()
def escalate_ticket(ticket_number: str, reason: str) -> dict:
    """WRITE. Raise an open or pending ticket (e.g. "TKT-00257") to urgent
    priority and log the reason. Ask the admin to confirm first."""
    return core.escalate_ticket(ticket_number, reason)


@mcp.tool()
def draft_review_reply(review_id: int, reply_text: str) -> dict:
    """WRITE. Save a proposed reply to an unreplied review as a draft. It is
    never published. Ask the admin to confirm the text first."""
    return core.draft_review_reply(review_id, reply_text)


if __name__ == "__main__":
    mcp.run()
