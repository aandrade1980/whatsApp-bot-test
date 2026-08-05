// src/lib/server/agent.ts
//
// Minimal agent: takes the incoming WhatsApp text and returns a reply,
// generated via Groq's free, OpenAI-compatible chat completions API.

import { env } from '$env/dynamic/private';

const GROQ_API_KEY = env.GROQ_API_KEY;

// llama-3.1-8b-instant is fast and free — good for prototyping.
// Swap to "llama-3.3-70b-versatile" if you want stronger reasoning
// at a bit more latency, still free tier.
const MODEL = 'llama-3.1-8b-instant';

export async function getAgentReply(userMessage: string): Promise<string> {
	const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${GROQ_API_KEY}`
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 500,
			messages: [
				{
					role: 'system',
					content:
						'You are a helpful WhatsApp assistant. Keep replies short and conversational, ' +
						'like a text message — a few sentences at most unless the user asks for detail.'
				},
				{ role: 'user', content: userMessage }
			]
		})
	});

	const data = await res.json();

	if (!res.ok) {
		console.error('Groq API error:', data);
		return "Sorry, I'm having trouble responding right now.";
	}

	return data.choices?.[0]?.message?.content ?? "Sorry, I didn't catch that.";
}
