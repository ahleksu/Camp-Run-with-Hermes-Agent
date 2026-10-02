"""Backend for the Command Center pane, mounted at /api/plugins/suki-command-center/.

Read-only. Reuses the MCP server's query core (ADR 0001). The plugin folder is
symlinked from the repo (see README), so the core is found by resolving this file.
"""
import os
import sys

from fastapi import APIRouter, HTTPException

_REPO = os.path.realpath(os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "..", ".."))
sys.path.insert(0, os.path.join(_REPO, "mcp-server"))
import suki_core as core  # noqa: E402

router = APIRouter()

_SUM_KEYS = ("open_tickets", "urgent_tickets", "unreplied_bad_reviews", "stockout_risks", "expiring_soon")


@router.get("/scorecard")
def scorecard(days: int = 30):
    data = core.branch_scorecard(days)
    data["totals"] = {k: sum(b[k] for b in data["branches"]) for k in _SUM_KEYS}
    data["totals"]["loyalty_points_expiring"] = data["loyalty_points_expiring_30d"]["points"]
    return data


@router.get("/branch/{code}")
def branch(code: str):
    code = code.upper()
    if not core.query("SELECT 1 FROM branches WHERE code = ?", (code,)):
        raise HTTPException(404, f"Unknown branch {code}")
    return {
        "tickets": core.list_open_tickets(code, 5),
        "reviews": core.list_unreplied_bad_reviews(code, limit=5),
        "stockouts": core.list_stockout_risks(code, 5),
    }
