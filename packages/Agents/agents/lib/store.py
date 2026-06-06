"""
agents/lib/store.py — repositories over Postgres (the bus / noticeboard)
────────────────────────────────────────────────────────────────────────
Agents coordinate only through Postgres (Implentation.md §1, §5.3). These
repository classes are the only way agent code touches state; they wrap
hand-written SQL (via :mod:`agents.lib.db`) so the agents stay database-agnostic.

The **schema is owned and migrated by Prisma** in ``apps/server`` — here we only
read and write rows. Remember the Prisma-isms when inserting (see ``db.py``):
``id`` and ``updatedAt`` are client-side in Prisma, so every INSERT supplies
``db.new_id()`` and ``now()`` itself; ``createdAt`` has a DB default.

All writes are idempotent via the natural unique keys enforced by the schema:
``(brandId, handle)`` on communities and ``(brandId, userId)`` on leads.
"""

from __future__ import annotations

import logging

from agents.lib import db
from agents.schemas.research import ConversationRecord, GroupMemberRecord
from agents.schemas.sales import BrandProfile
from agents.schemas.search import CommunityRecord
from agents.schemas.talk import LeadRecord

logger = logging.getLogger(__name__)


def _iso(value) -> str:
    """A timestamp column → ISO-8601 string (``""`` when NULL)."""
    return value.isoformat() if value else ""


class CommunityStore:
    """Repository for discovered communities (``community`` table).

    Search **discovers but does not join** — every row is written with
    ``status='pending_join'``; the gateway joins and scrapes members later. The
    natural key ``(brandId, handle)`` is enforced by a unique constraint, so the
    upsert stays idempotent (first discovery wins).
    """

    _COLUMNS = (
        '"brandId", handle, name, "nicheRelevance", status, source, '
        '"foundVia", "sourceUrl", "createdAt"'
    )

    @staticmethod
    def _row_to_record(r: tuple) -> CommunityRecord:
        return CommunityRecord(
            brand_id=r[0],
            handle=r[1],
            name=r[2],
            niche_relevance=r[3],
            status=r[4],
            source=r[5],
            found_via=r[6],
            source_url=r[7],
            created_at=_iso(r[8]),
        )

    def all(self) -> list[CommunityRecord]:
        with db.cursor() as cur:
            cur.execute(f"SELECT {self._COLUMNS} FROM community")
            return [self._row_to_record(r) for r in cur.fetchall()]

    def for_brand(self, brand_id: str) -> list[CommunityRecord]:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'SELECT {self._COLUMNS} FROM community WHERE "brandId" = %s',
                (bid,),
            )
            return [self._row_to_record(r) for r in cur.fetchall()]

    def upsert_many(self, records: list[CommunityRecord]) -> tuple[int, int]:
        """Insert any records whose ``(brandId, handle)`` is not already stored.

        Idempotent via ``ON CONFLICT DO NOTHING``. Returns ``(inserted, duplicates)``.
        """
        if not records:
            return (0, 0)

        bid = db.resolve_brand_id(records[0].brand_id)
        inserted = 0
        duplicates = 0
        with db.cursor() as cur:
            for rec in records:
                cur.execute(
                    'INSERT INTO community '
                    '(id, "brandId", handle, name, "nicheRelevance", status, '
                    'source, "foundVia", "sourceUrl", "updatedAt") '
                    'VALUES (%s, %s, %s, %s, %s, %s::"CommunityStatus", %s, %s, %s, now()) '
                    'ON CONFLICT ("brandId", handle) DO NOTHING',
                    (
                        db.new_id(),
                        bid,
                        rec.handle,
                        rec.name,
                        rec.niche_relevance,
                        rec.status,
                        rec.source,
                        rec.found_via,
                        rec.source_url,
                    ),
                )
                if cur.rowcount == 1:
                    inserted += 1
                else:
                    duplicates += 1

        logger.info(
            "communities upsert: +%d new, %d duplicates (brand=%s)",
            inserted,
            duplicates,
            bid,
        )
        return inserted, duplicates


