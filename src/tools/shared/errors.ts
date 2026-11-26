import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, CLIENT_ERROR_CODES } from '../../api/errors.js';
import type { ErrorCode } from '../../api/types.js';

const KEYS_URL = 'https://unwatched.click/en/developer/keys';
const PRICING_URL = 'https://unwatched.click/en/pricing';

const KEY_GUIDANCE =
	'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). '
	+ `Get a key at ${KEYS_URL}`;

type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES];
type ErrorGuidance = string | ((err: ApiError) => string);

/** Checked against the generated OpenAPI `ErrorCode` enum so stale codes fail typecheck. */
const API_ERROR_GUIDANCE: Partial<Record<ErrorCode, ErrorGuidance>> = {
	UNAUTHORIZED: KEY_GUIDANCE,
	// The backend message says whether the key is unknown, revoked or expired.
	INVALID_API_KEY: (err) => `${err.message} ${KEY_GUIDANCE}`,
	INSUFFICIENT_CREDITS: `Not enough Unwatched credits for this operation. See pricing at ${PRICING_URL}`,
	RATE_LIMITED: (err) => typeof err.retryAfterSeconds === 'number'
		? `Rate limited by the Unwatched API. Retry after ${err.retryAfterSeconds} seconds.`
		: 'Rate limited by the Unwatched API. Retry in a few seconds.',
	TOO_MANY_JOBS: 'Too many active jobs are running (maximum 3). Wait for a running job to finish and retry.',
	JOB_INTERRUPTED: 'The job was interrupted by a server restart and your credits were refunded. Safe to retry.',
	VIDEO_UNAVAILABLE: 'This video is unavailable (private, deleted, or removed) and cannot be processed.',
	TRANSCRIPT_EMPTY: 'The transcript for this video is empty, so there is no text to process.',
	GENERATION_FAILED: 'Generation failed while processing this video. Retry later.',
	// The backend message says what was wrong with the input.
	INVALID_REQUEST: (err) => err.message,
};

const CLIENT_ERROR_GUIDANCE: Partial<Record<ClientErrorCode, ErrorGuidance>> = {
	[CLIENT_ERROR_CODES.missingApiKey]: KEY_GUIDANCE,
	[CLIENT_ERROR_CODES.timeout]: 'The request to the Unwatched API timed out. This is usually transient — retry later.',
	[CLIENT_ERROR_CODES.network]: 'Could not reach the Unwatched API. This is usually transient — retry later.',
};

const GUIDANCE_BY_CODE = new Map<string, ErrorGuidance>([
	...Object.entries(API_ERROR_GUIDANCE),
	...Object.entries(CLIENT_ERROR_GUIDANCE),
]);

/**
 * Maps a failure to text the agent can act on: which knob to turn (API key,
 * credits, wait) instead of an opaque error code. The API key itself is never
 * included — it travels in a header and never appears in error messages.
 */
export function describeError(err: unknown): string {
	if (err instanceof ApiError) {
		if (err.authChallenge) return 'The Unwatched sign-in has expired or is invalid. Sign in again and retry.';
		const guidance = GUIDANCE_BY_CODE.get(err.code);
		if (typeof guidance === 'function') return guidance(err);
		if (typeof guidance === 'string') return guidance;
		return `${err.code}: ${err.message}`;
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
		return {
			content: [{ type: 'text', text: describeError(err) }],
			isError: true,
			...(err instanceof ApiError && err.authChallenge
				? { _meta: { 'mcp/www_authenticate': `${err.authChallenge}, error_description="Invalid or expired OAuth access token."` } }
				: {}),
		};
	}
}
