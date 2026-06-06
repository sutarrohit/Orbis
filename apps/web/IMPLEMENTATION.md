# Orbis Web — Frontend Implementation Plan

This document is the build plan for the `apps/web` dashboard. The backend (`apps/server`,
Hono + Prisma) exposes ~40 endpoints under `/api/v1`. The web app already has the plumbing
(better-auth client, React Query, `request()` wrapper, sidebar shell, shadcn/ui base
components); this plan fills in the 9 dashboard pages against those APIs.

## Status

| Area | State |
| --- | --- |
| Auth (sign-in/up, Google) | ✅ done |
| App shell + sidebar | ✅ done (nav needs Link/active fix) |
| React Query + `request()` wrapper | ✅ done |
| `lib/api/accounts` | ✅ done (replaces stale `connections`) |
| `lib/api/conversations` | ✅ done (rewritten to real endpoints) |
| `lib/api/enums.ts` | ✅ done |
| Dashboard pages | ⬜ stubs — built in Phases 1–8 below |

## API module conventions

Every domain lives in `lib/api/<domain>/` with two files:

- **`<domain>-apis.ts`** — exported `interface`s (request/response shapes, hand-written to
  mirror the server) + plain functions calling `request()`.
- **`<domain>-queries.ts`** — a `<domain>Keys` object + `queryOptions()` / `mutationOptions()`
  wrappers from `@tanstack/react-query`.

Shared enum string-unions live in `lib/api/enums.ts`. Reference pattern: `lib/api/accounts/*`.

## Page conventions

- Pages are client components (`"use client"`) using `useQuery(xQueryOptions())` /
  `useMutation(xMutationOptions())`.
- On mutation success: `queryClient.invalidateQueries({ queryKey })` + a `sonner` toast.
- Loading → `Skeleton`; no data → shared `<EmptyState>`; error → shared `<ErrorState>`.
- Strict TS with `noUncheckedIndexedAccess` — array/record access is `T | undefined`; handle it.
- Styling: semantic Tailwind tokens (`bg-muted`, `text-muted-foreground`) + shadcn variants;
  never raw colors.
- **Next.js 16**: read the relevant guide in `node_modules/next/dist/docs/` before using
  App Router APIs (middleware, `Link`, route handlers) — see `apps/web/AGENTS.md`.

## Endpoint reference (request → response)

All under base `/api/v1`; cookie-session auth; errors are `{ statusCode, message, stack? }`.

| Method | Path | Body / Query | Returns |
| --- | --- | --- | --- |
| GET | `/brand` | — | `{ brand: Brand & { profile } \| null }` |
| POST | `/brand` | `{ name, niche?, slug? }` | `Brand` |
| PUT | `/brand` | partial brand + profile fields | `Brand` |
| GET | `/accounts` | — | `Account[]` (with `communityCounts`) |
| PUT | `/accounts/:id` | `{ displayName?, status? }` | `Account` |
| DELETE | `/accounts/:id` | — | 204 |
| GET | `/communities` | `?status=` | `Community[]` |
| POST | `/communities` | `{ handle, name?, nicheRelevance?, source?, foundVia?, sourceUrl? }` | `Community` |
| PUT | `/communities/:id` | `{ name?, status?, nicheRelevance?, assignedAccountId?, groupChatId?, sourceUrl? }` | `Community` |
| GET | `/leads` | `?status=` | `{ data: Lead[], counts: Record<LeadStatus, number> }` |
| GET | `/leads/:id` | — | `Lead & { conversations: ConvMsg[] }` |
| PUT | `/leads/:id` | `{ status?, score?, interestLevel?, note?, recommendedApproach?, outreachStage? }` | `Lead` |
| GET | `/conversations` | `?community_id=&user_id=` | `Conversation[]` |
| POST | `/conversations/send` | `{ leadId, accountId, message }` | `PendingSend` |
| GET | `/group-members` | `?chatId=` | `{ data: GroupMember[], total }` |
| GET | `/activity` | `?since=&limit=&agent=&action=` | `Activity[]` |
| GET | `/learnings` | — | `Learning[]` |
| GET | `/usage` | `?days=` | `{ days, totals, byAgent[] }` |
| GET | `/agent-state` | — | `AgentState[]` |
| GET | `/agent-config` | — | `AgentConfig[]` |
| POST | `/agent-config` | `{ agentType, enabled?, voiceTags?, behaviorRules?, bannedTopics?, systemPrompt? }` | `AgentConfig` |
| GET | `/agents/scheduler/status` | — | `{ state, jobs[] }` |
| POST | `/agents/scheduler/:action` | action = start/pause/resume/stop | `{ state, jobs[] }` |
| POST | `/agents/search/run` | `{ queries?, limit?, useLlm?, firecrawlMode? }` | run result |
| POST | `/agents/research/run` | `{ useLlm? }` | run result |
| POST | `/agents/leader/run` | `{ useCheckpointer? }` | run result |
| POST | `/agents/accounts/send-code` | `{ phone }` | `{ status, account }` |
| POST | `/agents/accounts/verify-code` | `{ phone, code }` | `{ status, account }` |
| POST | `/agents/accounts/verify-password` | `{ phone, password }` | `{ status, account }` |

