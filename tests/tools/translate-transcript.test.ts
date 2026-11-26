import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { TranslateResult, TranslationJob } from '../../src/api/types.js';
import { translateTranscriptHandler } from '../../src/tools/translate-transcript/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const instantSleep = async () => {};

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

function makeTranslationJob(overrides: Partial<TranslationJob> = {}): TranslationJob {
	return {
		id: 'job_tr_1',
		kind: 'translation',
		status: 'succeeded',
		progress: { stage: 'saving', percent: 100 },
		result: translateResult,
		creditsCharged: 1,
		createdAt: '2026-11-26T10:00:00.000Z',
		startedAt: '2026-11-26T10:00:01.000Z',
		completedAt: '2026-11-26T10:00:08.000Z',
		...overrides,
	};
}

describe('translate_transcript handler', () => {
	it('returns cached 200 job immediately without polling and renders the header', async () => {
		const api = createFakeApi();
		api.submitTranslation.mockResolvedValue(makeTranslationJob());

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(api.submitTranslation).toHaveBeenCalledTimes(1);
		expect(api.submitTranslation).toHaveBeenCalledWith({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' });
		expect(api.getJob).not.toHaveBeenCalled();
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

	it('announces cache hits and uses creditsCharged from the job', async () => {
		const api = createFakeApi();
		api.submitTranslation.mockResolvedValue(makeTranslationJob({
			creditsCharged: 0,
			result: {
				...translateResult,
				cached: true,
				usage: { creditsCharged: 0, creditsRemaining: 18 },
			},
		}));

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

	it('polls 202 job to completion and sends progress notifications when progressToken is 0', async () => {
		const api = createFakeApi();
		const sendNotification = vi.fn(async () => {});
		api.submitTranslation.mockResolvedValue(makeTranslationJob({
			status: 'queued',
			progress: { stage: 'queued', percent: 0 },
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob
			.mockResolvedValueOnce(makeTranslationJob({
				status: 'running',
				progress: { stage: 'fetching_transcript', percent: 30 },
				result: undefined,
				creditsCharged: 0,
				completedAt: null,
			}))
			.mockResolvedValueOnce(makeTranslationJob());

		const result = await translateTranscriptHandler(
			{ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' },
			api,
			{ _meta: { progressToken: 0 }, sendNotification },
			{ sleep: instantSleep },
		);

		expect(api.getJob).toHaveBeenCalledTimes(2);
		expect(result.isError).toBeUndefined();
		expect(sendNotification.mock.calls).toEqual([
			[{ method: 'notifications/progress', params: { progressToken: 0, progress: 0, total: 100, message: 'Queued' } }],
			[{ method: 'notifications/progress', params: { progressToken: 0, progress: 30, total: 100, message: 'Fetching transcript' } }],
			[{ method: 'notifications/progress', params: { progressToken: 0, progress: 100, total: 100, message: 'Saving' } }],
		]);
	});

	it('returns an isError result with guidance when a translation job fails', async () => {
		const api = createFakeApi();
		api.submitTranslation.mockResolvedValue(makeTranslationJob({
			status: 'failed',
			progress: null,
			result: undefined,
			error: { code: 'TRANSCRIPT_EMPTY', message: 'Empty transcript' },
			creditsCharged: 0,
		}));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'The transcript for this video is empty, so there is no text to process.' }],
			isError: true,
		});
	});

	it('maps RATE_LIMITED to a retry hint using retryAfterSeconds', async () => {
		const api = createFakeApi();
		api.submitTranslation.mockRejectedValue(new ApiError('RATE_LIMITED', 'Too many requests', 429, 60));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Rate limited by the Unwatched API. Retry after 60 seconds.' }],
			isError: true,
		});
	});

	it('maps INSUFFICIENT_CREDITS to the top-up URL', async () => {
		const api = createFakeApi();
		api.submitTranslation.mockRejectedValue(new ApiError('INSUFFICIENT_CREDITS', 'Insufficient credits', 402));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Not enough Unwatched credits for this operation. Top up at https://unwatched.click/en/pricing' }],
			isError: true,
		});
	});

	it('falls back to code: message for unknown error codes', async () => {
		const api = createFakeApi();
		api.submitTranslation.mockRejectedValue(new ApiError('TRANSLATE_FAILED', 'Translation failed for this video.', 502));

		const result = await translateTranscriptHandler({ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'TRANSLATE_FAILED: Translation failed for this video.' }],
			isError: true,
		});
	});

	it('stops polling immediately when extra.signal aborts mid-poll', async () => {
		const api = createFakeApi();
		const controller = new AbortController();
		let polls = 0;
		const sleep = vi.fn(async () => {
			if (polls === 1) controller.abort();
		});
		api.submitTranslation.mockResolvedValue(makeTranslationJob({
			status: 'queued',
			progress: null,
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob.mockImplementation(async () => {
			polls += 1;
			return makeTranslationJob({
				status: 'running',
				progress: { stage: 'generating', percent: 50 },
				result: undefined,
				creditsCharged: 0,
				completedAt: null,
			});
		});

		const result = await translateTranscriptHandler(
			{ videoId: VIDEO_ID, sourceLang: 'en', targetLang: 'uk' },
			api,
			{ signal: controller.signal },
			{ sleep },
		);

		expect(api.getJob).toHaveBeenCalledTimes(1);
		expect(result.isError).toBe(true);
	});
});
