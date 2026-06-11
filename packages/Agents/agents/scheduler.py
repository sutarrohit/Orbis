"""
agents/scheduler.py — the clock (Implentation.md §10), DB-driven
─────────────────────────────────────────────────────────────────
LangGraph runs the Leader's logic *when triggered* — it does not trigger itself.
This scheduler is what wakes it (and runs the time-based follow-up sweep).

The schedule is now configured in the DB (the ``scheduler_config`` singleton,
owned by Prisma), **not** the environment, so the dashboard can turn autonomy
on/off and change the intervals live. The env vars (``SCHEDULER_ENABLED``,
``LEADER_INTERVAL_MINUTES``, ``FOLLOWUP_INTERVAL_MINUTES``) are only the
first-run fallback used when no config row exists yet.

Jobs:
  - **config watch** — every minute: re-read ``scheduler_config`` and apply it
    (start/stop the leader + follow-up jobs, reschedule on interval change).
    This is what makes UI edits take effect without a restart.
  - **Leader cycle** — every ``leaderIntervalMinutes``: run the full Leader graph
    (which also runs the outbound pipeline).
  - **Follow-up sweep** — every ``followupIntervalMinutes``: run the outbound
    pipeline on its own, so follow-ups/cold transitions still advance even if the
    (heavier, LLM-bound) Leader cycle is delayed or its model is down.

The watch job always runs once started; the leader/follow-up jobs exist only
while the config is ``enabled``. All passes are idempotent (dedup keys + stage
gating), so overlap is harmless.

Run inside the FastAPI app (it starts on boot) or standalone:
    uv run python -m agents.scheduler
"""

from __future__ import annotations

import logging
import time

from apscheduler.schedulers.background import BackgroundScheduler

from agents.agent_runners.leader import run_leader_cycle
from agents.agent_runners.outreach import run_outbound_pipeline
from agents.lib import db
from agents.lib.config import settings

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

WATCH_JOB_ID = "config_watch"
LEADER_JOB_ID = "leader_cycle"
FOLLOWUP_JOB_ID = "followup_sweep"
WATCH_INTERVAL_MINUTES = 1

# The leader/follow-up intervals last applied to the live jobs, so the watch loop
# only reschedules when a value actually changes (rescheduling every tick would
# keep resetting the countdown and a long interval would never fire).
_applied: dict[str, int] = {}


def _active_brand_ids() -> list[str]:
    """Ids of brands the scheduler should drive."""
    with db.cursor() as cur:
        cur.execute("SELECT id FROM brand WHERE active = true")
        return [r[0] for r in cur.fetchall()]


# ─────────────────────────────────────────────────────────────────────────────
# Config (DB singleton, env fallback)
# ─────────────────────────────────────────────────────────────────────────────


def _load_config() -> tuple[bool, int, int]:
    """Read the ``scheduler_config`` singleton → (enabled, leader_min, followup_min).

    Falls back to the env defaults when the row (or table) doesn't exist yet, so a
    fresh DB still behaves like the old env-driven scheduler.
    """
    try:
        with db.cursor() as cur:
            cur.execute(
                'SELECT enabled, "leaderIntervalMinutes", "followupIntervalMinutes" '
                "FROM scheduler_config WHERE id = %s",
                ("global",),
            )
            row = cur.fetchone()
    except Exception as exc:  # table missing / DB hiccup → env fallback
        logger.warning("scheduler_config unreadable (%s); using env defaults.", exc)
        row = None
    if row is None:
        return (
            settings.scheduler_enabled,
            settings.leader_interval_minutes,
            settings.followup_interval_minutes,
        )
    return (bool(row[0]), int(row[1]), int(row[2]))


# ─────────────────────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────────────────────


def leader_tick() -> None:
    """Run one Leader cycle for every active brand."""
    for brand_id in _active_brand_ids():
        try:
            result = run_leader_cycle(brand_id)
            logger.info(
                "Leader cycle brand=%s spawned_search=%s spawned_research=%s "
                "assigned=%s lead_actions=%s",
                brand_id,
                result.spawned_search,
                result.spawned_research,
                result.communities_assigned,
                result.lead_actions_applied,
            )
        except Exception as exc:  # one brand failing must not stop the rest
            logger.exception("Leader cycle failed for brand=%s: %s", brand_id, exc)


