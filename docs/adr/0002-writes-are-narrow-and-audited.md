# Write tools are narrow, reversible, and logged

The MCP server exposes exactly two writes: escalating a ticket to urgent, and saving a reply draft. Each appends a row to a new `ops_actions` table, and no tool can publish a reply or edit any other source table. We rejected a generic update tool because the judges and the admin both need to trust what the agent can touch, and `data/seed.py` already resets everything.