class LeadStore:
    """Repository for flagged leads (``lead`` table, key ``(brandId, userId)``).

    Shared by Talk (flags interested members), Research (scores inbound/outbound
    prospects) and Sales (writes outcomes back). :meth:`upsert` is first-write-wins
    (a re-flag is a no-op); :meth:`update` is the explicit mutate path.
    """

    _COLUMNS = (
        '"brandId", "userId", username, score, "interestLevel", status, source, '
        'note, "painPoints", "recommendedApproach", "sourceGroupChatId", '
        '"createdAt", "lastOutreachAt"'
    )

    # change-field → (column, enum cast or None) for the dynamic UPDATE.
    _UPDATABLE = {
        "username": ("username", None),
        "score": ("score", None),
        "interest_level": ('"interestLevel"', "InterestLevel"),
        "status": ("status", "LeadStatus"),
        "source": ("source", "LeadSource"),
        "note": ("note", None),
        "pain_points": ('"painPoints"', None),
        "recommended_approach": ('"recommendedApproach"', None),
        "source_group_chat_id": ('"sourceGroupChatId"', None),
        "last_outreach_at": ('"lastOutreachAt"', None),
    }

    @staticmethod
    def _row_to_record(r: tuple) -> LeadRecord:
        return LeadRecord(
            brand_id=r[0],
            user_id=r[1],
            username=r[2],
            score=r[3],
            interest_level=r[4],
            status=r[5],
            source=r[6],
            note=r[7],
            pain_points=r[8] or [],
            recommended_approach=r[9],
            source_group_chat_id=r[10],
            created_at=_iso(r[11]),
            last_outreach_at=_iso(r[12]),
        )

    def all(self) -> list[LeadRecord]:
        with db.cursor() as cur:
            cur.execute(f"SELECT {self._COLUMNS} FROM lead")
            return [self._row_to_record(r) for r in cur.fetchall()]

    def for_brand(self, brand_id: str) -> list[LeadRecord]:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'SELECT {self._COLUMNS} FROM lead WHERE "brandId" = %s', (bid,)
            )
            return [self._row_to_record(r) for r in cur.fetchall()]

    def user_ids(self, brand_id: str) -> set[str]:
        """Set of ``user_id``s already a lead for ``brand_id`` (pre-filter helper)."""
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute('SELECT "userId" FROM lead WHERE "brandId" = %s', (bid,))
            return {r[0] for r in cur.fetchall()}

    def upsert(self, record: LeadRecord) -> bool:
        """Insert ``record`` if ``(brandId, userId)`` is new. True if written."""
        bid = db.resolve_brand_id(record.brand_id)
        with db.cursor() as cur:
            cur.execute(
                'INSERT INTO lead '
                '(id, "brandId", "userId", username, score, "interestLevel", '
                'status, source, note, "painPoints", "recommendedApproach", '
                '"sourceGroupChatId", "lastOutreachAt", "updatedAt") '
                'VALUES (%s, %s, %s, %s, %s, %s::"InterestLevel", %s::"LeadStatus", '
                '%s::"LeadSource", %s, %s, %s, %s, %s, now()) '
                'ON CONFLICT ("brandId", "userId") DO NOTHING',
                (
                    db.new_id(),
                    bid,
                    record.user_id,
                    record.username,
                    record.score,
                    record.interest_level,
                    record.status,
                    record.source,
                    record.note,
                    record.pain_points,
                    record.recommended_approach,
                    record.source_group_chat_id,
                    record.last_outreach_at or None,
                ),
            )
            written = cur.rowcount == 1
        if written:
            logger.info("lead upsert: +1 (%s/%s)", bid, record.user_id)
        return written

    def get(self, brand_id: str, user_id: str) -> LeadRecord | None:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'SELECT {self._COLUMNS} FROM lead '
                'WHERE "brandId" = %s AND "userId" = %s',
                (bid, user_id),
            )
            row = cur.fetchone()
        return self._row_to_record(row) if row else None

    def update(self, brand_id: str, user_id: str, **changes) -> LeadRecord | None:
        """Mutate an existing lead (status/note/…); return the new record or None.

        The explicit mutate path used by Sales and the Leader's lead actions.
        Unknown fields are ignored so callers can pass a superset safely.
        """
        sets: list[str] = []
        values: list = []
        for field, (column, cast) in self._UPDATABLE.items():
            if field not in changes:
                continue
            value = changes[field]
            if field == "last_outreach_at":
                value = value or None
            sets.append(f"{column} = %s::\"{cast}\"" if cast else f"{column} = %s")
            values.append(value)

        if not sets:
            return self.get(brand_id, user_id)

        sets.append('"updatedAt" = now()')
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'UPDATE lead SET {", ".join(sets)} '
                'WHERE "brandId" = %s AND "userId" = %s '
                f"RETURNING {self._COLUMNS}",
                (*values, bid, user_id),
            )
            row = cur.fetchone()
        if row is not None:
            logger.info("lead update: (%s/%s) %s", bid, user_id, list(changes))
        return self._row_to_record(row) if row else None


class ProfileStore:
    """Read-only repository for brand sales profiles (``brand_profile`` table).

    The gateway / dashboard writes these; Sales reads the profile for a brand to
    know its persona, product, pricing, and conversion action.
    """

    _COLUMNS = (
        '"brandId", persona, "productSummary", pricing, "conversionAction", '
        '"objectionNotes"'
    )

    @staticmethod
    def _row_to_record(r: tuple) -> BrandProfile:
        return BrandProfile(
            brand_id=r[0],
            persona=r[1],
            product_summary=r[2],
            pricing=r[3],
            conversion_action=r[4],
            objection_notes=r[5],
        )

    def all(self) -> list[BrandProfile]:
        with db.cursor() as cur:
            cur.execute(f"SELECT {self._COLUMNS} FROM brand_profile")
            return [self._row_to_record(r) for r in cur.fetchall()]

    def get(self, brand_id: str) -> BrandProfile | None:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'SELECT {self._COLUMNS} FROM brand_profile WHERE "brandId" = %s',
                (bid,),
            )
            row = cur.fetchone()
        return self._row_to_record(row) if row else None


