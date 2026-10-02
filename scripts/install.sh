#!/usr/bin/env bash
# Links the skill and desktop plugin into ~/.hermes (symlinks, so repo edits are live).
# Does not edit config.yaml; the remaining steps are printed at the end.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
H="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$H/skills" "$H/plugins"
ln -sfn "$REPO/skills/suki-command-center" "$H/skills/suki-command-center"
ln -sfn "$REPO/desktop-plugin/suki-command-center" "$H/plugins/suki-command-center"
echo "Linked skill and plugin into $H. Now run:"
echo "  hermes mcp add suki --command uv --args run $REPO/mcp-server/server.py"
echo "  add 'suki-command-center' to plugins.enabled in $H/config.yaml"
echo "Then restart Hermes, and in Desktop: Cmd+K -> Reload desktop plugins -> enable Suki Command Center."
