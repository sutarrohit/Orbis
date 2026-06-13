import type { ComponentType } from "react";
import {
  Activity,
  Bot,
  CircleUser,
  Crown,
  Gauge,
  Lightbulb,
  type LucideProps,
  MessageSquare,
  MessagesSquare,
  Network,
  Rocket,
  Search,
  Settings,
  ShoppingCart,
  Target,
  Users,
  Workflow
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Icon = ComponentType<LucideProps>;

// ── What Orbis is, in one breath ────────────────────────────────────────────
// Orbis finds relevant Telegram communities, joins them, listens, scores people
// into leads, and reaches out — a squad of AI agents run by a Leader.

const PIPELINE: { step: string; detail: string }[] = [
  { step: "Find", detail: "Search discovers relevant Telegram communities and scores how well they fit your niche." },
  { step: "Join", detail: "The Leader assigns each community to one of your accounts; the gateway joins it on Telegram." },
  { step: "Listen", detail: "The gateway scrapes members and records messages, building a pool of real prospects." },
  { step: "Score", detail: "Research turns those people into leads, ranking who is worth reaching out to." },
  { step: "Engage", detail: "Talk replies to group messages and Sales handles DMs — every reply is a private DM, never a public blast." },
  { step: "Convert", detail: "The outbound pipeline sends first DMs and timed follow-ups until a lead replies, converts, or goes cold." }
];

const AGENTS: { name: string; icon: Icon; trigger: string; color: string; what: string }[] = [
  {
    name: "Leader",
    icon: Crown,
    trigger: "You, or the schedule",
    color: "text-amber-500",
    what: "The orchestrator. Each cycle it looks at your whole funnel, decides what to do, then spawns the other agents, assigns communities to accounts, and runs the outreach pipeline. Running the Leader is the single button that drives everything."
  },
  {
    name: "Search",
    icon: Search,
    trigger: "Leader / dashboard",
    color: "text-blue-500",
    what: "Hunts the web for pages listing Telegram communities in your niche, verifies they are real, and saves the good ones as 'pending' communities. It discovers — it does not join."
  },
  {
    name: "Research",
    icon: Network,
    trigger: "Leader / dashboard",
    color: "text-purple-500",
    what: "Scores people into leads. It reads the members and messages the gateway captured and decides who is a real prospect, how interested they are, and how to approach them."
  },
  {
    name: "Talk",
    icon: MessageSquare,
    trigger: "Automatic (per group message)",
    color: "text-emerald-500",
    what: "Watches the communities you joined. When someone says something relevant, it decides whether to reach out — always as a friendly private DM, never a public reply in the group."
  },
  {
    name: "Sales",
    icon: ShoppingCart,
    trigger: "Automatic (per inbound DM)",
    color: "text-rose-500",
    what: "Handles 1:1 DM conversations with known leads. It answers questions, handles objections, and guides them toward your goal — speaking only from the brand info you provide."
  }
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Describe your brand",
    body: "Go to Settings and fill in your niche, voice, short description, website, and the About / Knowledge box. The agents only ever speak from what you put here — they never make up facts, so the more you add, the better they sound."
  },
  {
    title: "Connect an account",
    body: "Open Accounts and connect a Telegram account (phone + code) or a Discord account (paste its user token). This is the identity that joins communities and sends DMs. Nothing can join or message until at least one account is connected and active."
  },
  {
    title: "Find communities",
    body: "From the Dashboard, run Search (or just run the Leader, which runs Search for you). Discovered groups appear on the Communities page as 'Pending'."
  },
  {
    title: "Join them",
    body: "Run the Leader. It assigns pending communities to your account and the system joins them, flipping them to 'Joined' and pulling in their members."
  },
  {
    title: "Score leads",
    body: "Run Research. It turns the captured members and messages into Leads, which show up on the Leads page with a score, interest level, and the community they came from."
  },
  {
    title: "Turn on Autonomous Mode",
    body: "In Settings → Squad Schedule, flip on Autonomous Mode. From then on the Leader runs on a schedule and the whole find → join → score → reach-out loop happens on its own — no buttons required."
  }
];

const LEAD_STAGES: { label: string; detail: string }[] = [
  { label: "New", detail: "Just discovered. Not contacted yet." },
  { label: "Prospect", detail: "Scored as worth reaching out to. The outbound pipeline will send a first DM." },
  { label: "Nurturing", detail: "They replied — Sales is now in a live conversation with them." },
  { label: "Converted", detail: "They took your goal action (e.g. booked a demo). Success." },
  { label: "Cold / Lost", detail: "No reply after follow-ups (cold), or a clear no (lost)." }
];

