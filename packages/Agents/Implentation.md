# Agent Layer — IMPLEMENTATION.md

Implementation guide for PostPilot's five-agent squad. **Scope: the agent layer
only** — reasoning, orchestration, and the deterministic executors around them.

Assumed to already exist (not built here):

- **FastAPI** — control plane (auth, dashboard API, buttons) **and the scheduler/clock**.
- **Postgres** — all data and the source of truth ("the noticeboard").
- **Gateway** — a **separate, already-running service** (Pyrogram / discord.py)
  that is the *only* thing touching Telegram/Discord. Talk and Sales run inside it.

---

## 1. Core principle (do not violate)

> The LLM makes judgments; deterministic code executes them. Agents never act freely.

Every agent does the same three steps:

1. **Read** what it needs from Postgres (never reads the platform directly).
2. **Decide** — one LLM call that returns a **typed Pydantic object** (a plan / a score).
3. **Execute** — plain Python applies the decision under hard rules (rate limits,
   dedup, the funnel state machine). The LLM output is data, never an action.

Agents coordinate **only through Postgres**. No agent-to-agent messaging.

---

## 2. Stack (agent layer)

| Concern | Tech |
| --- | --- |
| Leader loop + branching + durable state | LangGraph |
| The AI brain | LangChain `init_chat_model` |
| Clean, fixed-format output | LangChain `.with_structured_output()` |
| Decision / score schemas | Pydantic v2 |
| Durable Leader state | langgraph-checkpoint-postgres |
| Data / bus / source of truth | Postgres *(existing)* |
| Control plane + scheduler | FastAPI *(existing)* |
| Platform transport | Gateway *(separate, existing)* |

```bash
pip install -U "langchain[openai]" langgraph langgraph-checkpoint-postgres \
               pydantic apscheduler
```

> No OpenRouter for now (single provider). Library APIs move fast — confirm
> `init_chat_model`, `.with_structured_output()`, and `PostgresSaver` against
> current LangChain / LangGraph docs before relying on them. Set the actual model
> string you're using.

---

## 3. Two kinds of agent (read this first)

Not all five roles run the same way. This drives the whole implementation.

| Type | Agents | How it runs | Initiates action? |
| --- | --- | --- | --- |
| **Spawnable worker** | Search, Research | run once on demand or by the Leader; read/write DB; finish | yes — goes and does a task |
| **Message-triggered handler** | Talk, Sales | live inside the gateway; fire per inbound message | no — only *reacts* |
| **Orchestrator** | Leader | long-lived poller; triggers workers, sets conditions for handlers | indirectly |

Key consequences:

- **Search discovers but does not join.** It saves group handles with
  `status = pending_join`. The **gateway** joins and scrapes members later.
- **Talk and Sales are not "run" — they react.** You cannot start the Talk agent
  and have it begin posting. It fires when a message arrives in a group your
  account already joined (and stays silent ~90% of the time). Sales fires when a
  lead sends a DM. Both live in the separate gateway.
- **The Leader never touches the platform** and never "runs" Talk/Sales. It
  spawns Search/Research, assigns communities, activates accounts, and queues
  outbound DMs. Talking then happens on its own inside the gateway.

---

## 4. Directory layout

```
agents/
  __init__.py
  llm.py                 # the brain: init_chat_model + with_structured_output
  schemas.py             # Pydantic v2 decision/score models
  db.py                  # repository functions (the bus)
  guardrails.py          # rate limits, dedup, account selection, is_running
  roles/
    leader.py            # LangGraph graph + nodes
    search.py            # spawnable worker
    research.py          # spawnable worker
    talk.py              # handler the gateway calls per group message
    sales.py             # handler the gateway calls per DM
  outreach.py            # outbound state machine executor
  scheduler.py           # APScheduler jobs (registered into the FastAPI app)
```

---

## 5. Foundations

### 5.1 The brain (`llm.py`)

One place builds models. `init_chat_model` creates the brain;
`.with_structured_output(schema)` forces a validated Pydantic object out.

