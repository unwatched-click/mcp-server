/**
 * Failure of an Unwatched API call. `code` is the backend's `error.code`
 * (e.g. INVALID_REQUEST, UNAUTHORIZED, INSUFFICIENT_CREDITS, RATE_LIMITED,
 * SUBTITLE_FETCH_FAILED), or one of the client-side codes below.
 */
export class ApiError extends Error {
	constructor(
		readonly code: string,
		message: string,
		/** HTTP status; 0 when the request never got a response. */
		readonly status: number,
		/** Seconds from a `Retry-After` header, when the API sent one. */
		readonly retryAfterSeconds?: number,
		/** Resource server challenge for an expired or invalid OAuth access token. */
		readonly authChallenge?: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/** Client-side codes, used when the backend did not provide one. */
export const CLIENT_ERROR_CODES = {
	missingApiKey: 'MISSING_API_KEY',
	network: 'NETWORK_ERROR',
	timeout: 'TIMEOUT',
	badResponse: 'BAD_RESPONSE',
} as const;
