import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from '../../api/errors.js';

const KEYS_URL = 'https://unwatched.click/en/developer/keys';
const PRICING_URL = 'https://unwatched.click/en/pricing';

/**
 * Maps a failure to text the agent can act on: which knob to turn (API key,
 * credits, wait) instead of an opaque error code. The API key itself is never
 * included — it travels in a header and never appears in error messages.
 */
export function describeError(err: unknown): string {
	if (err instanceof ApiError) {
		switch (err.code) {
			case 'MISSING_API_KEY':
			case 'UNAUTHORIZED':
				return 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). '
					+ `Get a key at ${KEYS_URL}`;
			case 'INSUFFICIENT_CREDITS':
				return `Not enough Unwatched credits for this operation. Top up at ${PRICING_URL}`;
			case 'RATE_LIMITED':
				return typeof err.retryAfterSeconds === 'number'
					? `Rate limited by the Unwatched API. Retry after ${err.retryAfterSeconds} seconds.`
					: 'Rate limited by the Unwatched API. Retry in a few seconds.';
			case 'INVALID_REQUEST':
				// The backend message says what was wrong with the input.
				return err.message;
			case 'TIMEOUT':
				return 'The request to the Unwatched API timed out. This is usually transient — retry later.';
			case 'NETWORK_ERROR':
				return 'Could not reach the Unwatched API. This is usually transient — retry later.';
			default:
				return `${err.code}: ${err.message}`;
		}
	}
	if (err instanceof Error && err.message) return err.message;
	return 'Unexpected error.';
}

/**
 * Surfaces failures as tool errors rather than protocol errors: the agent then
 * reads "you are out of credits" and can tell the user, instead of the call
 * blowing up opaquely.
 */
export async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
	try {
		return await fn();
	} catch (err) {
		return { content: [{ type: 'text', text: describeError(err) }], isError: true };
	}
}