```python
from langchain.chat_models import init_chat_model

MODEL = "openai:gpt-5.4"          # set to the model you actually use
_model = init_chat_model(MODEL)

def brain(schema):
    """Return a runnable that outputs a validated instance of `schema`."""
    return _model.with_structured_output(schema)

# usage:
#   plan = await brain(LeaderPlan).ainvoke(prompt)   # -> LeaderPlan instance
```

Write good docstrings and field descriptions on your schemas — with
`with_structured_output`, the class name, docstring, and field descriptions are
effectively added to the prompt. Log every call's token usage into `token_usage`.

### 5.2 Decision schemas (`schemas.py`)

The LLM only ever returns one of these. If validation fails, the worker fails
loudly — it never half-executes free-form text.

```python
from pydantic import BaseModel, Field
from typing import Literal

# ---- Leader ----
class GatewayAction(BaseModel):
    account_id: str
    action: Literal["activate", "pause"]
    reason: str

class LeadAction(BaseModel):
    lead_id: int
    new_status: Literal["nurturing", "cold", "lost", "converted"]
    note: str = ""

class LeaderPlan(BaseModel):
    """The Leader's plan for this cycle."""
    spawn_search: bool = False
    spawn_research: bool = False
    gateway_actions: list[GatewayAction] = []
    lead_actions: list[LeadAction] = []
    new_learnings: list[str] = []
    strategy_notes: str = ""

# ---- Research ----
class ScoredLead(BaseModel):
    user_id: str
    score: int = Field(ge=0, le=100)
    interest_level: Literal["hot", "warm", "cool", "skip"]
    pain_points: list[str] = []
    recommended_approach: str

class ResearchResult(BaseModel):
    inbound_leads: list[ScoredLead] = []
    outbound_prospects: list[ScoredLead] = []

# ---- Search ----
class FoundCommunity(BaseModel):
    handle: str               # @name or t.me/... link
    name: str
    niche_relevance: int = Field(ge=0, le=100)

class SearchResult(BaseModel):
    communities: list[FoundCommunity] = []

# ---- Talk / Sales (per message) ----
class ReplyDecision(BaseModel):
    should_reply: bool        # Talk: usually False (~0.9 of the time)
    message: str = ""         # phrased for a private DM, not a group blast
    flag_as_lead: bool = False
    lead_score: int | None = None
```

### 5.3 DB access (`db.py`) — the bus

Repository functions are the only way agents touch state.

- `communities`: Search → Leader/Gateway
- `pending_sends`: Leader/outreach → Gateway
- `group_members`: Gateway → Research
- `conversations`: Gateway → Research/Leader
- `leads`: Research → Leader → Gateway(Sales)
- `learnings`, `agent_activity`, `agent_state`, `token_usage`: any → dashboard

Keep all writes idempotent via natural unique keys: `(brand_id, user_id)` on
leads, `(user_id, group_chat_id)` on members, a dedup key on `pending_sends`.

---

## 6. Dual entry points: manual AND automatic

Write each agent as **one standalone function**. Never put agent logic inside the
Leader. The Leader calls the same function you'd call manually.

```python
# roles/research.py — the ONE place Research lives
async def run_research(brand_id: int) -> ResearchResult:
    if await is_running(brand_id, "research"):     # guard: never double-run
        return ResearchResult()
    await set_state(brand_id, "research", "running")
    try:
        snapshot = await db.load_research_inputs(brand_id)
        result = await brain(ResearchResult).ainvoke(render_research_prompt(snapshot))
        await db.save_leads_and_prospects(brand_id, result)
        return result
    finally:
        await set_state(brand_id, "research", "idle")
```

Both modes call it:

```python
# MANUAL — FastAPI endpoint (a dashboard button)
@router.post("/agents/research/run")
async def manual_research(brand_id: int):
    return await run_research(brand_id)

# AUTOMATIC — inside the Leader's execute node
if plan.spawn_research:
    await run_research(brand_id)        # same function, different caller
```

