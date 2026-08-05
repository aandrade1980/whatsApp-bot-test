// src/routes/api/whatsapp/webhook/+server.ts
//
// Full loop: verify webhook, receive message, call agent, send reply.

import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAgentReply } from '$lib/server/agent';
import { sendWhatsAppMessage } from '$lib/server/whatsapp';

const VERIFY_TOKEN = env.WHATSAPP_VERIFY_TOKEN;

type WebhookPayload = {
	entry?: Array<{
		changes?: Array<{
			value?: {
				messages?: Array<{
					type: string;
					from: string;
					text: { body: string };
				}>;
				statuses?: unknown;
			};
		}>;
	}>;
};

export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('hub.mode');
	const token = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && token === VERIFY_TOKEN) {
		return new Response(challenge, { status: 200 });
	}

	return new Response('Forbidden', { status: 403 });
};

function processMessage(payload: WebhookPayload): void {
	try {
		const value = payload.entry?.[0]?.changes?.[0]?.value;
		const message = value?.messages?.[0];

		if (message?.type === 'text') {
			const from = message.from; // sender's phone number, e.g. "59899036337"
			const text = message.text.body;

			console.log(`Incoming WhatsApp message from ${from}: ${text}`);

			getAgentReply(text, from)
				.then(async (reply) => {
					await sendWhatsAppMessage(from, reply);
					console.log(`Sent reply to ${from}: ${reply}`);
				})
				.catch((err) => console.error(`Failed to reply to ${from}:`, err));
		} else if (value?.statuses) {
			console.log('Status update:', JSON.stringify(value.statuses));
		}
	} catch (err) {
		console.error('Error handling webhook payload:', err);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	// Fire-and-forget: Meta requires a fast 200; do the work out of band so
	// slow Groq/Meta calls don't trigger webhook retries (which cause dup replies).
	processMessage(body);

	return json({ status: 'ok' });
};
