"""
agents/constants/gateway.py
─────────────────────────────
Tunables for the gateway runtime (the long-running Telegram process).
"""

from __future__ import annotations

# Outbound sender loop.
POLL_INTERVAL_SECONDS = 5  # how often to check the pending_send queue
SEND_PACE_SECONDS = 2  # pause between individual sends (conservative pacing)
SEND_BATCH = 20  # max queued DMs drained per pass

# Community join + scrape loop.
JOIN_POLL_INTERVAL = 30  # how often to look for communities to join
JOIN_PACE_SECONDS = 5  # pause between joins (joining fast looks spammy → bans)
JOIN_BATCH = 5  # max communities joined per pass
SCRAPE_LIMIT = 200  # max members scraped per community (v1 cap)

# Health check loop.
HEALTH_CHECK_INTERVAL = 300  # ping each client every 5 min, stamp/heal status