const PAGES: { name: string; icon: Icon; desc: string }[] = [
  { name: "Dashboard", icon: Rocket, desc: "Run agents manually and see what each one is doing right now." },
  { name: "Activity", icon: Activity, desc: "A live feed of every action the agents take." },
  { name: "Agent Config", icon: Bot, desc: "Tune each agent's persona, voice, and rules." },
  { name: "Accounts", icon: CircleUser, desc: "Connect and manage the Telegram & Discord accounts that do the work." },
  { name: "Communities", icon: Users, desc: "Every group found or joined, plus their members." },
  { name: "Leads", icon: Target, desc: "Scored prospects, their source community, and outreach status." },
  { name: "Learnings", icon: Lightbulb, desc: "Strategy notes the Leader writes for itself over time." },
  { name: "Conversations", icon: MessagesSquare, desc: "Messages captured from your communities." },
  { name: "Usage", icon: Gauge, desc: "Token spend across the agents." },
  { name: "Settings", icon: Settings, desc: "Your brand profile, the schedule, and account options." }
];

export default function HowToPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-4 pb-12">
      {/* Intro */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Rocket className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold">How to use Orbis</h1>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Orbis is an autonomous growth system for Telegram and Discord. It finds communities
          where your future customers hang out, joins them, listens, figures out who is worth
          talking to, and reaches out with personalized DMs — run by a small squad of AI agents and
          coordinated by a Leader. This page explains what each part does and how to get started.
        </p>
      </section>

      {/* How it works — the loop */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Workflow className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">How it works</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything Orbis does is one repeating loop. Each step feeds the next.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <Card key={p.step}>
              <CardContent className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="size-6 justify-center rounded-full p-0">
                    {i + 1}
                  </Badge>
                  <span className="font-medium">{p.step}</span>
                </div>
                <p className="text-sm text-muted-foreground">{p.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* The agent squad */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Meet the agents</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Each agent has one job. The LLM decides; strict code enforces the rules (rate limits,
          never message the same person twice, never spam a group).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {AGENTS.map((a) => (
            <Card key={a.name}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <a.icon className={`size-5 ${a.color}`} />
                    {a.name}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {a.trigger}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{a.what}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Getting started */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Rocket className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Getting started</h2>
        </div>
        <div className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <Card key={s.title}>
              <CardContent className="flex gap-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{s.title}</span>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Lead lifecycle */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">The life of a lead</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Every prospect moves through these stages. Outreach is paced automatically — a lead is
          never messaged twice, and follow-ups wait about two days between attempts.
        </p>
        <Card>
          <CardContent className="flex flex-col divide-y">
            {LEAD_STAGES.map((s) => (
              <div key={s.label} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
                <Badge variant="secondary" className="w-fit shrink-0 sm:w-28 sm:justify-center">
                  {s.label}
                </Badge>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Pages reference */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Your dashboard, page by page</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PAGES.map((p) => (
            <div key={p.name} className="flex items-start gap-3 rounded-lg border p-3">
              <p.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">{p.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Good to know */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Good to know</h2>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Agents only state facts you give them.</span>{" "}
              Fill in your brand description, website, and About box in Settings — the agents never
              invent pricing, features, or links.
            </p>
            <p>
              <span className="font-medium text-foreground">Discussion groups beat channels.</span>{" "}
              Broadcast channels hide their member list, so you mostly reach people through linked
              discussion groups. Communities aimed at chat groups generate more leads.
            </p>
            <p>
              <span className="font-medium text-foreground">Autonomous Mode is the on-switch for hands-off growth.</span>{" "}
              Once it is on, the Leader runs on a schedule and a lighter follow-up sweep keeps
              outreach moving — you can step away and just watch the Leads page fill up.
            </p>
            <p>
              <span className="font-medium text-foreground">Nothing sends without an active account.</span>{" "}
              Joining communities and sending DMs both need a connected, active Telegram or Discord
              account on the Accounts page.
            </p>
            <p>
              <span className="font-medium text-foreground">Discord servers are added by invite link.</span>{" "}
              Search discovers Telegram communities automatically; for Discord, add a server on the
              Communities page using its invite link, then assign it to a Discord account.
              Heads-up: automating Discord user accounts is against Discord&apos;s Terms of Service
              and the account may be banned — use a disposable one.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
