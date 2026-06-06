"""The gateway — the single long-running process that owns all Telegram I/O
(Implentation.md §3). Holds one Pyrogram client per active account: sends queued
DMs, joins/scrapes communities, listens for DMs/group messages, and keeps account
health. Entry point: ``python -m agents.gateway.runner``.

Note: ``run_gateway`` is intentionally not imported here — importing it in the
package __init__ would double-import when running ``-m agents.gateway.runner``.
Import it from ``agents.gateway.runner`` directly if needed."""

from .client_manager import GatewayClients

__all__ = ["GatewayClients"]
