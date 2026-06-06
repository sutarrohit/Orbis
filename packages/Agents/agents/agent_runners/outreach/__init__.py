"""The outbound state machine (Implentation.md §9) — exposes
``run_outbound_pipeline``. Pure deterministic code that walks leads through the
funnel (prospect → contacted → follow-ups → cold) and queues DMs into
``pending_send``; the LLM only writes the copy. Called each Leader cycle and is
safe to call manually."""

from .agent import run_outbound_pipeline

__all__ = ["run_outbound_pipeline"]
