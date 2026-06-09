"""
agents/lib/db.py — raw-SQL Postgres access (the source of truth)
────────────────────────────────────────────────────────────────
The agents coordinate through Postgres (Implentation.md §1). The **schema is
owned and migrated by Prisma** in ``apps/server`` — here we only read and write
rows with hand-written SQL via psycopg 3. We never define or migrate tables.

Two Prisma-isms to remember when writing INSERTs by hand (Prisma applies these
in its *client*, not the database, so raw SQL must supply them):

  * ``id``        — ``@default(uuid())`` is client-side → pass ``new_id()``.
  * ``updatedAt`` — ``@updatedAt`` is client-side → pass ``now()`` on every write.
  * ``createdAt`` — has a DB default (``CURRENT_TIMESTAMP``) → may be omitted.

Connection notes:
  * ``DATABASE_URL`` points at the Supabase **transaction pooler** (pgBouncer,
    port 6543). Prepared statements are incompatible with that pooler, so we
    disable them (``prepare_threshold=None``). This is also harmless on the
    session/direct connections, so it works everywhere.
"""

from __future__ import annotations

import logging
import threading
import uuid
from contextlib import contextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from psycopg_pool import ConnectionPool

from agents.lib.config import settings

logger = logging.getLogger(__name__)

# A fixed identity that owns brands the agents auto-create. Brands require an
# owner (FK to "user"); when no real owner exists we attribute to this system
# user so ``run_search`` and friends work out of the box.
SYSTEM_USER_EMAIL = "agents@orbis.local"
SYSTEM_USER_NAME = "Orbis Agents"

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()

_brand_cache: dict[str, str] = {}
_brand_lock = threading.Lock()


def new_id() -> str:
    """A UUID string for a primary key (Prisma's ``@default(uuid())`` is client-side)."""
    return str(uuid.uuid4())


def _clean_conninfo(url: str) -> str:
    """Strip query params libpq does not understand.

    The shared ``DATABASE_URL`` carries Prisma-only params (e.g. ``pgbouncer=true``)
    that psycopg/libpq rejects. Drop them so the same URL works for both.
    """
    parts = urlsplit(url)
    keep = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k not in {"pgbouncer"}
    ]
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(keep), parts.fragment)
    )


def direct_conninfo() -> str:
    """A direct (non-pgBouncer) Postgres URL for tools that need prepared
    statements or DDL — e.g. the LangGraph checkpointer.

    Uses ``DIRECT_URL`` when set; otherwise derives a Supabase **session pooler**
    URL from ``DATABASE_URL`` (swap the transaction pooler's port 6543 → 5432 and
    drop ``pgbouncer``). The session pooler supports prepared statements; the
    transaction pooler (6543) does not.
    """
    if settings.direct_url:
        return _clean_conninfo(settings.direct_url)
    if not settings.database_url:
        raise RuntimeError("Neither DIRECT_URL nor DATABASE_URL is set.")
    url = _clean_conninfo(settings.database_url)
    parts = urlsplit(url)
    if parts.port == 6543:
        netloc = parts.netloc.replace(":6543", ":5432")
        url = urlunsplit(
            (parts.scheme, netloc, parts.path, parts.query, parts.fragment)
        )
    return url


def pool() -> ConnectionPool:
    """Return the process-wide connection pool, creating it on first use."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                if not settings.database_url:
                    raise RuntimeError(
                        "DATABASE_URL is not set; cannot reach Postgres."
                    )
                _pool = ConnectionPool(
                    _clean_conninfo(settings.database_url),
                    min_size=1,
                    max_size=5,
                    # prepare_threshold=None disables prepared statements, which
                    # the Supabase transaction pooler (pgBouncer) does not support.
                    kwargs={"prepare_threshold": None, "autocommit": False},
                    open=True,
                )
    return _pool


def close_pool() -> None:
    """Close the connection pool. Call on app/process shutdown (e.g. FastAPI
    lifespan) so background pool threads stop cleanly."""
    global _pool
    if _pool is not None:
        with _pool_lock:
            if _pool is not None:
                _pool.close()
                _pool = None


@contextmanager
def cursor():
    """Yield a cursor inside a transaction.

    The pool's ``connection()`` context commits on success, rolls back on error,
    and returns the connection to the pool either way.
    """
    with pool().connection() as conn:
        with conn.cursor() as cur:
            yield cur


# ─────────────────────────────────────────────────────────────────────────────
# Brand resolution — map the agents' string brand_id to a real Brand row
# ─────────────────────────────────────────────────────────────────────────────


def resolve_brand_id(brand_ref: str) -> str:
    """Resolve an agent's ``brand_id`` (a slug like ``"default"``, or an actual
    brand UUID) to a real ``brand.id``.

    Get-or-create: if nothing matches, a brand is created (owned by the system
    user) so the agents work without a manual seed step. Cached per process.
    """
    if brand_ref in _brand_cache:
        return _brand_cache[brand_ref]
    with _brand_lock:
        if brand_ref in _brand_cache:
            return _brand_cache[brand_ref]
        with cursor() as cur:
            cur.execute(
                'SELECT id FROM brand WHERE id = %s OR slug = %s LIMIT 1',
                (brand_ref, brand_ref),
            )
            row = cur.fetchone()
            brand_id = row[0] if row else _create_brand(cur, brand_ref)
        _brand_cache[brand_ref] = brand_id
        return brand_id


def search_queries_for(brand_ref: str) -> list[str]:
    """Return the Search agent's saved web-search queries for a brand.

    Reads the ``searchQueries`` column off the brand's ``agent_config`` row
    (agentType = 'search'), set via the dashboard's Agent Config form. Returns
    an empty list when no config row exists or the field is unset, so callers
    can fall back to niche-derived defaults.
    """
    with cursor() as cur:
        cur.execute(
            'SELECT "searchQueries" FROM agent_config '
            "WHERE \"brandId\" = %s AND \"agentType\" = 'search' LIMIT 1",
            (resolve_brand_id(brand_ref),),
        )
        row = cur.fetchone()
    return list(row[0]) if row and row[0] else []


def _create_brand(cur, slug: str) -> str:
    """Insert a brand owned by the system user; return its id. Runs in ``cur``'s tx."""
    owner_id = _ensure_system_user(cur)
    brand_id = new_id()
    cur.execute(
        'INSERT INTO brand (id, "ownerId", name, slug, "updatedAt") '
        "VALUES (%s, %s, %s, %s, now())",
        (brand_id, owner_id, slug, slug),
    )
    logger.info("Created brand %s (slug=%s, owner=%s)", brand_id, slug, owner_id)
    return brand_id


def _ensure_system_user(cur) -> str:
    """Return the system user's id, creating it if absent. Runs in ``cur``'s tx."""
    cur.execute('SELECT id FROM "user" WHERE email = %s LIMIT 1', (SYSTEM_USER_EMAIL,))
    row = cur.fetchone()
    if row:
        return row[0]
    user_id = new_id()
    cur.execute(
        'INSERT INTO "user" (id, name, email, "updatedAt") VALUES (%s, %s, %s, now())',
        (user_id, SYSTEM_USER_NAME, SYSTEM_USER_EMAIL),
    )
    logger.info("Created system user %s for agent-owned brands", user_id)
    return user_id
