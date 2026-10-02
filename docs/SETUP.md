# Set up and run the Suki Command Center

This guide takes you from a fresh clone to a working demo. Each step has a check, so you know it worked before you go on.

## What you are installing

Three parts share one query core, `mcp-server/suki_core.py`.

- The MCP server (`mcp-server/server.py`) gives Hermes 11 tools: 9 reads and 2 narrow writes.
- The skill (`skills/suki-command-center/SKILL.md`) tells Hermes how to chain those tools into a briefing.
- The desktop plugin (`desktop-plugin/suki-command-center/`) adds a pane to Hermes Desktop. Its Python backend reads the same database without a model turn.

## Prerequisites

- Hermes Agent and Hermes Desktop, with a model provider set (`hermes model`).
- `uv` (the Hermes installer includes it).
- Python 3.10 or newer.

Run `hermes doctor` and `uv --version` to make sure that both work.

## Steps

1. Run the core tests:

   ```bash
   python3 -m unittest discover -s tests
   ```

   Check: the output ends with `OK`. The tests run on a temporary copy of the database.

2. Run the install script from the repo root:

   ```bash
   ./scripts/install.sh
   ```

   The script copies the skill to `~/.hermes/skills/` and the plugin to `~/.hermes/plugins/`. It copies the plugin because Hermes Desktop skips symlinked plugin folders. It does not edit `config.yaml`.

3. Register the MCP server. Use the absolute path to `server.py`:

   ```bash
   hermes mcp add suki --command uv --args run "$(pwd)/mcp-server/server.py"
   ```

4. Enable the plugin. Add `suki-command-center` to `plugins.enabled` in `~/.hermes/config.yaml`:

   ```yaml
   plugins:
     enabled:
       - suki-command-center
   ```

5. Restart Hermes. MCP servers and plugin backends load at startup only.

6. Make sure that the pieces load:

   ```bash
   hermes mcp test suki      # expect: Connected, Tools discovered: 11
   hermes plugins list       # expect: suki-command-center  enabled
   ```

7. In Hermes Desktop, press Cmd+K (Ctrl+K on Windows and Linux) and run "Reload desktop plugins". Open Capabilities, then Plugins, open Suki Command Center, and turn on its Desktop row. That row is off by default and shows "copying..." until Desktop copies the pane in.

## Run the demo

1. Open the Command Center pane. The scorecard shows 12 branches. The worst three values in each column are highlighted.
2. Click a branch. The pane lists its open tickets, unreplied bad reviews, and stockout risks.
3. Click "Brief me on what needs attention". Hermes loads the skill and calls `branch_scorecard` first. Then it calls the drill-down tools for up to 3 branches.
4. Hermes proposes at most 3 actions. It asks "Go ahead?" before each write. Answer yes to one escalation.
5. When the turn ends, the pane refreshes. Ask "What actions were recorded?" to see the `ops_actions` log through `list_recent_actions`.

You can also type the prompt yourself: `Use the suki-command-center skill to brief me on the branches that need attention most.`

## Telegram commands (optional)

With a Telegram bot connected to the Hermes gateway, run `./scripts/telegram-commands.sh`, then `hermes gateway restart`. This adds `/brief`, `/tickets`, `/reviews`, `/stockouts`, `/expiring`, `/suppliers` and `/actions`, which read the database without a model turn, and `/bantay <request>`, which goes through the skill and asks before it writes. The commands run `scripts/bantay.py`, which uses the same `suki_core.py` as the pane. They work when typed but do not appear in Telegram's `/` menu.

## Change something

- You edit `suki_core.py` or `server.py`: restart Hermes.
- You edit `SKILL.md`: run `./scripts/install.sh` again, then start a new chat. The script copies the skill, so it does not update on its own.
- You edit `desktop/plugin.js` or `dashboard/plugin_api.py`: run `./scripts/install.sh` again. Then reload desktop plugins with Cmd+K, and restart the gateway for backend changes.

## Reset

`python data/seed.py` rebuilds the database, including the `ops_actions` log. Do this before each demo run so the escalation you show is the first one.

## Troubleshooting

| Problem | Fix |
|---|---|
| `hermes mcp test suki` fails | Use the absolute path to `server.py`. Run `uv run mcp-server/server.py` to see the error. |
| The pane says "Backend unavailable" | Add `suki-command-center` to `plugins.enabled`, then restart the gateway. |
| A Telegram command says "not found" | Run `./scripts/telegram-commands.sh`, then `hermes gateway restart`. |
| The skill does not trigger | Start a new chat. Run `./scripts/install.sh` again if you edited the skill. |
| Hermes warns about a skill outside `~/.hermes/skills/` | A symlink points there. Run `./scripts/install.sh`, which copies the skill. |
| The Desktop row says "copying..." forever | The plugin folder is a symlink. Run `./scripts/install.sh` to replace it with a copy, then reload desktop plugins. |
| The pane does not appear | Turn on the Desktop row in Capabilities, then Plugins. Make sure that the folder name equals `PLUGIN_ID` in `plugin.js`. |
| `No module named 'mcp.server.fastmcp'` | You are on `mcp` v2. Run the server with `uv run`, which respects the `mcp<2` pin. |
