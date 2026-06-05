"""
agents/store.py
───────────────
File-based stand-in for Postgres ("the noticeboard").

Implentation.md says agents coordinate *only* through the database and that all
writes are idempotent via natural unique keys. Until Postgres exists we honour
the same contract against a local JSON file:

  - one JSON file per collection (``data/communities.json``)
  - upserts keyed by a natural unique key — ``(brand_id, handle)`` for communities
  - re-running a worker never creates duplicates

The public surface (``CommunityStore``) is intentionally repository-shaped so it
can be replaced by real DB repository functions later without changing any agent.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

from agents.lib.config import settings
from agents.schemas.research import ConversationRecord, GroupMemberRecord
from agents.schemas.sales import BrandProfile
from agents.schemas.search import CommunityRecord
from agents.schemas.talk import LeadRecord

logger = logging.getLogger(__name__)

# A process-wide lock keeps concurrent writes (e.g. manual run + scheduler)
# from clobbering the file. Postgres will handle this for real later.
_LOCK = threading.Lock()


def _read_json_list(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read %s (%s); treating as empty.", path, exc)
        return []


def _write_json_list(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=2, ensure_ascii=False)
    tmp.replace(path)  # atomic on the same filesystem


class CommunityStore:
    """Repository for discovered communities (``status=pending_join`` on insert)."""

    def __init__(self, path: Path | None = None):
        self.path = path or settings.communities_file

    @staticmethod
    def _key(brand_id: str, handle: str) -> tuple[str, str]:
        return (brand_id, handle)

    def all(self) -> list[CommunityRecord]:
        return [CommunityRecord.model_validate(r) for r in _read_json_list(self.path)]

    def for_brand(self, brand_id: str) -> list[CommunityRecord]:
        return [c for c in self.all() if c.brand_id == brand_id]

    def upsert_many(self, records: list[CommunityRecord]) -> tuple[int, int]:
        """Insert any records whose ``(brand_id, handle)`` is not already stored.

        Idempotent: existing keys are left untouched (first discovery wins, so we
        keep the original ``created_at``). Returns ``(inserted, duplicates)``.
        """
        with _LOCK:
            existing_rows = _read_json_list(self.path)
            existing_keys = {
                self._key(r.get("brand_id", ""), r.get("handle", ""))
                for r in existing_rows
            }

            inserted = 0
            duplicates = 0
            for rec in records:
                key = self._key(rec.brand_id, rec.handle)
                if key in existing_keys:
                    duplicates += 1
                    continue
                existing_rows.append(rec.model_dump())
                existing_keys.add(key)
                inserted += 1

            if inserted:
                _write_json_list(self.path, existing_rows)

        logger.info(
            "communities upsert: +%d new, %d duplicates (file=%s)",
            inserted,
            duplicates,
            self.path,
        )
        return inserted, duplicates


class LeadStore:
    """Repository for flagged leads (dedup key ``(brand_id, user_id)``).

    Shared by Talk (flags interested group members) and the future Research
    agent (scores inbound/outbound prospects). First flag wins — a re-flag of an
    existing lead is a no-op, so the original ``created_at`` and status are kept.
    """

    def __init__(self, path: Path | None = None):
        self.path = path or settings.leads_file

    @staticmethod
    def _key(brand_id: str, user_id: str) -> tuple[str, str]:
        return (brand_id, user_id)

    def all(self) -> list[LeadRecord]:
        return [LeadRecord.model_validate(r) for r in _read_json_list(self.path)]

    def for_brand(self, brand_id: str) -> list[LeadRecord]:
        return [lead for lead in self.all() if lead.brand_id == brand_id]

    def user_ids(self, brand_id: str) -> set[str]:
        """Set of ``user_id``s already a lead for ``brand_id`` (pre-filter helper)."""
        return {lead.user_id for lead in self.for_brand(brand_id)}

    def upsert(self, record: LeadRecord) -> bool:
        """Insert ``record`` if its ``(brand_id, user_id)`` is not already stored.

        Returns True if a new lead was written, False if it already existed.
        """
        with _LOCK:
            rows = _read_json_list(self.path)
            keys = {
                self._key(r.get("brand_id", ""), r.get("user_id", "")) for r in rows
            }
            if self._key(record.brand_id, record.user_id) in keys:
                return False
            rows.append(record.model_dump())
            _write_json_list(self.path, rows)
        logger.info(
            "lead upsert: +1 (%s/%s) file=%s",
            record.brand_id,
            record.user_id,
            self.path,
        )
        return True

    def get(self, brand_id: str, user_id: str) -> LeadRecord | None:
        """Return the lead for ``(brand_id, user_id)``, or None."""
        target = self._key(brand_id, user_id)
        for lead in self.all():
            if self._key(lead.brand_id, lead.user_id) == target:
                return lead
        return None

    def update(self, brand_id: str, user_id: str, **changes) -> LeadRecord | None:
        """Mutate an existing lead in place (status/note/…); return the new record.

        Unlike :meth:`upsert` (first-write-wins) this is the explicit mutate path
        used by Sales (write the outcome back) and, later, the Leader's lead
        actions. Returns None if the lead does not exist; unknown fields are
        ignored so callers can pass a superset safely.
        """
        valid = {k: v for k, v in changes.items() if k in LeadRecord.model_fields}
        with _LOCK:
            rows = _read_json_list(self.path)
            updated: LeadRecord | None = None
            for row in rows:
                if self._key(row.get("brand_id", ""), row.get("user_id", "")) == (
                    brand_id,
                    user_id,
                ):
                    row.update(valid)
                    updated = LeadRecord.model_validate(row)
                    break
            if updated is not None:
                _write_json_list(self.path, rows)
        if updated is not None:
            logger.info("lead update: (%s/%s) %s", brand_id, user_id, list(valid))
        return updated


class ProfileStore:
    """Read-only repository for brand sales profiles (the §7.4 knowledge base).

    The gateway / dashboard writes these; Sales reads the profile for a brand to
    know its persona, product, pricing, and conversion action. Keyed by
    ``brand_id``.
    """

    def __init__(self, path: Path | None = None):
        self.path = path or settings.brand_profiles_file

    def all(self) -> list[BrandProfile]:
        return [BrandProfile.model_validate(r) for r in _read_json_list(self.path)]

    def get(self, brand_id: str) -> BrandProfile | None:
        for profile in self.all():
            if profile.brand_id == brand_id:
                return profile
        return None


class ConversationStore:
    """Read-only repository for recent conversations (the gateway → Research bus).

    Research only reads these; the gateway writes them. No upsert is exposed here
    — when Postgres lands this becomes a query against the ``conversations`` table.
    """

    def __init__(self, path: Path | None = None):
        self.path = path or settings.conversations_file

    def all(self) -> list[ConversationRecord]:
        return [
            ConversationRecord.model_validate(r) for r in _read_json_list(self.path)
        ]

    def for_brand(self, brand_id: str) -> list[ConversationRecord]:
        return [c for c in self.all() if c.brand_id == brand_id]


class GroupMemberStore:
    """Read-only repository for scraped group members (gateway → Research bus).

    The outbound-prospect pool. Research reads members with a username that are
    not already leads; the gateway writes them after joining and scraping a group.
    """

    def __init__(self, path: Path | None = None):
        self.path = path or settings.group_members_file

    def all(self) -> list[GroupMemberRecord]:
        return [
            GroupMemberRecord.model_validate(r) for r in _read_json_list(self.path)
        ]

    def for_brand(self, brand_id: str) -> list[GroupMemberRecord]:
        return [m for m in self.all() if m.brand_id == brand_id]
