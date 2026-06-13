"""
agents/gateway/discord/runner.py — Discord gateway loop
─────────────────────────────────────────────────────────
Connects every active Discord account, then runs the background loops. For now
that's the health/reconcile loop (which also onboards accounts connected after
boot). Later phases add the inbound listeners, the community joiner/scraper, and
the outbound sender — wire them into the ``gather`` below.

Launched alongside the Telegram gateway by ``agents.gateway.runner``; not a
separate process.
"""

from __future__ import annotations

import asyncio
import logging

from agents.gateway.discord.client_manager import DiscordGatewayClients
from agents.gateway.discord.health import run_health_check
from agents.gateway.discord.joiner import run_joiner
from agents.gateway.discord.sender import run_sender

logger = logging.getLogger(__name__)


async def run_discord_gateway(*, stop_event: asyncio.Event | None = None) -> None:
    clients = DiscordGatewayClients()
    count = await clients.start_all()
    logger.info("Discord gateway started with %d account(s).", count)
    if count == 0:
        logger.warning(
            "No Discord accounts connected; the health loop will onboard any added later."
        )
    try:
        # Inbound listeners fire via discord.py's on_message (attached per client);
        # these are the polled background loops (outbound sender + community
        # joiner/scraper + health).
        await asyncio.gather(
            run_sender(clients, stop_event=stop_event),
            run_joiner(clients, stop_event=stop_event),
            run_health_check(clients, stop_event=stop_event),
        )
    finally:
        await clients.stop_all()
        logger.info("Discord gateway stopped.")
