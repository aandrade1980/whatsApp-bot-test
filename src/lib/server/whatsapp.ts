// src/lib/server/whatsapp.ts
//
// Helper to send a WhatsApp text message via the Cloud API.

import { env } from '$env/dynamic/private';

const PHONE_NUMBER_ID = env.WHATSAPP_PHONE_NUMBER_ID; // e.g. 1322495560938883
const ACCESS_TOKEN = env.WHATSAPP_ACCESS_TOKEN; // your Meta access token
const GRAPH_API_VERSION = 'v21.0';

export async function sendWhatsAppMessage(to: string, text: string) {
	const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${ACCESS_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			messaging_product: 'whatsapp',
			to, // recipient phone number, e.g. "59899036337" (no + or leading 0s)
			type: 'text',
			text: { body: text }
		})
	});

	const data = await res.json();

	if (!res.ok) {
		console.error('Failed to send WhatsApp message:', data);
		throw new Error(`WhatsApp send failed: ${JSON.stringify(data)}`);
	}

	return data;
}
