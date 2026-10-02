# Camp Run with Hermes Agent

**The official starter kit for the CAMP / RUN Hermes Agent hackathon** — October 2, 2026 · Avtica Office.

Fork this repo, and in 45–60 minutes build one connected solution on top of a realistic business sandbox:

```
  LAYER 3 · DESKTOP PLUGIN      LAYER 2 · SKILL            LAYER 1 · MCP SERVER        SANDBOX
  "the face"                    "the playbook"             "the hands"
 ┌──────────────────┐        ┌──────────────────┐       ┌──────────────────┐       ┌──────────────┐
 │ Pane / command in│ ─────▶ │ SKILL.md teaches │ ────▶ │ Python tools that│ ────▶ │ data/store.db│
 │ Hermes Desktop   │        │ Hermes a workflow│       │ read & act on the│       │ Suki Mart    │
 └──────────────────┘        └──────────────────┘       │ data             │       └──────────────┘
                                                        └──────────────────┘
```

Everything runs **locally on your laptop** — no cloud, no accounts, no API keys for the data. Works offline.

---

## Suki Command Center (this fork's build)

An admin view across all 12 branches: delivery on-time rate, open/urgent tickets, unreplied bad reviews, stockout risks, expiring stock, absence, and supplier slips. Terms are in [GLOSSARY.md](GLOSSARY.md); design decisions in [docs/adr](docs/adr).

| Layer | Where | What |
|---|---|---|
| Query core | `mcp-server/suki_core.py` | All SQL; shared by the two doors below |
| 1 · MCP | `mcp-server/server.py` | 7 read tools, plus `escalate_ticket` and `draft_review_reply` (logged to `ops_actions`) |
| 2 · Skill | `skills/suki-command-center/` | Scorecard, then drill-downs, then at most 3 confirmed actions |
| 3 · Plugin | `desktop-plugin/suki-command-center/` | Pane with scorecard and drill-down, backed by `dashboard/plugin_api.py` |

```bash
python3 -m unittest discover -s tests   # core tests, run on a temp copy of the DB
./scripts/install.sh                    # copy skill and plugin, print the remaining steps
```

Step-by-step setup and demo script: **[docs/SETUP.md](docs/SETUP.md)**.

The pane's backend only loads when `suki-command-center` is in `plugins.enabled` in `~/.hermes/config.yaml`; restart the gateway after adding it. `python data/seed.py` resets the data, including the `ops_actions` log.

---

## Contents

