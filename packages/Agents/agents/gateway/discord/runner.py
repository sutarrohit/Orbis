"""
agents/gateway/discord/runner.py — Discord gateway entry point
──────────────────────────────────────────────────────────────────
Starts every Discord bot's client, then runs the background loops (outbound
sender + health/reconcile). Inbound is event-driven via discord.py handlers, so
there is no inbound loop here. Long-running — deploy on an always-on host
(container/VM), not Lambda.

Run with:
    uv run python -m agents.gateway.discord.runner
"""

from __future__ import annotations

import asyncio
import logging

from agents.gateway.discord.client_manager import DiscordGatewayClients
from agents.gateway.discord.health import run_health_check
from agents.gateway.discord.sender import run_sender

logger = logging.getLogger(__name__)


async def run_discord_gateway() -> None:
    clients = DiscordGatewayClients()
    count = await clients.start_all()
    logger.info("Discord gateway started with %d bot(s).", count)
    if count == 0:
        logger.warning("No bots connected; background loops will idle.")
    try:
        # Inbound fires via discord.py handlers; these are the polled loops.
        await asyncio.gather(
            run_sender(clients),
            run_health_check(clients),
        )
    finally:
        await clients.stop_all()
        logger.info("Discord gateway stopped.")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    asyncio.run(run_discord_gateway())


if __name__ == "__main__":
    main()
