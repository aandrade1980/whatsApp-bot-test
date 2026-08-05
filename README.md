# WhatsApp Bot Test

A small WhatsApp webhook bot built with [SvelteKit](https://svelte.dev/). It receives
WhatsApp messages via the Meta Cloud API, forwards them to a language model on
[Groq](https://groq.com), and sends the generated reply back to the user.

## How it works

```
WhatsApp user  ──►  Meta Cloud API  ──►  /api/whatsapp/webhook  ──►  agent.ts (Groq)
                       ▲                                              │
                       └────────  whatsapp.ts (send reply)  ◄────────┘
```

1. **`src/routes/api/whatsapp/webhook/+server.ts`** — handles `GET` (webhook
   verification handshake) and `POST` (incoming messages).
2. **`src/lib/server/agent.ts`** — calls Groq's OpenAI-compatible chat completions
   endpoint with the incoming text and returns a short reply.
3. **`src/lib/server/whatsapp.ts`** — sends the reply back to the user via the
   WhatsApp Cloud API.

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

## Useful commands

| Command        | Description                       |
| -------------- | --------------------------------- |
| `pnpm dev`     | Start dev server                  |
| `pnpm build`   | Create production build           |
| `pnpm preview` | Preview the production build      |
| `pnpm check`   | Type-check with `svelte-check`    |
| `pnpm lint`    | Run Prettier check + ESLint       |
| `pnpm format`  | Format the codebase with Prettier |
