// src/lib/server/agent.ts
//
// Minimal agent: takes the incoming WhatsApp text and returns a reply,
// generated via Groq's free, OpenAI-compatible chat completions API.
//
// Keeps a small per-user rolling conversation history (keyed by the
// WhatsApp sender phone number) so the model can follow context across
// turns instead of answering each message in isolation.
//
// Backing store: Redis if REDIS_URL is configured (persists across
// restarts, works across instances); otherwise an in-process Map
// (wiped on restart, fine for local dev).

import { env } from '$env/dynamic/private';
import { redis } from './redis';
import { DEFAULT_MODEL, getUserModel } from './user-config';

const GROQ_API_KEY = env.GROQ_API_KEY;

// Max tokens per reply. Expose via env so you can raise/lower without a
// redeploy. WhatsApp caps a single text message at 4096 chars, so values
// much above ~1500 are wasted on long English replies.
const MAX_TOKENS = Number(env.GROQ_MAX_TOKENS ?? 500);

// How many prior turns to feed back to the model. Each "turn" is two
// messages (user + assistant), so 10 ≈ 5 exchanges. Groq's context
// window is large enough that this never matters at this scale; the
// cap mostly bounds token cost and latency.
const MAX_HISTORY_TURNS = 10;

// Idle conversations expire after this many seconds (24h). Keeps Redis
// memory bounded for inactive users without touching active ones.
const HISTORY_TTL_SECONDS = 24 * 60 * 60;

type Role = 'system' | 'user' | 'assistant';
type ChatMessage = { role: Role; content: string };

const SYSTEM_PROMPT =
	'You are a helpful WhatsApp assistant. Keep replies short and conversational, ' +
	'like a text message — a few sentences at most unless the user asks for detail.';

// ---- In-memory fallback (used when REDIS_URL is not set) ------------------

const memoryStore = new Map<string, ChatMessage[]>();

function memGet(from: string): ChatMessage[] {
	let history = memoryStore.get(from);
	if (!history) {
		history = [];
		memoryStore.set(from, history);
	}
	return history;
}

function memTrim(history: ChatMessage[]): void {
	if (history.length <= MAX_HISTORY_TURNS) return;
	const drop = history.length - MAX_HISTORY_TURNS;
	history.splice(0, drop);
}

// ---- Redis-backed implementation -----------------------------------------

function redisKey(from: string): string {
	return `whatsapp:history:${from}`;
}

async function redisGet(from: string): Promise<ChatMessage[]> {
	if (!redis) return [];
	const raw = await redis.lrange(redisKey(from), 0, -1);
	// lrange returns oldest-first only if we RPUSH'd; we LPUSH below, so
	// index 0 is newest. Reverse to chronological order before using.
	const parsed: ChatMessage[] = [];
	for (const entry of raw.reverse()) {
		try {
			parsed.push(JSON.parse(entry) as ChatMessage);
		} catch {
			// Skip malformed entries rather than blowing up the whole request.
		}
	}
	return parsed;
}

async function redisPush(from: string, msg: ChatMessage): Promise<void> {
	if (!redis) return;
	const key = redisKey(from);
	// LPUSH so newest is at index 0 (matches lrange reading pattern above).
	await redis.lpush(key, JSON.stringify(msg));
	// Keep only the most recent MAX_HISTORY_TURNS entries.
	await redis.ltrim(key, 0, MAX_HISTORY_TURNS - 1);
	// Refresh TTL on every write so active conversations don't expire.
	await redis.expire(key, HISTORY_TTL_SECONDS);
}

async function redisPop(from: string): Promise<void> {
	if (!redis) return;
	await redis.lpop(redisKey(from));
}

// ---- Public API ----------------------------------------------------------

async function getHistory(from: string): Promise<ChatMessage[]> {
	if (redis) return redisGet(from);
	return memGet(from);
}

async function pushMessage(from: string, msg: ChatMessage): Promise<void> {
	if (redis) return redisPush(from, msg);
	memGet(from).push(msg);
	memTrim(memGet(from));
}

async function popMessage(from: string): Promise<void> {
	if (redis) return redisPop(from);
	memGet(from).pop();
}

export async function getAgentReply(userMessage: string, from: string): Promise<string> {
	const model = (await getUserModel(from)) ?? DEFAULT_MODEL;
	const history = await getHistory(from);
	history.push({ role: 'user', content: userMessage });
	await pushMessage(from, { role: 'user', content: userMessage });

	const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

	const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${GROQ_API_KEY}`
		},
		body: JSON.stringify({
			model,
			max_tokens: MAX_TOKENS,
			messages
		})
	});

	const data = await res.json();

	if (!res.ok) {
		console.error('Groq API error (model=' + model + '):', data);
		// Roll back the user turn we just appended so a failed call doesn't
		// pollute the next attempt's context.
		await popMessage(from);
		return "Sorry, I'm having trouble responding right now.";
	}

	const reply = data.choices?.[0]?.message?.content ?? "Sorry, I didn't catch that.";
	await pushMessage(from, { role: 'assistant', content: reply });

	return reply;
}

// Wipes the per-user rolling conversation history. Used by the /clear
// WhatsApp command. Per-user model override is untouched.
export async function clearConversation(from: string): Promise<void> {
	if (redis) {
		await redis.del(redisKey(from));
		return;
	}
	memoryStore.delete(from);
}
