// src/lib/server/user-config.ts
//
// Per-user configuration stored alongside conversation memory. Backed by
// Redis when REDIS_URL is set, transparently falls back to an in-process
// Map when it isn't (same pattern as agent.ts).
//
// Currently stores the per-user model override used by agent.ts.

import { env } from '$env/dynamic/private';
import { redis } from './redis';

// ---- Known models --------------------------------------------------------
//
// Not exhaustive — Groq's catalog rotates. Serves two purposes:
//   1. Validating what a user picks via /model <name>
//   2. Powering /model list with a sane default menu
//
// If a user wants a model that isn't listed, they can still set it via
// /model <name> --force; the agent will rely on Groq's own validation
// to reject truly unknown models.
// As of 2026-08, Groq's production text-generation models. Replace entries
// here when Groq deprecates a model — check https://console.groq.com/docs/deprecations.
export const KNOWN_MODELS = [
	'openai/gpt-oss-20b',
	'openai/gpt-oss-120b',
	'qwen/qwen3.6-27b',
	'llama-3.1-8b-instant',
	'llama-3.3-70b-versatile'
] as const;

// TTL mirrors conversation history so the override dies when memory does.
const CONFIG_TTL_SECONDS = 24 * 60 * 60;

const memoryStore = new Map<string, string>();

function userModelKey(from: string): string {
	return `whatsapp:model:${from}`;
}

export async function getUserModel(from: string): Promise<string | null> {
	if (redis) {
		const val = await redis.get(userModelKey(from));
		return val ?? null;
	}
	return memoryStore.get(from) ?? null;
}

export async function setUserModel(from: string, model: string): Promise<void> {
	if (redis) {
		await redis.set(userModelKey(from), model, 'EX', CONFIG_TTL_SECONDS);
		return;
	}
	memoryStore.set(from, model);
}

export async function clearUserModel(from: string): Promise<void> {
	if (redis) {
		await redis.del(userModelKey(from));
		return;
	}
	memoryStore.delete(from);
}

// Default model used when no env and no per-user override is set.
// Groq announced llama-3.1-8b-instant shutdown for 2026-08-16, so we default
// to its recommended replacement: openai/gpt-oss-20b (fast, free-tier friendly).
// Override per deployment via GROQ_MODEL.
export const DEFAULT_MODEL = env.GROQ_MODEL ?? 'openai/gpt-oss-20b';
