"""Suki Mart command-center queries (stdlib only).

Shared by the MCP server (agent tools) and the desktop plugin backend (pane).
All relative dates are measured from `as_of`, which defaults to the sandbox's
own "now" (sandbox_info.sandbox_now) - never the real clock.
"""
import os
import sqlite3
from typing import Any

DB_PATH = os.path.abspath(
    os.environ.get("SUKI_DB")
    or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "store.db")
)

# Definitions (see GLOSSARY.md)
STOCKOUT_COVER_DAYS = 2
EXPIRY_WINDOW_DAYS = 3
BAD_REVIEW_MAX_RATING = 2
OPEN_PO_STATUSES = ("pending", "in_transit")
PRIORITY_RANK = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"


def query(sql: str, params: dict | tuple = ()) -> list[dict[str, Any]]:
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()


def _write(statements: list[tuple[str, tuple]]) -> None:
    """Run several statements in one transaction; creates the audit table if needed."""
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(
            "CREATE TABLE IF NOT EXISTS ops_actions ("
            "id INTEGER PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, "
            "detail TEXT NOT NULL, created_at TEXT NOT NULL)"
        )
        for sql, params in statements:
            con.execute(sql, params)
        con.commit()
    finally:
        con.close()


def sandbox_now() -> str:
    return query("SELECT value FROM sandbox_info WHERE key='sandbox_now'")[0]["value"]


def _as_of(as_of: str | None) -> str:
    """Normalize to 'YYYY-MM-DD HH:MM:SS'; a bare date means end of that day."""
    if not as_of:
        return sandbox_now()
    if len(as_of) == 10:
        as_of += " 23:59:59"
    row = query("SELECT datetime(:v) AS v", {"v": as_of})[0]["v"]
    if row is None:
        raise ValueError(f"Invalid as_of '{as_of}'; use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS")
    return row


def _branch_filter(branch_code: str | None, alias: str = "b") -> tuple[str, dict]:
    if not branch_code:
        return "", {}
    return f" AND {alias}.code = :branch", {"branch": branch_code.upper()}


# --------------------------------------------------------------------------
# Reads
# --------------------------------------------------------------------------
def branch_scorecard(days: int = 30, as_of: str | None = None) -> dict:
    now = _as_of(as_of)
    p = {"now": now, "days": f"-{int(days)} day", "cover": STOCKOUT_COVER_DAYS,
         "exp": f"+{EXPIRY_WINDOW_DAYS} day", "bad": BAD_REVIEW_MAX_RATING}
    rows = query(
        """
        SELECT b.code, b.name, b.branch_type, b.has_delivery,
          (SELECT ROUND(100.0 * SUM(d.delivered_at <= d.promised_by) / NULLIF(SUM(d.delivered_at IS NOT NULL), 0), 1)
             FROM deliveries d WHERE d.branch_id = b.id
              AND d.promised_by BETWEEN datetime(:now, :days) AND :now) AS on_time_pct,
          (SELECT COUNT(*) FROM deliveries d WHERE d.branch_id = b.id AND d.status = 'failed'
              AND d.promised_by BETWEEN datetime(:now, :days) AND :now) AS failed_deliveries,
          (SELECT COUNT(*) FROM support_tickets t WHERE t.branch_id = b.id
              AND t.status IN ('open','pending') AND t.created_at <= :now) AS open_tickets,
          (SELECT COUNT(*) FROM support_tickets t WHERE t.branch_id = b.id
              AND t.status IN ('open','pending') AND t.priority = 'urgent' AND t.created_at <= :now) AS urgent_tickets,
          (SELECT COUNT(*) FROM reviews r WHERE r.branch_id = b.id AND r.rating <= :bad
              AND r.replied_at IS NULL AND r.created_at BETWEEN datetime(:now, :days) AND :now) AS unreplied_bad_reviews,
          (SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id
             WHERE i.branch_id = b.id AND p.is_active = 1 AND i.avg_daily_sales > 0
               AND i.on_hand <= :cover * i.avg_daily_sales
               AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.branch_id = i.branch_id
                   AND po.product_id = i.product_id AND po.status IN ('pending','in_transit'))) AS stockout_risks,
          (SELECT COUNT(*) FROM inventory i WHERE i.branch_id = b.id AND i.on_hand > 0
              AND i.nearest_expiry_date IS NOT NULL
              AND i.nearest_expiry_date <= date(:now, :exp)) AS expiring_soon,
          (SELECT ROUND(100.0 * SUM(s.status IN ('no_show','called_in_sick')) / NULLIF(COUNT(*), 0), 1)
             FROM shifts s WHERE s.branch_id = b.id
              AND s.shift_date BETWEEN date(:now, :days) AND date(:now) AND s.status != 'scheduled') AS absence_pct
        FROM branches b ORDER BY b.code
        """,
        p,
    )
    points = query(
        "SELECT COUNT(*) AS accounts, COALESCE(SUM(points_expiring), 0) AS points FROM loyalty_accounts "
        "WHERE points_expiring > 0 AND points_expiry_date BETWEEN date(:now) AND date(:now, '+30 day')",
        {"now": now},
    )[0]
    return {"as_of": now, "window_days": int(days), "branches": rows, "loyalty_points_expiring_30d": points}