- [The sandbox: Suki Mart](#the-sandbox-suki-mart)
- [Before the event](#before-the-event)
- [Quick start](#quick-start)
- [Layer 1 — MCP server](#layer-1--mcp-server)
- [Layer 2 — Skill](#layer-2--skill)
- [Layer 3 — Desktop plugin](#layer-3--desktop-plugin)
- [Suggested timebox](#suggested-timebox)
- [Rules & judging](#rules--judging)
- [Troubleshooting](#troubleshooting)

---

## The sandbox: Suki Mart

**Suki Mart** is a fictional grocery and delivery chain with **12 branches across Metro Manila** — BGC, Makati, Ortigas, Kapitolyo, Cubao, Katipunan, Tomas Morato, Shaw, Alabang, BF Parañaque, Marikina and Ermita.

It lives in one SQLite file, `data/store.db`, with **~230,000 rows across 18 tables** and six months of history:

| Area | Tables |
|---|---|
| Stores & supply | `branches`, `suppliers`, `products`, `inventory`, `purchase_orders` |
| Customers & sales | `customers`, `loyalty_accounts`, `loyalty_transactions`, `promos`, `orders`, `order_items` |
| Delivery | `riders`, `deliveries` |
| People & operations | `staff`, `staffing_targets`, `shifts` |
| Customer experience | `support_tickets`, `reviews` |

📖 Full column reference: **[data/SCHEMA.md](data/SCHEMA.md)**

Three things to know:

1. **"Today" inside the data is `2026-09-30`.** Use it for "this week", "last 30 days", "overdue", etc.
2. **The data is messy on purpose.** Every department has real problems planted in it — the kind a real operations or customer team would lose sleep over. Finding one worth solving is part of the challenge.
3. **You can't break it for good.** `python data/seed.py` rebuilds the exact same database in seconds.

The challenge track is **Business Operations** or **Customer Experience** (Open Innovation may also be considered).

---

## Before the event

Do this at home — venue Wi-Fi is not the place to install things.

- [ ] **Hermes Agent + Hermes Desktop** installed → [docs](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart)
- [ ] A working model provider (`hermes model`) — your own account
- [ ] `hermes doctor` passes
- [ ] `uv` available (`uv --version`) — the Hermes installer includes it
- [ ] `git` installed and this repo forked & cloned
- [ ] Python 3.10+ (only needed if you run the scripts directly)

---

## Quick start

```bash
# 1. Fork this repo on GitHub, then clone YOUR fork
git clone https://github.com/<your-username>/Camp-Run-with-Hermes-Agent.git
cd Camp-Run-with-Hermes-Agent

# 2. Check the MCP server starts (Ctrl+C to stop — it waits silently for Hermes)
uv run mcp-server/server.py

# 3. Register it with Hermes — use the ABSOLUTE path to server.py
pwd        # macOS / Linux  →  e.g. /Users/you/Camp-Run-with-Hermes-Agent
cd         # Windows (cmd)  →  e.g. C:\Users\you\Camp-Run-with-Hermes-Agent

hermes mcp add suki --command uv --args run /ABSOLUTE/PATH/Camp-Run-with-Hermes-Agent/mcp-server/server.py

# 4. Restart Hermes (no hot-reload for MCP), then verify
hermes mcp test suki
```

Then ask Hermes: *"Use the suki MCP server to describe the Suki Mart sandbox."*

> **Alternative to step 3** — add it to `~/.hermes/config.yaml` yourself:
> ```yaml
> mcp_servers:
>   suki:
>     command: uv
>     args: ["run", "/ABSOLUTE/PATH/Camp-Run-with-Hermes-Agent/mcp-server/server.py"]
> ```

---

## Layer 1 — MCP server

📁 `mcp-server/server.py`

A working Python MCP server (FastMCP) with the database already wired up and two tools: `describe_sandbox` (exploration helper) and `list_branches` (an example domain tool). **Your job: add the tools your idea needs.**

```python
@mcp.tool()
def find_stockout_risks(branch_code: str, days_of_cover: int = 3) -> list[dict]:
    """Products at a branch that will run out within N days at current sales pace."""
    return query("SELECT ... WHERE ...", (branch_code, days_of_cover))
```

Good tools:

- **Answer one business question each**, with clear parameters (`branch_code`, `days`, `limit`…).
- **Keep SQL inside the tool.** A generic "run any SQL" tool scores low — the judges want domain design.
- **Return small, structured results.** 20 clean rows beat 2,000 raw ones.
- **Have a docstring written for the AI** — it's how Hermes decides when to call the tool.
- **Can take action** with the `execute()` helper (resolve a ticket, create a purchase order, flag a customer…).

After every change: **restart Hermes**, then `hermes mcp test suki`. Tools appear to the agent as `mcp_suki_<tool_name>`.

> The server pins `mcp<2` (the classic `FastMCP` API most docs and AI assistants use). `uv run` installs it automatically — no `pip install` needed.

---

## Layer 2 — Skill

📁 `skills/suki-command-center/SKILL.md` (the template name was `suki-team-skill`)

A skill is a markdown procedure Hermes loads on demand. It teaches the agent **when** to act and **how to chain your MCP tools** into a real multi-step workflow — the sequence, the decision rules, and the output format.

```bash
# 1. Rename the folder AND the `name:` field to your skill's name (they must match)
# 2. Fill in the template, then install it:
cp -r skills/<your-skill> ~/.hermes/skills/                      # macOS / Linux
xcopy /E /I skills\<your-skill> %USERPROFILE%\.hermes\skills\<your-skill>   # Windows
```

Installed skills take effect in **new sessions** — start a new chat after installing. Test it by asking something that matches your skill's description, or name it directly: *"Use the \<your-skill\> skill to…"*

📖 [Working with Skills](https://hermes-agent.nousresearch.com/docs/guides/work-with-skills)

---

## Layer 3 — Desktop plugin

📁 `desktop-plugin/suki-command-center/desktop/plugin.js`

A pane inside Hermes Desktop with buttons that trigger your skill, plus a ⌘K / Ctrl+K command. It's a single JavaScript file — no build step.

This fork's plugin has a Python backend, so it installs as a full plugin: `./scripts/install.sh` copies it into `~/.hermes/plugins/`, and `plugins.enabled` in `config.yaml` turns it on (see [docs/SETUP.md](docs/SETUP.md)). The commands below are the template route for a frontend-only pane.

```bash
# Rename the folder AND the `id` in plugin.js (they must match), then:
cp -r desktop-plugin/<your-plugin> ~/.hermes/desktop-plugins/                               # macOS / Linux
xcopy /E /I desktop-plugin\<your-plugin> %USERPROFILE%\.hermes\desktop-plugins\<your-plugin>   # Windows
```

In Hermes Desktop: **⌘K / Ctrl+K → "Reload desktop plugins"**, and enable it under **Capabilities → Plugins** if needed. Saves hot-reload after that.

Loader rules (from the SDK):

- Only three imports work: `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`.
- The file isn't compiled — write UI with `jsx()` / `jsxs()`, **not** `<JSX/>` syntax.
- Use theme variables (`var(--ui-text-secondary)`), never hardcoded colors.

**Going further:** the template sends prompts into the chat with `host.composer.submit()`. The SDK can do much more — sidebar pages, status-bar widgets, transcript directives that render your own components inside the agent's reply, and a Python backend via `ctx.rest`. Hermes ships a bundled **`hermes-desktop-plugins`** skill — ask your agent to help you build the pane.

📖 [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)

---

## Suggested timebox

| Minutes | Goal |
|---|---|
| 0–15 | MCP tools written; `hermes mcp test` passes |
| 15–30 | Skill written, installed, and triggering from a natural prompt |
| 30–50 | Desktop pane wired to the skill |
| 50–60 | Polish and rehearse the 5-minute demo |

Using Hermes (or any AI) to help write your code is **allowed and encouraged**. The idea, the design and the integration are what's judged.

---

## Rules & judging

📋 Full mechanics and scoring: **[docs/JUDGING.md](docs/JUDGING.md)**

| Criterion | Points |
|---|---:|
| MCP Server (Layer 1) | 20 |
| Skill (Layer 2) | 20 |
| Desktop Plugin GUI (Layer 3) | 20 |
| End-to-End Integration | 10 |
| Relevance | 15 |
| Uniqueness | 10 |
| Demo & Pitch | 5 |
| **Total** | **100** |

- Build on the Suki Mart sandbox data.
- Write your own MCP — catalog MCPs or existing plugins don't count as your team's build.
- Demo live from your laptop: **problem → how Hermes is used → working output**, in 5 minutes.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `hermes mcp test suki` fails | Use the **absolute** path to `server.py`. Run `uv run mcp-server/server.py` directly to see errors. Restart Hermes after any change. |
| `No module named 'mcp.server.fastmcp'` | You're on `mcp` v2. Run through `uv run` (it respects the `mcp<2` pin in the file header). |
| Tools don't show up in chat | Restart Hermes — MCP servers load at startup only. Check `hermes mcp list`. |
| `unable to open database file` | Don't move `server.py` out of the repo — it finds `data/store.db` relative to its own location. |
| Skill doesn't trigger | Start a **new** session. Make the `description:` specific about *when* to use it. Folder name must equal `name:`. |
| Plugin doesn't appear | Folder name must equal the `id` in `plugin.js`. ⌘K → "Reload desktop plugins". Check the error toast. |
| `ReferenceError` in plugin | Every identifier used in `jsx()` must be in the import line. |
| Broke the data | `python data/seed.py` — rebuilds the identical database. |

---

## Repository layout

```
Camp-Run-with-Hermes-Agent/
├── data/
│   ├── store.db              ← the Suki Mart sandbox (SQLite)
│   ├── seed.py               ← deterministic generator = reset command
│   └── SCHEMA.md             ← tables, columns, relationships, enums
├── mcp-server/
│   ├── server.py             ← Layer 1: MCP tools
│   └── suki_core.py          ← shared query core
├── skills/
│   └── suki-command-center/
│       └── SKILL.md          ← Layer 2: the playbook
├── desktop-plugin/
│   └── suki-command-center/  ← Layer 3: pane + REST backend
├── scripts/install.sh        ← installs skill and plugin into ~/.hermes
├── tests/test_core.py
└── docs/
    ├── SETUP.md              ← setup and demo steps
    ├── JUDGING.md            ← mechanics & scoring
    └── adr/
```

---

## License

[MIT](LICENSE) — fork it, remix it, ship it. Suki Mart and every person, business and record in the dataset are **fictional**; any resemblance to real entities is coincidental.

Built for **CAMP / RUN** · Avtica × DEVCON Manila · Powered by [Hermes Agent](https://hermes-agent.nousresearch.com) by Nous Research.
