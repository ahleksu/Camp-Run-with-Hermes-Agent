"""Backend for the Command Center pane, mounted at /api/plugins/suki-command-center/.

Read-only. Reuses the MCP server's query core (ADR 0001). Hermes Desktop only
picks up plugin folders that are real directories, so scripts/install.sh copies this
folder into ~/.hermes/plugins/ and records the repo path in a `.repo-path` file. When
that file is absent (running from the repo), the repo is found relative to this file.
"""
import os
import sys

from fastapi import APIRouter, HTTPException

_HERE = os.path.dirname(os.path.realpath(__file__))


def _repo_root() -> str:
    marker = os.path.join(_HERE, "..", ".repo-path")
    if os.path.isfile(marker):
        with open(marker) as f:
            return f.read().strip()
    return os.path.realpath(os.path.join(_HERE, "..", "..", ".."))


_REPO = _repo_root()
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
        "expiring": core.list_expiring_stock(code, 5),
    }


@router.get("/actions")
def actions(limit: int = 6):
    """Escalations and reply drafts the agent recorded, newest first."""
    return core.list_actions(max(1, min(limit, 20)))


@router.get("/suppliers")
def suppliers(limit: int = 4):
    """Suppliers whose real lead time runs furthest past what they promise."""
    return core.list_supplier_slips()[: max(1, min(limit, 10))]