class ConversationStore:
    """Read-only repository for recent conversations (gateway → Research bus).

    Research only reads these; the gateway writes them.
    """

    _COLUMNS = '"brandId", "userId", username, "groupChatId", text, ts'

    @staticmethod
    def _row_to_record(r: tuple) -> ConversationRecord:
        return ConversationRecord(
            brand_id=r[0],
            user_id=r[1],
            username=r[2],
            group_chat_id=r[3],
            text=r[4],
            ts=_iso(r[5]),
        )

    def all(self) -> list[ConversationRecord]:
        with db.cursor() as cur:
            cur.execute(f"SELECT {self._COLUMNS} FROM conversation")
            return [self._row_to_record(r) for r in cur.fetchall()]

    def for_brand(self, brand_id: str) -> list[ConversationRecord]:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'SELECT {self._COLUMNS} FROM conversation WHERE "brandId" = %s',
                (bid,),
            )
            return [self._row_to_record(r) for r in cur.fetchall()]


class GroupMemberStore:
    """Read-only repository for scraped group members (gateway → Research bus).

    The outbound-prospect pool. Research reads members with a username that are
    not already leads; the gateway writes them after joining and scraping a group.
    """

    _COLUMNS = '"brandId", "userId", username, "groupChatId", bio, "activityNote"'

    @staticmethod
    def _row_to_record(r: tuple) -> GroupMemberRecord:
        return GroupMemberRecord(
            brand_id=r[0],
            user_id=r[1],
            username=r[2],
            group_chat_id=r[3],
            bio=r[4],
            activity_note=r[5],
        )

    def all(self) -> list[GroupMemberRecord]:
        with db.cursor() as cur:
            cur.execute(f"SELECT {self._COLUMNS} FROM group_member")
            return [self._row_to_record(r) for r in cur.fetchall()]

    def for_brand(self, brand_id: str) -> list[GroupMemberRecord]:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                f'SELECT {self._COLUMNS} FROM group_member WHERE "brandId" = %s',
                (bid,),
            )
            return [self._row_to_record(r) for r in cur.fetchall()]


class SocialAccountStore:
    """Read repository for the gateway's sending accounts (``social_account``).

    The outbound state machine reads active accounts to pick who sends each DM.
    """

    def active_for_brand(self, brand_id: str) -> list[tuple[str, str]]:
        """Active accounts as ``(id, external_id)`` (only ``status='active'`` may act)."""
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                'SELECT id, "externalId" FROM social_account '
                'WHERE "brandId" = %s AND status = %s::"SocialAccountStatus"',
                (bid, "active"),
            )
            return cur.fetchall()


class PendingSendStore:
    """Repository for the outbound DM queue (``pending_send``).

    The outbound state machine writes queued DMs here; the gateway reads
    ``status='queued'`` rows, delivers them, and marks them ``sent``. The dedup
    key ``(brandId, dedupKey)`` makes queueing idempotent (a retry can't
    double-send).
    """

    def already_queued_for_lead(self, brand_id: str, lead_id: str) -> bool:
        """True if this lead already has any queued/sent DM (the dedup gate)."""
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                'SELECT 1 FROM pending_send WHERE "brandId" = %s AND "leadId" = %s LIMIT 1',
                (bid, lead_id),
            )
            return cur.fetchone() is not None

    def count_today_by_account(self, brand_id: str) -> dict[str, int]:
        """DMs queued today per account (backs the per-account daily cap)."""
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                'SELECT "accountId", count(*) FROM pending_send '
                'WHERE "brandId" = %s AND "createdAt" >= date_trunc(\'day\', now()) '
                'GROUP BY "accountId"',
                (bid,),
            )
            return {r[0]: int(r[1]) for r in cur.fetchall()}

    def queue(
        self,
        brand_id: str,
        lead_id: str,
        account_id: str,
        message: str,
        stage: int,
        dedup_key: str,
    ) -> bool:
        """Queue one DM (``status='queued'``). True if newly queued, False if a
        row with the same ``(brandId, dedupKey)`` already exists."""
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                'INSERT INTO pending_send '
                '(id, "brandId", "leadId", "accountId", message, stage, status, "dedupKey") '
                'VALUES (%s, %s, %s, %s, %s, %s, %s::"PendingSendStatus", %s) '
                'ON CONFLICT ("brandId", "dedupKey") DO NOTHING',
                (db.new_id(), bid, lead_id, account_id, message, stage, "queued", dedup_key),
            )
            return cur.rowcount == 1
