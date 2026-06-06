"""
agents/scheduler.py — the clock (Implentation.md §10)
────────────────────────────────────────────────────────
LangGraph runs the Leader's logic *when triggered* — it does not trigger itself.
This scheduler is what wakes it (and runs the time-based follow-up sweep). Without
it, autonomous mode and follow-ups never fire; manual triggers still work.

Two jobs, per active brand:
  - **Leader cycle** — every ``LEADER_INTERVAL_MINUTES`` (default 5): run the full
    Leader graph (which also runs the outbound pipeline).
  - **Follow-up sweep** — every ``FOLLOWUP_INTERVAL_MINUTES`` (default 15): run the
    outbound pipeline on its own, so follow-ups/cold transitions still advance even
    if the (heavier, LLM-bound) Leader cycle is delayed or its model is down.

Both passes are idempotent (dedup keys + stage gating), so overlap is harmless.

Run inside the FastAPI app (set ``SCHEDULER_ENABLED=true``) or standalone:
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


def _active_brand_ids() -> list[str]:
    """Ids of brands the scheduler should drive."""
    with db.cursor() as cur:
        cur.execute("SELECT id FROM brand WHERE active = true")
        return [r[0] for r in cur.fetchall()]


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


def build_scheduler() -> BackgroundScheduler:
    """Construct the scheduler with both jobs (not started)."""
    sched = BackgroundScheduler()
    sched.add_job(
        leader_tick,
        "interval",
        minutes=settings.leader_interval_minutes,
        id="leader_cycle",
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        followup_sweep,
        "interval",
        minutes=settings.followup_interval_minutes,
        id="followup_sweep",
        max_instances=1,
        coalesce=True,
    )
    return sched


def start_scheduler() -> None:
    """Start the scheduler (idempotent)."""
    global _scheduler
    if _scheduler is None:
        _scheduler = build_scheduler()
        _scheduler.start()
        logger.info(
            "Scheduler started (leader every %dm, follow-up every %dm).",
            settings.leader_interval_minutes,
            settings.followup_interval_minutes,
        )


def shutdown_scheduler() -> None:
    """Stop the scheduler if running."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


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
    """Current state + each job's next run time (for the control API/dashboard)."""
    if _scheduler is None:
        return {"state": "stopped", "jobs": []}
    state = {0: "stopped", 1: "running", 2: "paused"}.get(_scheduler.state, "unknown")
    jobs = [
        {
            "id": j.id,
            "next_run_time": j.next_run_time.isoformat() if j.next_run_time else None,
        }
        for j in _scheduler.get_jobs()
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