The `is_running` guard (backed by `agent_state`) makes this safe: if you click
"Run" while the Leader also triggers it, the second call is a no-op. This is the
rule "never spawn a worker already running," and it protects both directions.

---

## 7. The five agents

### 7.1 Search (spawnable worker)

Web-search for relevant Telegram handles → save as `communities` with
`status = pending_join` + relevance estimate. **Does not join.** After the LLM
returns `SearchResult`, run a regex pass over the raw text to catch any missed
`t.me/...` / `@handle` and save those too.

### 7.2 Research (spawnable worker)

Skips if no data. Two passes:

- **Inbound**: analyze recent conversations → people who showed interest →
  `ScoredLead` → save `status = new`.
- **Outbound**: pull `group_members` with a username, not already a lead, not yet
  DM'd → score on bio relevance + activity + niche fit → save the good ones as
  `status = prospect, source = outbound` with a recommended approach.

Thresholds: prospect save ≥ 50; auto-DM ≥ 60. Bands: 80–100 hot, 60–79 warm,
40–59 cool, < 40 skip.

### 7.3 Talk (message-triggered handler, in the gateway)

The gateway calls this per inbound **group** message. Returns `ReplyDecision`.
Default is **silence** (`should_reply = False`) ~90% of the time. Engage only on a
real question / pain point / natural opening. Any reply is phrased to be sent as a
**private DM**, never a public group blast. Flags interested users as leads.

### 7.4 Sales (message-triggered handler, in the gateway)

The gateway calls this per inbound **DM** from a known lead. Uses the sales
persona + knowledge base: understand situation → present product/pricing → handle
objections → guide to the conversion action. Respects dedup + rate limits. Writes
the outcome back to the lead.

> Talk and Sales are functions exposed to the **separate gateway service**; they
> take a message + context and return a `ReplyDecision`. They are not spawned and
> not triggered by the Leader.

### 7.5 Leader (orchestrator) — see §8.

---

## 8. Leader as a LangGraph graph

The only stateful, branching role → model it as a LangGraph graph. Workers stay as
plain functions (§6).

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver

class LeaderState(TypedDict):
    brand_id: int
    snapshot: dict
    plan: LeaderPlan | None

async def load_state(state: LeaderState) -> LeaderState:
    state["snapshot"] = await db.load_full_state(state["brand_id"])
    return state

async def decide(state: LeaderState) -> LeaderState:
    prompt = render_leader_prompt(state["snapshot"])   # funnel + hard rules
    state["plan"] = await brain(LeaderPlan).ainvoke(prompt)
    return state

async def execute(state: LeaderState) -> LeaderState:
    plan, brand_id = state["plan"], state["brand_id"]
    await save_and_propagate_learnings(plan.new_learnings)
    if plan.spawn_search and not await is_running(brand_id, "search"):
        await run_search(brand_id)
    if plan.spawn_research and not await is_running(brand_id, "research"):
        await run_research(brand_id)
    await auto_assign_communities_round_robin(brand_id)   # capped
    await apply_gateway_actions(plan.gateway_actions)
    await apply_lead_actions(plan.lead_actions)
    await run_outbound_pipeline(brand_id)                 # §9
    return state

builder = StateGraph(LeaderState)
builder.add_node("load", load_state)
builder.add_node("decide", decide)
builder.add_node("execute", execute)
builder.add_edge(START, "load")
builder.add_edge("load", "decide")
builder.add_edge("decide", "execute")
builder.add_edge("execute", END)

with PostgresSaver.from_conn_string(DB_URL) as checkpointer:
    leader_graph = builder.compile(checkpointer=checkpointer)
