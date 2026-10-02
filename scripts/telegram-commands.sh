#!/usr/bin/env bash
# Registers the Bantay Suki Telegram commands as Hermes quick_commands.
# Needs a Hermes gateway with Telegram connected. Re-run after moving the repo.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
for c in brief tickets reviews stockouts expiring suppliers actions; do
  hermes config set "quick_commands.$c.type" exec >/dev/null
  hermes config set "quick_commands.$c.command" "python3 $REPO/scripts/bantay.py $c" >/dev/null
done
hermes config set quick_commands.bantay.type alias >/dev/null
hermes config set quick_commands.bantay.target /suki-command-center >/dev/null
echo "Registered /brief /tickets /reviews /stockouts /expiring /suppliers /actions and /bantay."
echo "Restart the gateway to load them: hermes gateway restart"
