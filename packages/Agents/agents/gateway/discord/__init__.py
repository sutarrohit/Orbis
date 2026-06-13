"""The Discord side of the gateway — one ``discord.Client`` (user-token self-bot)
per active Discord account, mirroring the Telegram gateway package.

Unlike Pyrogram (where ``client.start()`` returns and the client runs in the
background), discord.py's ``client.start(token)`` is the client's main run loop,
so each account's client runs as its own asyncio task held by the client manager.

Entry point: ``agents.gateway.discord.runner.run_discord_gateway`` (launched
alongside the Telegram gateway by ``agents.gateway.runner``).

``run_discord_gateway`` is intentionally not imported here to avoid double-import
when running the package as a module.
"""

from .client_manager import DiscordGatewayClients

__all__ = ["DiscordGatewayClients"]
