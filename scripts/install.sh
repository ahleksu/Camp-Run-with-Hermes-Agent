#!/usr/bin/env bash
# Copies the skill and desktop plugin into ~/.hermes. Re-run after editing either.
# Does not edit config.yaml; the remaining steps are printed at the end.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
H="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$H/skills" "$H/plugins"
# Skill is copied, not symlinked: Hermes warns on skill files outside ~/.hermes/skills/. Re-run after editing the skill.
rm -rf "$H/skills/suki-command-center"
cp -R "$REPO/skills/suki-command-center" "$H/skills/suki-command-center"
# Plugin is copied, not symlinked: Hermes Desktop skips symlinked plugin folders, so the pane never loads.
# The backend reads .repo-path to find mcp-server/suki_core.py in this repo.
rm -rf "$H/plugins/suki-command-center"
cp -R "$REPO/desktop-plugin/suki-command-center" "$H/plugins/suki-command-center"
find "$H/plugins/suki-command-center" -name __pycache__ -prune -exec rm -rf {} +
printf '%s\n' "$REPO" > "$H/plugins/suki-command-center/.repo-path"
echo "Copied skill and plugin into $H. Now run:"
echo "  hermes mcp add suki --command uv --args run $REPO/mcp-server/server.py"
echo "  add 'suki-command-center' to plugins.enabled in $H/config.yaml"
echo "Then restart Hermes, and in Desktop: Cmd+K -> Reload desktop plugins -> enable Suki Command Center."
