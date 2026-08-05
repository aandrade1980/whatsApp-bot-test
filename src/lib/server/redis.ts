// src/lib/server/redis.ts
//
// Singleton ioredis client. Reads REDIS_URL from env. If unset (local dev
// without Redis running), exports null so callers can fall back to an
// in-memory store.

import { env } from '$env/dynamic/private';
import IORedis from 'ioredis';

let client: IORedis | null = null;

if (env.REDIS_URL) {
	client = new IORedis(env.REDIS_URL, {
		// Don't crash the app if Redis is briefly unreachable; surface errors
		// in the request path instead. ioredis reconnects automatically.
		maxRetriesPerRequest: 3,
		lazyConnect: true
	});

	client.on('error', (err) => {
		console.error('Redis client error:', err);
	});

	// Trigger the (lazy) connection so errors show up early in logs.
	void client.connect().catch((err) => {
		console.error('Redis initial connect failed; falling back per request:', err);
	});
} else {
	console.warn('REDIS_URL not set; conversation memory falls back to in-process Map.');
}

export const redis = client;