> Note: `/agents/*` Python-proxied routes return **snake_case** (`external_id`,
> `display_name`). Prefer the camelCase `/accounts` routes for reads; use `/agents/accounts/*`
> only for the Telegram login flow.

---

## Phase 0 — Foundation (prerequisite for everything)

**Goal:** shared building blocks, navigation, and route protection.

1. Add shadcn components (use the shadcn skill):
   ```
   pnpm dlx shadcn@latest add table badge dialog alert-dialog tabs select textarea switch checkbox sonner scroll-area
   ```
2. Mount `<Toaster />` (sonner) in `providers/index.tsx`.
3. `components/data/data-table-states.tsx` — `<LoadingRows>`, `<EmptyState>`, `<ErrorState>`.
4. `components/data/status-badge.tsx` — status string → `Badge` variant + label, per domain.
5. `lib/format.ts` — `formatRelativeTime(iso)`, `formatNumber(n)`.
6. `components/sidebar/app-sidebar.tsx` — replace `<a href>` with `next/link`; highlight the
   active item via `usePathname()`.
7. `apps/web/middleware.ts` — redirect unauthenticated `(dashboard)` requests to `/sign-in`
   (check the installed better-auth cookie helper + Next 16 middleware docs first).
8. Brand gate: in `app/(dashboard)/layout.tsx` (or a small client wrapper), fetch `GET /brand`;
   if `brand` is null redirect to `/onboarding`. Expose `lib/hooks/use-brand.ts` so pages can
   assume a brand exists.

**Files:** `providers/index.tsx`, `components/data/*`, `lib/format.ts`,
`components/sidebar/app-sidebar.tsx`, `middleware.ts`, `app/(dashboard)/layout.tsx`,
`lib/hooks/use-brand.ts`.

## Phase 1 — Brand onboarding + Settings

- `lib/api/brand/*`: `getBrand()`, `createBrand(input)`, `updateBrand(input)`. `Brand` includes
  nested `profile` (persona, productSummary, pricing, conversionAction, objectionNotes).
- `app/onboarding/page.tsx` — name/niche/slug form → `POST /brand` → redirect to `/`.
- `app/(dashboard)/settings/page.tsx` — edit brand + sales profile via `PUT /brand`; toast on save.

## Phase 2 — Accounts (+ Telegram login)

- API: `lib/api/accounts/*` (✅ already built) for list/update/delete. Add login helpers to
  `lib/api/agents/*`: `sendCode`, `verifyCode`, `verifyPassword` (each returns `{ status, account }`).
