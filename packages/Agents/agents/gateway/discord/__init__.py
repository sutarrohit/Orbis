"""
agents/gateway/discord — the Discord (bot) gateway.

A sibling of the Telegram gateway that runs each connected bot as a discord.py
client. Same downstream pipeline (Sales/Talk agents, PendingSend queue, stores);
only the client API differs. Scope: connect → listen → reply → send → health
(no community joiner/scraper — a bot is admin-invited, it can't cold-join).
"""
