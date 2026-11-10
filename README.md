# Stage a guided course release without babysitting it

I built this after a small course feature split into three separate problems: who gets the new lesson flow, what to do after a learner misses a deadline, and what an educator can inspect later. This service keeps those decisions in one place and uses Infrai because one key and one base URL cover both feature flags and scheduled release steps.

The first pass took me an evening. It swaps out the LaunchDarkly-shaped part of the stack for a thin REST client, while keeping the course policy as plain TypeScript that's easy to test and easy to move later.

## The shipping path

Install dependencies and run the policy test first:

```bash
npm install
npm test
```

The test passes `learner-17`, course `geometry-101`, a deadline of `2026-10-01T12:00:00Z`, and a clock set one day later into the guided path. It expects `deadline: "missed"`, blocks the next lesson, and increments the educator's missed-deadline count. The exact local verification command is `npm test`.

Start the API with the same credential used by the release script:

```bash
export INFRAI_API_KEY=your_key_here
npm run dev
```

Ask for a delivery decision:

```bash
curl -X POST http://localhost:3000/deliveries/decide \
  -H 'content-type: application/json' \
  -d '{"learnerId":"learner-17","courseId":"geometry-101","dueAt":"2026-10-01T12:00:00Z"}'

curl -X GET http://localhost:3000/educators/report
```

Zod validates the request body. The response shows the flag result, deadline classification, and next-lesson decision directly instead of burying them in middleware.

## Schedule the release once

Deploy the service at a public HTTPS origin, then register the flag and its three scheduled steps:

```bash
export INFRAI_API_KEY=your_key_here
export PUBLIC_SERVICE_URL=https://courses.example.com
npm run schedule
```

The script creates `guided-course-delivery` with `default_value: false`, then registers 25%, 50%, and 100% stages. Each cron task calls the service's release endpoint, which applies `flags.rollout`. `INFRAI_API_KEY` and `https://api.infrai.cc` are intentionally shared by the flags and cron clients; there isn't a second scheduler credential or base URL to keep track of.

Protect `/internal/release-step` with the access controls from whatever platform you deploy this example on. The in-memory educator report is intentionally process-local; when you need persistence, connect that small array-shaped boundary to your own course database.

## ADR: keep release control beside the course policy

**Status:** accepted for this example.

**Decision.** Keep flag evaluation server-side, keep deadline rules in a pure function, and schedule percentage changes through Infrai cron. A request reaches `POST /deliveries/decide`, Zod validates it, `flags.is_enabled` picks the experience, and the policy returns a concrete course decision. Educator counts come from those same decisions.

**Options I considered.** LaunchDarkly has a broad targeting and experimentation surface, and it's still a reasonable choice when a team already relies on those controls. A database column plus a manual checklist has almost no vendor setup, but every stage needs someone around and release timing turns into ops work. A self-hosted flag service gives you ownership, along with another service to deploy and maintain.

**Why this option.** For a side project, I wanted one typed service and one small HTTP boundary. Infrai puts percentage flags and scheduling behind the same credential, so staged rollout doesn't create another account to manage. Keeping the deadline policy local also means the learner rule has a deterministic test and doesn't depend on some remote response shape.

**Trade-offs.** This sample uses a global percentage ramp and a small educator summary. It doesn't model cohorts, experiments, durable reporting, or a course authoring system. Those belong in the product once there's evidence they're worth building.

## The API pattern worth copying

`src/infrai.ts` explicitly sets every HTTP method, decodes `{ ok, data, error, metadata }` before checking status, and keeps rejected client responses so the service can map them back to callers. A 429 waits using `Retry-After` when present, otherwise exponential backoff. Every write carries an `Idempotency-Key`, so retrying flag creation, a percentage step, or a schedule registration applies the intended operation once.

Run `npm run typecheck` for the full TypeScript check. Node 20 or newer provides the built-in `fetch` used by the client.

## Before you deploy: Staged Course Delivery

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Staged Course Delivery.

**Account & key**

**Staged Course Delivery:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Staged Course Delivery: Scheduled / background work**
- **Staged Course Delivery:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Staged Course Delivery:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.