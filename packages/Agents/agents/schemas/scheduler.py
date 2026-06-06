"""
agents/schemas/scheduler.py
────────────────────────────
Response models for the scheduler control API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class JobInfo(BaseModel):
    id: str
    next_run_time: str | None = Field(
        default=None, description="ISO-8601 of the next fire, or null if paused."
    )


class SchedulerStatus(BaseModel):
    state: str = Field(description="running, paused, or stopped.")
    jobs: list[JobInfo] = Field(default_factory=list)
