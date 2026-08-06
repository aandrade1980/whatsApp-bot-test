// src/lib/server/commands.ts
//
// Slash-command handler for /model and /clear. Returns a reply string the
// webhook sends back to the user instead of forwarding the message to the
// agent. Returns null when the incoming text is not a recognised command,
// meaning the webhook should fall through to getAgentReply.

import {
	DEFAULT_MODEL,
	KNOWN_MODELS,
	clearUserModel,
	getUserModel,
	setUserModel
} from './user-config';
import { clearConversation } from './agent';

export type CommandResult = {
	reply: string;
	// True if the consumed input should NOT be forwarded to the agent.
	handled: true;
};

const HELP_TEXT =
	'Commands:\n' +
	'• /model — show the model I use for you\n' +
	'• /model <name> — switch to a different Groq model\n' +
	'• /model list — show a few known models\n' +
	'• /model reset — go back to the default (' +
	DEFAULT_MODEL +
	')\n' +
	'• /clear — forget our conversation so far';

function normaliseModelName(input: string): string {
	return input.trim().toLowerCase();
}

export async function handleCommand(text: string, from: string): Promise<CommandResult | null> {
	const trimmed = text.trim();
	if (!trimmed.startsWith('/')) return null;

	const [head, ...rest] = trimmed.slice(1).split(/\s+/);
	const cmd = head.toLowerCase();
	const arg = rest.join(' ').trim();

	if (cmd === 'help' || cmd === 'start') {
		return { reply: HELP_TEXT, handled: true };
	}

	if (cmd === 'clear') {
		await clearConversation(from);
		return { reply: 'Conversation cleared.', handled: true };
	}

	if (cmd === 'model') {
		if (!arg) {
			const current = (await getUserModel(from)) ?? DEFAULT_MODEL;
			return {
				reply: `Your current model is ${current}.\nUse /model list for suggestions or /model <name> to switch.`,
				handled: true
			};
		}

		if (arg === 'list') {
			return {
				reply:
					'Known models:\n' +
					KNOWN_MODELS.map((m) => `• ${m}${m === DEFAULT_MODEL ? ' (default)' : ''}`).join('\n') +
					'\nYou can also try any other Groq model name with /model <name>.',
				handled: true
			};
		}

		if (arg === 'reset') {
			await clearUserModel(from);
			return { reply: `Model reset to default: ${DEFAULT_MODEL}`, handled: true };
		}

		const name = normaliseModelName(arg);
		const force = /--force$/i.test(name);
		const clean = force ? name.replace(/--force$/i, '').trim() : name;

		if (!force && !KNOWN_MODELS.includes(clean as (typeof KNOWN_MODELS)[number])) {
			return {
				reply: `"${clean}" isn't in my known list. Send /model list for suggestions, or /model ${clean} --force to try it anyway (Groq will reject if it's invalid).`,
				handled: true
			};
		}

		await setUserModel(from, clean);
		return { reply: `Model set to ${clean}. New replies will use it.`, handled: true };
	}

	// Unrecognised slash command — also handled (don't forward to agent).
	return {
		reply: `Unknown command "/${cmd}". Send /help for the list.`,
		handled: true
	};
}
