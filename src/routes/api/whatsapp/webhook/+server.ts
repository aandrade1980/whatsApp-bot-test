// src/routes/api/whatsapp/webhook/+server.ts
//
// Full loop: verify webhook, receive message, call agent, send reply.

import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAgentReply } from '$lib/server/agent';
import { sendWhatsAppMessage } from '$lib/server/whatsapp';

const VERIFY_TOKEN = env.WHATSAPP_VERIFY_TOKEN;

export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('hub.mode');
	const token = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && token === VERIFY_TOKEN) {
		return new Response(challenge, { status: 200 });
	}

	return new Response('Forbidden', { status: 403 });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	try {
		const entry = body.entry?.[0];
		const change = entry?.changes?.[0];
		const value = change?.value;
		const message = value?.messages?.[0];

		if (message?.type === 'text') {
			const from = message.from; // sender's phone number, e.g. "59899036337"
			const text = message.text.body;

			console.log(`Incoming WhatsApp message from ${from}: ${text}`);

			// Call the agent, then send the reply back — don't await this inline
			// with the response, but for a first version this is fine since
			// Meta just needs a fast 200, which we send below regardless.
			const reply = await getAgentReply(text);
			await sendWhatsAppMessage(from, reply);

			console.log(`Sent reply to ${from}: ${reply}`);
		} else if (value?.statuses) {
			console.log('Status update:', JSON.stringify(value.statuses));
		}
	} catch (err) {
		console.error('Error handling webhook payload:', err);
	}

	return json({ status: 'ok' });
};