```

**Decision rules** (put in the `decide` prompt *and* re-check in `execute`):

- joined communities < 5 → spawn Search
- joined ≥ 5 and scoreable members > 20 → spawn Research (not Search)
- joined ≥ 10 → don't spawn Search unless goals demand it
- prospects > 0 → outbound DMs go automatically (no worker needed)
- never spawn a worker already running

Use a per-brand `thread_id` so the checkpointer keeps each brand's state separate.

---

## 9. Outbound state machine (`outreach.py`)

Pure deterministic code, run each Leader cycle, gated by `max_dms_per_day` per
account. The LLM only writes the *copy*; code drives the transitions.

```
prospect (stage 0, score ≥ 60)
  └─ dedup passes ─ generate warm first DM ─ queue send ─ status=contacted, stage=1
contacted (stage 1) + 48h no reply ─ follow-up #1 ─ queue ─ stage=2
contacted (stage 2) + 48h no reply ─ final follow-up ─ queue ─ stage=3
contacted (stage 3) + 48h no reply ─ status=cold
contacted (any stage) + user replied ─ status=nurturing
```

- **Dedup gate before every first DM**: skip if anyone has already DM'd this user.
- **Account selection**: prefer the account assigned to the lead's source
  community; else least-busy active account.
- **Queue, don't send**: write to `pending_sends`; the gateway delivers it.
- `converted` / `lost` are terminal.

### Outbound copy standard (gate on generated DMs)

Sound human; context → one value point → one soft next step; 2–5 sentences,
< 120 words; reference the lead's group/message/bio; plain text, no emojis; no
hype, guarantees, fake urgency, or repeated CTAs; at most one question; never
invent pricing or claims. Regenerate any draft that fails this.

---

## 10. The clock (scheduler — lives inside FastAPI)

LangGraph runs the Leader's logic *when triggered* — it does not trigger itself.
The scheduler is what wakes it and runs time-based work. Register APScheduler in
your FastAPI app (no separate process needed):

- **Leader cycle** — every 5 minutes (min 30s gap), invoke `leader_graph` for each
  active brand, using that brand's `thread_id`.
- **Follow-up sweep** — every ~15 minutes, scan `leads` in `contacted` whose
  `last_outreach_at` is > 48h old and advance them through §9.

Without this, autonomous mode and the follow-ups never fire. Manual mode (the
buttons in §6) still works regardless.

---

## 11. Guardrails (`guardrails.py`) — deterministic only

Never trust the LLM to self-limit. Enforce in code:

- Global per-brand limits: `max_groups_per_account` (10), `max_dms_per_day` (15),
  `max_group_replies_per_day` (30).
- Dedup: one person is never DM'd by two accounts — detect and flag violations.
- Account health gating: only `active` accounts act; skip paused/restricted ones.
- `is_running(brand_id, agent_type)` — the double-run guard used by §6 and §8.
- Idempotency: every queued send carries a dedup key so retries can't double-send.

---

## 12. Observability

- Write every meaningful action to `agent_activity` (API keys redacted).
- Maintain `agent_state` (status, current_task, started_at) for the dashboard and
  the `is_running` guard.
- Log `token_usage` per LLM call.
- Optional: LangSmith tracing of the Leader graph (it maps onto the activity feed).

---

## 13. Build order

1. `schemas.py` + `llm.py` + `db.py` + `guardrails.py` (foundations).
2. **Research** worker end-to-end (scores into `leads`) — proves decide→execute.
3. **Outreach** state machine + dedup/rate-limit guards + `pending_sends`.
4. **Leader** graph wiring the above.
5. **Scheduler** in FastAPI (Leader cycle + follow-up sweep) — turns on autonomy.
6. **Search** worker.
7. **Talk** + **Sales** handler functions, exposed to the gateway service.
8. Observability polish.

---

## 14. Operational & compliance note

Automated outbound DMs from Telegram **user** accounts run against Telegram's
terms and trigger spam enforcement (account restrictions/bans). At scale the real
bottleneck is account health and deliverability, not the agent code. Design for
explicit consent where possible, conservative pacing, per-account health
monitoring, and prefer inbound/opt-in flows. Decide your policy stance before
scaling outbound.