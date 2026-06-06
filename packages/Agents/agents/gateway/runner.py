"""
agents/gateway/runner.py — gateway entry point
────────────────────────────────────────────────
Starts every account's client, then runs the background loops (Phase 1: the
outbound sender; later phases add inbound listeners + join/scrape). Long-running
— deploy on an always-on host (container/VM), not Lambda.

Run with:
    uv run python -m agents.gateway.runner
"""

from __future__ import annotations

import asyncio
import logging

from agents.gateway.client_manager import GatewayClients
from agents.gateway.health import run_health_check
from agents.gateway.joiner import run_joiner
from agents.gateway.sender import run_sender

logger = logging.getLogger(__name__)


async def run_gateway() -> None:
    clients = GatewayClients()
    count = await clients.start_all()
    logger.info("Gateway started with %d account(s).", count)
    if count == 0:
        logger.warning("No accounts connected; background loops will idle.")
    try:
        # Inbound listeners fire via Pyrogram handlers; these are the polled
        # background loops (outbound sender + community joiner/scraper + health).
        await asyncio.gather(
            run_sender(clients),
            run_joiner(clients),
            run_health_check(clients),
        )
    finally:
        await clients.stop_all()
        logger.info("Gateway stopped.")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    asyncio.run(run_gateway())


if __name__ == "__main__":
    main()
