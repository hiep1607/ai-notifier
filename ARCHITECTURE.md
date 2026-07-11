# AI Notifier (Nofy) — Architecture at a Glance

> One-page English summary. Full engineering journey — every approach we tried, why it was dropped, and why the current one won — lives in [CONG_NGHE.md](CONG_NGHE.md) (Vietnamese).

**What it does:** describe what you want to watch in plain language → AI turns it into a *rule* → the system scans real sources 24/7 → you get notifications that match your topic/conditions, with links to the original articles.

## Stack

| Layer | Tech | Why |
|---|---|---|
| App (Android/iOS/Web) | React Native 0.81 + Expo SDK 54, Expo Router | One codebase for 3 platforms; OTA updates via EAS (ship JS fixes without re-releasing the APK) |
| Backend | Supabase: Postgres + RLS, Auth, Edge Functions (Deno), pg_cron + pg_net | Zero servers to run; row-level security enforces "users only see their own data" at the DB layer; AI keys never leave the server |
| AI | Google Gemini (server-side) with Search grounding + multi-model quota fallback | Real news with real URLs; free-tier quota is a hard constraint, so the whole scan pipeline is designed around it |
| Data providers | Open-Meteo, CoinGecko, open.er-api.com, Vietnamese news RSS | Real numbers for free — AI is reserved for jobs that actually need AI |
| Push | Expo Push API | One endpoint covers FCM + APNs; dead tokens are auto-pruned |
| Quality | TypeScript everywhere, Jest (140 tests), deploy-and-probe script | Server scheduling/dedup logic is extracted into a pure module so Jest tests the exact code that runs in production |

## How it works

```
User: "every morning at 8, send me trending GitHub projects"
   │
   ▼
[generate-rule]  Gemini → JSON rule (keyword, schedule, condition, watch URL);
                 asks a follow-up question when info is missing
   │
   ▼
[Postgres] ◄── pg_cron: main sweep every 15 min + a cheap per-minute tick
   │              (so time-pinned rules fire at HH:MM ±1 min, with an atomic
   ▼               claim to prevent double-fires and a 4h catch-up window)
[run-monitor]  Source router, cheapest first:
               reminder (no AI) → weather/crypto/FX APIs (no quota) →
               watched URL (feed first, then AI reads the page) →
               news RSS + AI picks → Gemini + Google Search (last resort)
   │
   ▼
Gates: condition met? value actually changed? duplicate of something
already sent? quiet hours? → insert notification + Expo push
```

## Design decisions that came from real failures

- **Cron is the only scheduler.** The app used to scan on open too → duplicate notifications and doubled quota burn. Now the client only reads.
- **Scheduled rules are appointments, not filters.** A missed 8:00 slot (quota/429) retries every 15 min for up to 4 hours — "late is better than never"; a per-minute tick makes the happy path accurate to the minute.
- **Never trust AI with URLs.** Model-written links were hallucinated; links now come from grounding metadata, RSS feeds, or an extracted list of real anchors the AI must choose from.
- **Dedup is layered** (normalized titles + normalized links + "already sent" titles injected into the prompt + content fingerprint hash-gate), because every single layer was added after a real duplicate-notification complaint.
- **Everything is best-effort.** A missing migration, a rate-limited model, or one broken source must never take down the whole background sweep.
- **Deploys are probed.** tsc/Jest don't cover Deno edge functions — a syntax error once shipped "successfully" and a function was silently down for 3 days. The deploy script now boot-probes every function immediately.

## Repo map

| File | Contents |
|---|---|
| [CONG_NGHE.md](CONG_NGHE.md) | Full tech-evolution write-up: tried → dropped → current, per area |
| [TINH_NANG.md](TINH_NANG.md) | Feature-by-feature behavior with examples |
| [KE_HOACH.md](KE_HOACH.md) | Plan, backlog, and the day-by-day engineering diary |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Architecture snapshot |
| `supabase/functions/` | Edge Functions: generate-rule, run-monitor, transcribe, admin-api |
| `supabase/migrations/` | Numbered SQL migrations (RLS, cron jobs, schema evolution) |