def followup_sweep() -> None:
    """Run the outbound pipeline for every active brand (follow-ups + cold)."""
    for brand_id in _active_brand_ids():
        try:
            run_outbound_pipeline(brand_id)
        except Exception as exc:
            logger.exception("Follow-up sweep failed for brand=%s: %s", brand_id, exc)


def _ensure_job(job_id: str, func, minutes: int) -> None:
    """Add the interval job if missing, or reschedule it iff the interval changed."""
    if _scheduler is None:
        return
    if _scheduler.get_job(job_id) is None:
        _scheduler.add_job(
            func, "interval", minutes=minutes, id=job_id, max_instances=1, coalesce=True
        )
        _applied[job_id] = minutes
    elif _applied.get(job_id) != minutes:
        _scheduler.reschedule_job(job_id, trigger="interval", minutes=minutes)
        _applied[job_id] = minutes


def _remove_job(job_id: str) -> None:
    if _scheduler is None:
        return
    if _scheduler.get_job(job_id) is not None:
        _scheduler.remove_job(job_id)
    _applied.pop(job_id, None)


def apply_config() -> None:
    """Reconcile the live leader/follow-up jobs with the DB config (idempotent)."""
    if _scheduler is None:
        return
    enabled, leader_min, followup_min = _load_config()
    if enabled:
        _ensure_job(LEADER_JOB_ID, leader_tick, leader_min)
        _ensure_job(FOLLOWUP_JOB_ID, followup_sweep, followup_min)
    else:
        _remove_job(LEADER_JOB_ID)
        _remove_job(FOLLOWUP_JOB_ID)


# ─────────────────────────────────────────────────────────────────────────────
# Lifecycle + control
# ─────────────────────────────────────────────────────────────────────────────


def build_scheduler() -> BackgroundScheduler:
    """Construct the scheduler with just the config-watch job (not started).

    The leader/follow-up jobs are added/removed dynamically by ``apply_config``.
    """
    sched = BackgroundScheduler()
    sched.add_job(
        apply_config,
        "interval",
        minutes=WATCH_INTERVAL_MINUTES,
        id=WATCH_JOB_ID,
        max_instances=1,
        coalesce=True,
    )
    return sched


def start_scheduler() -> None:
    """Start the scheduler and apply the DB config immediately (idempotent)."""
    global _scheduler
    if _scheduler is None:
        _scheduler = build_scheduler()
        _scheduler.start()
        apply_config()  # don't wait a full minute for the first reconcile
        logger.info("Scheduler started (config-driven; watch every %dm).", WATCH_INTERVAL_MINUTES)


def shutdown_scheduler() -> None:
    """Stop the scheduler if running."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        _applied.clear()


def pause_scheduler() -> bool:
    """Pause all jobs (keeps the scheduler alive). False if not running."""
    if _scheduler is None:
        return False
    _scheduler.pause()
    return True


def resume_scheduler() -> bool:
    """Resume paused jobs. False if not running."""
    if _scheduler is None:
        return False
    _scheduler.resume()
    return True


def scheduler_status() -> dict:
    """Current state + each task job's next run time (for the control API/dashboard).

    The internal config-watch job is hidden — callers care about the leader and
    follow-up jobs only.
    """
    if _scheduler is None:
        return {"state": "stopped", "jobs": []}
    state = {0: "stopped", 1: "running", 2: "paused"}.get(_scheduler.state, "unknown")
    jobs = [
        {
            "id": j.id,
            "next_run_time": j.next_run_time.isoformat() if j.next_run_time else None,
        }
        for j in _scheduler.get_jobs()
        if j.id != WATCH_JOB_ID
    ]
    return {"state": state, "jobs": jobs}


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    start_scheduler()
    logger.info("Scheduler running. Ctrl-C to stop.")
    try:
        while True:
            time.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        shutdown_scheduler()
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    main()
