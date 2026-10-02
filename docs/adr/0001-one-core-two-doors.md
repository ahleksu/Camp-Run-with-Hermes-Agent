# One query core shared by the MCP server and the desktop pane

All command-center queries live in `mcp-server/suki_core.py`. The MCP server wraps them as agent tools, and the desktop plugin's Python backend wraps them as REST routes for the pane. We chose this over having the pane call MCP tools through the chat because a pane must render instantly without a model turn, and over duplicating SQL because two copies of "on-time rate" would drift.
