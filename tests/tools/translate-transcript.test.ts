import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { TranslateResult } from '../../src/api/types.js';
import { translateTranscriptHandler } from '../../src/tools/translate-transcript/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';

const translateResult: TranslateResult = {
	videoId: VIDEO_ID,
	sourceLang: 'en',
	targetLang: 'uk',
	segments: [
		{ start: 0, end: 4.48, text: 'Ми не чужі для любові' },
		{ start: 61.2, end: 64.8, text: 'Ніколи не підведу тебе' },
	],
	cached: false,
	usage: { creditsCharged: 1, creditsRemaining: 18 },
};

describe('translate_transcript handler', () => {
	it('calls translateTranscript with all three languages and renders the header', async () => {
		const api = createFakeApi();
		api.translateTranscript.mockResolvedValue(translateResult);

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(api.translateTranscript).toHaveBeenCalledTimes(1);
		expect(api.translateTranscript).toHaveBeenCalledWith({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' });
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([
			{
				type: 'text',
				text: [
					'dQw4w9WgXcQ: en → uk  ·  2/2 segments  ·  credits charged: 1',
					'',
					'[00:00] Ми не чужі для любові',
					'[01:01] Ніколи не підведу тебе',
				].join('\n'),
			},
		]);
	});

	it('announces cache hits and the free charge', async () => {
		const api = createFakeApi();
		api.translateTranscript.mockResolvedValue({
			...translateResult,
			cached: true,
			usage: { creditsCharged: 0, creditsRemaining: 18 },
		});

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result.content).toEqual([
			{
				type: 'text',
				text: [
					'dQw4w9WgXcQ: en → uk  ·  2/2 segments  ·  credits charged: 0 (cache hit)',
					'',
					'[00:00] Ми не чужі для любові',
					'[01:01] Ніколи не підведу тебе',
				].join('\n'),
			},
		]);
	});

	it('maps RATE_LIMITED to a retry hint using retryAfterSeconds', async () => {
		const api = createFakeApi();
		api.translateTranscript.mockRejectedValue(new ApiError('RATE_LIMITED', 'Too many requests', 429, 60));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Rate limited by the Unwatched API. Retry after 60 seconds.' }],
			isError: true,
		});
	});

	it('maps INSUFFICIENT_CREDITS to the top-up URL', async () => {
		const api = createFakeApi();
		api.translateTranscript.mockRejectedValue(new ApiError('INSUFFICIENT_CREDITS', 'Insufficient credits', 402));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Not enough Unwatched credits for this operation. Top up at https://unwatched.click/en/pricing' }],
			isError: true,
		});
	});

	it('falls back to code: message for unknown error codes', async () => {
		const api = createFakeApi();
		api.translateTranscript.mockRejectedValue(new ApiError('TRANSLATE_FAILED', 'Translation failed for this video.', 502));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'TRANSLATE_FAILED: Translation failed for this video.' }],
			isError: true,
		});
	});
});
