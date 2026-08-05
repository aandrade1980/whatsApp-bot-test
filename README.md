# WhatsApp Bot Test

A small WhatsApp webhook bot built with [SvelteKit](https://svelte.dev/). It receives
WhatsApp messages via the Meta Cloud API, forwards them to a language model on
[Groq](https://groq.com), and sends the generated reply back to the user. The bot
remembers the recent conversation per user (Redis-backed, in-memory fallback) so it
can follow context across turns.

## How it works

```
WhatsApp user  ──►  Meta Cloud API  ──►  /api/whatsapp/webhook  ──►  agent.ts (Groq)
                        ▲                                              │
                        └────────  whatsapp.ts (send reply)  ◄────────┘
                                            ▲
                                            │  per-user rolling history
                              ┌─────────────┴─────────────┐
                              │  Redis (REDIS_URL)        │
                              │  fallback: in-process Map │
                              └───────────────────────────┘
```

1. **`src/routes/api/whatsapp/webhook/+server.ts`** — handles `GET` (webhook
   verification handshake) and `POST` (incoming messages). The POST handler
   returns `200` immediately and processes the message out of band
   (fire-and-forget) so Meta never retries the webhook on slow Groq / Graph API
   calls (retries would cause duplicate replies).
2. **`src/lib/server/agent.ts`** — calls Groq's OpenAI-compatible chat completions
   endpoint with the incoming text and the user's recent history, then stores
   the assistant reply back into memory. Rolls back the appended user turn on
   Groq failure so the next attempt isn't polluted.
3. **`src/lib/server/whatsapp.ts`** — sends the reply back to the user via the
   WhatsApp Cloud API.
4. **`src/lib/server/redis.ts`** — singleton ioredis client. Exports `null` when
   `REDIS_URL` is unset, signalling the agent to fall back to an in-process Map.

### Conversation memory

Each WhatsApp sender (`from` phone number) has its own rolling history capped at
10 turns (~5 user/assistant exchanges). Memory is stored as a Redis list keyed
`whatsapp:history:<from>`, with a 24h TTL refreshed on every write, so idle
conversations expire automatically. On any read/write error or when Redis is
not configured, the agent transparently uses an in-process Map (wiped on restart).

| Store      | Persists across restarts | Works across instances | TTL expiry | Requires            |
| ---------- | ------------------------ | ---------------------- | ---------- | ------------------- |
| Redis      | yes                      | yes                    | yes (24h)  | `REDIS_URL` env var |
| In-process | no                       | no                     | no         | nothing (fallback)  |

## Prerequisites

- Node.js 20+ (or compatible runtime for SvelteKit's adapter-node)
- [pnpm](https://pnpm.io)
- A [Meta Developer](https://developers.facebook.com) account with a WhatsApp
  Business app configured.
- A [Groq](https://console.groq.com) API key.
- (Optional) A Redis 6+ instance for persistent conversation memory. Without
  one, the bot still works but forgets conversations on every restart. For
  Railway deploys, add the Redis plugin and reference its `REDIS_URL`.

## Prerequisites

- Node.js 20+ (or compatible runtime for SvelteKit's adapter-node)
- [pnpm](https://pnpm.io)
- A [Meta Developer](https://developers.facebook.com) account with a WhatsApp
  Business app configured.
- A [Groq](https://console.groq.com) API key.

## Setup

```sh
pn install
cp .env.example .env
# Fill in the values in .env (see comments in .env.example for where to get each one)
```

### Environment variables

See [`.env.example`](./.env.example) for a commented template:

| Variable                   | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| `WHATSAPP_VERIFY_TOKEN`    | Any random string. Meta echoes it back during webhook verification. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID from the Meta App Dashboard.                        |
| `WHATSAPP_ACCESS_TOKEN`    | System User access token with `whatsapp_business_messaging`.        |
| `GROQ_API_KEY`             | Groq API key for the LLM reply generation.                          |
| `REDIS_URL`                | (Optional) `redis://` or `rediss://` connection string. If set,     |
|                            | conversation memory persists in Redis; if unset, the bot falls back |
|                            | to an in-process Map (wiped on restart).                            |

> **Never commit `.env`.** It is in `.gitignore`. Keep secrets out of git history.

## Developing

```sh
pnpm dev
# or open in a new browser tab
pnpm dev -- --open
```

For local webhook testing, expose the dev server with a tunnel such as
[ngrok](https://ngrok.com) or [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```sh
pnpm dev            # in one terminal
ngrok http 5173     # in another
# Point the Meta webhook URL to https://<your-tunnel>.ngrok.app/api/whatsapp/webhook
```

## Building

```sh
pnpm build
pnpm preview
```

The production build uses [`@sveltejs/adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node).
Deploy the `.output/` directory to any Node host.

### Railway

The app is configured to deploy on [Railway](https://railway.app) from `main`:

1. Connect the repo to a Railway project, create a service from the GitHub repo.
2. Add the **Redis** plugin to the same project.
3. On the **app service**, add a reference variable `REDIS_URL` pointing at the
   Redis plugin's `REDIS_URL` (Dashboard → Variables → New → Reference Variable,
   or `railway variables set REDIS_URL=\${{redis.REDIS_URL}}`).
4. Add the other env vars (`WHATSAPP_*`, `GROQ_API_KEY`) to the app service.
5. Set the Meta webhook URL to `https://<your-service>.up.railway.app/api/whatsapp/webhook`.

The deploy should not log `"REDIS_URL not set"` if the reference variable is
wired correctly — that line means the bot is using the in-memory fallback.

## Useful commands

| Command        | Description                       |
| -------------- | --------------------------------- |
| `pnpm dev`     | Start dev server                  |
| `pnpm build`   | Create production build           |
| `pnpm preview` | Preview the production build      |
| `pnpm check`   | Type-check with `svelte-check`    |
| `pnpm lint`    | Run Prettier check + ESLint       |
| `pnpm format`  | Format the codebase with Prettier |
