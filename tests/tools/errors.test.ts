import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import { describeError } from '../../src/tools/shared/errors.js';

const KEY_TEXT = 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys';

describe('describeError', () => {
	it('tells the agent how to fix a missing or invalid API key', () => {
		expect(describeError(new ApiError('MISSING_API_KEY', 'UNWATCHED_API_KEY is not set', 0))).toBe(KEY_TEXT);
		expect(describeError(new ApiError('UNAUTHORIZED', 'Invalid API key', 401))).toBe(KEY_TEXT);
	});

	it('points insufficient credits at the pricing page', () => {
		expect(describeError(new ApiError('INSUFFICIENT_CREDITS', 'Insufficient credits: 2 required, 1 available', 402)))
			.toBe('Not enough Unwatched credits for this operation. Top up at https://unwatched.click/en/pricing');
	});

	it('uses retryAfterSeconds for rate limits', () => {
		expect(describeError(new ApiError('RATE_LIMITED', 'Too many requests', 429, 42)))
			.toBe('Rate limited by the Unwatched API. Retry after 42 seconds.');
	});

	it('keeps a generic retry hint when the API sends no Retry-After', () => {
		expect(describeError(new ApiError('RATE_LIMITED', 'Too many requests', 429)))
			.toBe('Rate limited by the Unwatched API. Retry in a few seconds.');
	});

	it('passes INVALID_REQUEST messages through', () => {
		expect(describeError(new ApiError('INVALID_REQUEST', 'lang: String must contain at least 2 character(s)', 400)))
			.toBe('lang: String must contain at least 2 character(s)');
	});

	it('marks timeouts and network failures as transient', () => {
		expect(describeError(new ApiError('TIMEOUT', 'Request timed out after 30000ms', 0)))
			.toBe('The request to the Unwatched API timed out. This is usually transient — retry later.');
		expect(describeError(new ApiError('NETWORK_ERROR', 'fetch failed', 0)))
			.toBe('Could not reach the Unwatched API. This is usually transient — retry later.');
	});

	it('falls back to code: message for anything else', () => {
		expect(describeError(new ApiError('SERVICE_BUSY', 'Extraction capacity is saturated. Retry in a few seconds.', 503)))
			.toBe('SERVICE_BUSY: Extraction capacity is saturated. Retry in a few seconds.');
	});

	it('provides actionable guidance for async job and video failure codes', () => {
		expect(describeError(new ApiError('JOB_INTERRUPTED', 'Interrupted', 0)))
			.toBe('The job was interrupted by a server restart and your credits were refunded. Safe to retry.');
		expect(describeError(new ApiError('TOO_MANY_JOBS', 'Too many jobs', 429)))
			.toBe('Too many active jobs are already running for this API key (maximum 3). Wait for a running job to finish and retry.');
		expect(describeError(new ApiError('VIDEO_UNAVAILABLE', 'Private', 0)))
			.toBe('This video is unavailable (private, deleted, or removed) and cannot be processed.');
		expect(describeError(new ApiError('TRANSCRIPT_EMPTY', 'Empty', 0)))
			.toBe('The transcript for this video is empty, so there is no text to process.');
		expect(describeError(new ApiError('GENERATION_FAILED', 'Model failed', 0)))
			.toBe('Generation failed while processing this video. Retry later.');
	});

	it('handles non-ApiError throwables without crashing', () => {
		expect(describeError(new Error('boom'))).toBe('boom');
		expect(describeError('just a string')).toBe('Unexpected error.');
	});
});
