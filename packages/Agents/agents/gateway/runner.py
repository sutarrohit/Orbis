"""
agents/gateway/runner.py — gateway entry point
────────────────────────────────────────────────
Runs the per-platform gateways together: the Telegram gateway (Pyrogram) and the
Discord gateway (discord.py self-bots). Each starts every account's client, then
runs its background loops (outbound sender + community joiner/scraper + health).
Long-running — deploy on an always-on host (container/VM), not Lambda.

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
    logger.info("Telegram gateway started with %d account(s).", count)
    if count == 0:
        logger.warning("No Telegram accounts connected; background loops will idle.")
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
        logger.info("Telegram gateway stopped.")


async def _guarded(name: str, coro) -> None:
    """Run one platform gateway; log (don't re-raise) so a crash in one platform
    doesn't tear down the other."""
    try:
        await coro
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("%s gateway crashed", name)


async def run_all_gateways() -> None:
    """Run every platform gateway concurrently. The Discord gateway is imported
    lazily so a missing/optional ``discord.py-self`` install degrades to
    Telegram-only instead of taking the whole process down."""
    coros = [_guarded("Telegram", run_gateway())]
    try:
        from agents.gateway.discord.runner import run_discord_gateway
    except Exception as exc:  # discord.py-self not installed / import error
        logger.warning(
            "Discord gateway unavailable (%s); running Telegram only.", exc
        )
    else:
        coros.append(_guarded("Discord", run_discord_gateway()))
    await asyncio.gather(*coros)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    asyncio.run(run_all_gateways())


if __name__ == "__main__":
    main()
