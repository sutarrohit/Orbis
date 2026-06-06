"""
routers/scheduler.py
─────────────────────
Control the autonomous clock (§10) over HTTP: start / pause / resume / stop the
Leader-cycle + follow-up-sweep jobs, and read its status.

These control the scheduler **in this process** — they work when the scheduler
runs inside the API (``SCHEDULER_ENABLED=true``). A standalone scheduler process
(`python -m agents.scheduler`) is controlled by stopping that process instead.

Wire into the app with::

    from routers import scheduler
    app.include_router(scheduler.router, prefix="/api", tags=["Scheduler"])
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agents import scheduler as sched
from agents.schemas.scheduler import SchedulerStatus

router = APIRouter()


@router.get("/agents/scheduler/status", response_model=SchedulerStatus)
def status() -> dict:
    """Current scheduler state and each job's next run time."""
    return sched.scheduler_status()


@router.post("/agents/scheduler/start", response_model=SchedulerStatus)
def start() -> dict:
    """Start the scheduler (idempotent)."""
    sched.start_scheduler()
    return sched.scheduler_status()


@router.post("/agents/scheduler/pause", response_model=SchedulerStatus)
def pause() -> dict:
    """Pause all jobs (the Leader stops firing until resumed)."""
    if not sched.pause_scheduler():
        raise HTTPException(status_code=409, detail="scheduler not running")
    return sched.scheduler_status()


@router.post("/agents/scheduler/resume", response_model=SchedulerStatus)
def resume() -> dict:
    """Resume paused jobs."""
    if not sched.resume_scheduler():
        raise HTTPException(status_code=409, detail="scheduler not running")
    return sched.scheduler_status()


@router.post("/agents/scheduler/stop", response_model=SchedulerStatus)
def stop() -> dict:
    """Stop the scheduler entirely (start again to resume firing)."""
    sched.shutdown_scheduler()
    return sched.scheduler_status()