def list_open_tickets(branch_code: str | None = None, limit: int = 10, as_of: str | None = None) -> list[dict]:
    now = _as_of(as_of)
    bf, bp = _branch_filter(branch_code)
    return query(
        f"""
        SELECT t.ticket_number, b.code AS branch, t.category, t.priority, t.status, t.subject,
               t.created_at, ROUND(julianday(:now) - julianday(t.created_at), 1) AS age_days,
               t.first_response_at IS NOT NULL AS responded
        FROM support_tickets t LEFT JOIN branches b ON b.id = t.branch_id
        WHERE t.status IN ('open','pending') AND t.created_at <= :now {bf}
        ORDER BY {PRIORITY_RANK}, t.created_at LIMIT :limit
        """,
        {"now": now, "limit": min(int(limit), 50), **bp},
    )


def list_unreplied_bad_reviews(branch_code: str | None = None, days: int = 30, limit: int = 10,
                               as_of: str | None = None) -> list[dict]:
    now = _as_of(as_of)
    bf, bp = _branch_filter(branch_code)
    return query(
        f"""
        SELECT r.id AS review_id, b.code AS branch, r.source, r.rating, r.topic, r.title, r.body, r.created_at
        FROM reviews r JOIN branches b ON b.id = r.branch_id
        WHERE r.rating <= :bad AND r.replied_at IS NULL
          AND r.created_at BETWEEN datetime(:now, :days) AND :now {bf}
        ORDER BY r.rating, r.created_at DESC LIMIT :limit
        """,
        {"now": now, "days": f"-{int(days)} day", "bad": BAD_REVIEW_MAX_RATING,
         "limit": min(int(limit), 50), **bp},
    )


def list_stockout_risks(branch_code: str | None = None, limit: int = 10) -> list[dict]:
    bf, bp = _branch_filter(branch_code)
    return query(
        f"""
        SELECT b.code AS branch, p.sku, p.name AS product, p.category, i.on_hand, i.avg_daily_sales,
               ROUND(i.on_hand / i.avg_daily_sales, 1) AS days_of_cover, s.name AS supplier,
               s.promised_lead_time_days
        FROM inventory i JOIN branches b ON b.id = i.branch_id JOIN products p ON p.id = i.product_id
        JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.is_active = 1 AND i.avg_daily_sales > 0 AND i.on_hand <= :cover * i.avg_daily_sales
          AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.branch_id = i.branch_id
              AND po.product_id = i.product_id AND po.status IN ('pending','in_transit')) {bf}
        ORDER BY days_of_cover, i.avg_daily_sales DESC LIMIT :limit
        """,
        {"cover": STOCKOUT_COVER_DAYS, "limit": min(int(limit), 50), **bp},
    )


def list_supplier_slips(min_orders: int = 10) -> list[dict]:
    """Suppliers ranked by actual minus promised lead time, among received orders."""
    return query(
        """
        SELECT s.name AS supplier, s.category_focus, s.promised_lead_time_days AS promised_days,
               ROUND(AVG(julianday(po.received_at) - julianday(po.ordered_at)), 1) AS actual_days,
               ROUND(AVG(julianday(po.received_at) - julianday(po.ordered_at)) - s.promised_lead_time_days, 1) AS slip_days,
               ROUND(100.0 * SUM(po.status = 'partially_received') / COUNT(*), 1) AS partial_pct,
               COUNT(*) AS orders
        FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.received_at IS NOT NULL
        GROUP BY s.id HAVING COUNT(*) >= :min ORDER BY slip_days DESC
        """,
        {"min": int(min_orders)},
    )


# --------------------------------------------------------------------------
# Writes (ADR 0002): narrow and logged
# --------------------------------------------------------------------------
def escalate_ticket(ticket_number: str, reason: str) -> dict:
    rows = query("SELECT id, status, priority FROM support_tickets WHERE ticket_number = ?", (ticket_number,))
    if not rows:
        raise ValueError(f"No ticket {ticket_number}")
    t = rows[0]
    if t["status"] not in ("open", "pending"):
        raise ValueError(f"{ticket_number} is {t['status']}; only open or pending tickets can be escalated")
    if t["priority"] == "urgent":
        return {"ticket": ticket_number, "changed": False, "priority": "urgent"}
    _write([
        ("UPDATE support_tickets SET priority = 'urgent' WHERE id = ?", (t["id"],)),
        ("INSERT INTO ops_actions (action, target, detail, created_at) VALUES ('escalate_ticket', ?, ?, ?)",
         (ticket_number, f"{t['priority']} -> urgent: {reason}", sandbox_now())),
    ])
    return {"ticket": ticket_number, "changed": True, "priority_before": t["priority"], "priority": "urgent"}


def draft_review_reply(review_id: int, reply_text: str) -> dict:
    rows = query("SELECT id, replied_at FROM reviews WHERE id = ?", (int(review_id),))
    if not rows:
        raise ValueError(f"No review {review_id}")
    if rows[0]["replied_at"]:
        raise ValueError(f"Review {review_id} already has a published reply")
    if not reply_text.strip():
        raise ValueError("reply_text is empty")
    _write([("INSERT INTO ops_actions (action, target, detail, created_at) VALUES ('review_reply_draft', ?, ?, ?)",
             (f"review:{int(review_id)}", reply_text.strip(), sandbox_now()))])
    return {"review_id": int(review_id), "saved_as": "draft", "published": False}


def list_actions(limit: int = 20) -> list[dict]:
    try:
        return query("SELECT id, action, target, detail, created_at FROM ops_actions ORDER BY id DESC LIMIT ?",
                     (min(int(limit), 100),))
    except sqlite3.OperationalError:  # table not created until the first write
        return []