- `app/(dashboard)/accounts/page.tsx` — table (handle, platform, status badge, communityCounts,
  lastHealthCheckAt); status toggle (active/paused/restricted); delete via `AlertDialog`.
- `<ConnectAccountDialog>` — multi-step wizard driven by the login `status` field:
  phone → code → optional 2FA password → connected. Isolate in its own component.

## Phase 3 — Communities

- `lib/api/communities/*`: `listCommunities({status?})`, `createCommunity()`, `updateCommunity(id)`.
- `app/(dashboard)/communities/page.tsx` — status-filter `Tabs` (pending_join/joined/rejected);
  table (name, handle, nicheRelevance, status, assigned account); row actions: approve/reject,
  assign account (`Select` of accounts), add-community dialog.

## Phase 4 — Leads (list + detail + outreach)

- `lib/api/leads/*`: `listLeads({status?})` → `{ data, counts }`; `getLead(id)` (+ `conversations`);
  `updateLead(id, input)`. Reuse `sendMessage` from `lib/api/conversations` for DMs.
- `app/(dashboard)/leads/page.tsx` — status count cards/tabs from `counts`; table (username,
  score, interest badge, status, source, lastOutreachAt).
- `app/(dashboard)/leads/[id]/page.tsx` — editable lead fields, painPoints +
  recommendedApproach, recent conversation transcript, and a Send-DM composer (pick account +
  message → `sendMessage`).

## Phase 5 — Conversations

- API: `lib/api/conversations/*` (✅ already built).
- `app/(dashboard)/conversations/page.tsx` — recent message feed (latest 100), filterable by
  community/user, shown as a timeline or grouped by user.

## Phase 6 — Activity / Learnings / Usage / Group members

- `lib/api/activity/*`: `listActivity({since?, limit?, agent?, action?})` → filterable timeline
  with agent badge, action, expandable JSON `detail`, relative time.
- `lib/api/learnings/*`: `listLearnings()` → simple list/cards of strategy notes.
- `lib/api/usage/*`: `getUsage({days?})` → totals cards + per-agent token table.
- `lib/api/group-members/*`: `listGroupMembers({chatId?})` → table; surface via a community
  drill-in rather than a top-level nav item.

## Phase 7 — Agent Config

- `lib/api/agent-config/*`: `listAgentConfig()`, `upsertAgentConfig(input)` (POST upsert by `agentType`).
- `app/(dashboard)/agent-config/page.tsx` — `Tabs` per agent (leader/search/research/talk/sales);
  each tab: `enabled` switch, chip editors for `voiceTags` / `behaviorRules` / `bannedTopics`,
  `systemPrompt` textarea; save per agent.

## Phase 8 — Agent control + Dashboard home

- `lib/api/agents/*`: `getSchedulerStatus()`, `schedulerAction(action)`, `runSearch()`,
  `runResearch()`, `runLeader()`. `lib/api/agent-state/*`: `listAgentState()`.
- `app/(dashboard)/page.tsx` — replace the placeholder grid with: scheduler status +
  start/pause control, per-agent state cards (idle/running/error), lead status counts, token
  usage summary, recent-activity strip, and manual run-once buttons.

---

## Suggested order

Phases are dependency-ordered. **0 → 1 are prerequisites** (foundation + brand gate). Then
**2 → 3 → 4** form the core funnel (accounts → communities → leads). **5–8** can be done in any
order. Recommend one phase per PR with a review checkpoint between each.

## Verification

- Run `pnpm dev` (web :3000, server :4000). Ensure the server DB is migrated and seeded
  (`pnpm --filter @repo/api db:generate && db:migrate && db:seed`) so pages have data.
- Per phase: sign in → list loads, filters work, create/update/delete round-trips and the UI
  refetches, toasts fire, errors surface.
- Keep `pnpm exec tsc --noEmit` (in `apps/web`) and `pnpm lint` clean.
- Auth guard: a `(dashboard)` route while signed out redirects to `/sign-in`; a user with no
  brand lands on `/onboarding`.
