import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { ApiJob, SummaryResult } from '../../src/api/types.js';
import { summarizeVideoHandler } from '../../src/tools/summarize-video/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const YOUTU_BE_URL = 'https://youtu.be/dQw4w9WgXcQ';
const UNAUTHORIZED_TEXT = 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys';
const instantSleep = async () => {};

const summaryResult: SummaryResult = {
	article: {
		title: 'Never Gonna Give You Up, explained',
		intro: "The video that became the internet's favorite bait-and-switch.",
		sections: [
			{ heading: 'The prank', body: 'The link looks like something else entirely.' },
		],
		keyPoints: ['Released in 1987', 'Became known as rickrolling in 2007'],
		conclusion: 'A harmless internet classic.',
	},
	video: {
		videoId: VIDEO_ID,
		title: 'Never Gonna Give You Up',
		durationSeconds: 213,
		thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
		publishedAt: '2009-10-25T06:57:33.000Z',
	},
	cached: false,
	usage: { creditsCharged: 2, creditsRemaining: 17 },
};

function makeSummaryJob(overrides: Partial<ApiJob> = {}): ApiJob {
	return {
		id: 'job_sum_1',
		kind: 'summary',
		status: 'succeeded',
		progress: { stage: 'saving', percent: 100 },
		result: summaryResult,
		creditsCharged: 2,
		createdAt: '2026-11-26T10:00:00.000Z',
		startedAt: '2026-11-26T10:00:01.000Z',
		completedAt: '2026-11-26T10:00:10.000Z',
		...overrides,
	};
}

const SUMMARY_JSON = `{
  "video": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Never Gonna Give You Up",
    "durationSeconds": 213,
    "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    "publishedAt": "2009-10-25T06:57:33.000Z"
  },
  "article": {
    "title": "Never Gonna Give You Up, explained",
    "intro": "The video that became the internet's favorite bait-and-switch.",
    "sections": [
      {
        "heading": "The prank",
        "body": "The link looks like something else entirely."
      }
    ],
    "keyPoints": [
      "Released in 1987",
      "Became known as rickrolling in 2007"
    ],
    "conclusion": "A harmless internet classic."
  },
  "cached": false,
  "usage": {
    "creditsCharged": 2,
    "creditsRemaining": 17
  }
}`;

describe('summarize_video handler', () => {
	it('returns cached 200 succeeded job immediately without polling', async () => {
		const api = createFakeApi();
		api.submitSummary.mockResolvedValue(makeSummaryJob());

		const result = await summarizeVideoHandler({ url: YOUTU_BE_URL, lang: 'en', length: 'brief' }, api);

		expect(api.submitSummary).toHaveBeenCalledTimes(1);
		expect(api.submitSummary).toHaveBeenCalledWith({
			url: YOUTU_BE_URL,
			videoId: undefined,
			lang: 'en',
			length: 'brief',
			sourceLang: undefined,
		});
		expect(api.getJob).not.toHaveBeenCalled();
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: SUMMARY_JSON }]);
	});

	it('forwards sourceLang when it differs from the article language', async () => {
		const api = createFakeApi();
		api.submitSummary.mockResolvedValue(makeSummaryJob());

		await summarizeVideoHandler({ videoId: VIDEO_ID, lang: 'uk', sourceLang: 'en' }, api);

		expect(api.submitSummary).toHaveBeenCalledWith({
			url: undefined,
			videoId: VIDEO_ID,
			lang: 'uk',
			length: undefined,
			sourceLang: 'en',
		});
	});

	it('polls 202 job to completion and sends progress notifications when progressToken is set', async () => {
		const api = createFakeApi();
		const sendNotification = vi.fn(async () => {});
		api.submitSummary.mockResolvedValue(makeSummaryJob({
			status: 'queued',
			progress: { stage: 'queued', percent: 0 },
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob
			.mockResolvedValueOnce(makeSummaryJob({
				status: 'running',
				progress: { stage: 'generating', percent: 50 },
				result: undefined,
				creditsCharged: 0,
				completedAt: null,
			}))
			.mockResolvedValueOnce(makeSummaryJob());

		const result = await summarizeVideoHandler(
			{ videoId: VIDEO_ID, lang: 'en' },
			api,
			{ _meta: { progressToken: 'tok-summary' }, sendNotification },
			{ sleep: instantSleep },
		);

		expect(api.getJob).toHaveBeenCalledTimes(2);
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: SUMMARY_JSON }]);
		expect(sendNotification.mock.calls).toEqual([
			[{ method: 'notifications/progress', params: { progressToken: 'tok-summary', progress: 0, total: 100, message: 'Queued' } }],
			[{ method: 'notifications/progress', params: { progressToken: 'tok-summary', progress: 50, total: 100, message: 'Generating' } }],
			[{ method: 'notifications/progress', params: { progressToken: 'tok-summary', progress: 100, total: 100, message: 'Saving' } }],
		]);
	});

	it('does not send progress notifications when progressToken is omitted', async () => {
		const api = createFakeApi();
		const sendNotification = vi.fn(async () => {});
		api.submitSummary.mockResolvedValue(makeSummaryJob({
			status: 'queued',
			progress: { stage: 'queued', percent: 0 },
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob.mockResolvedValueOnce(makeSummaryJob());

		const result = await summarizeVideoHandler(
			{ videoId: VIDEO_ID, lang: 'en' },
			api,
			{ sendNotification },
			{ sleep: instantSleep },
		);

		expect(result.isError).toBeUndefined();
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it('returns an isError result with guidance when the job fails', async () => {
		const api = createFakeApi();
		api.submitSummary.mockResolvedValue(makeSummaryJob({
			status: 'queued',
			progress: null,
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob.mockResolvedValueOnce(makeSummaryJob({
			status: 'failed',
			progress: null,
			result: undefined,
			error: { code: 'JOB_INTERRUPTED', message: 'Worker restarted' },
			creditsCharged: 0,
		}));

		const result = await summarizeVideoHandler(
			{ videoId: VIDEO_ID, lang: 'en' },
			api,
			undefined,
			{ sleep: instantSleep },
		);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'The job was interrupted by a server restart and your credits were refunded. Safe to retry.' }],
			isError: true,
		});
	});

	it('returns an isError timeout message containing job id and re-attach instructions', async () => {
		const api = createFakeApi();
		api.submitSummary.mockResolvedValue(makeSummaryJob({
			id: 'job_sum_slow',
			status: 'queued',
			progress: null,
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob.mockResolvedValue(makeSummaryJob({
			id: 'job_sum_slow',
			status: 'running',
			progress: { stage: 'generating', percent: 40 },
			result: undefined,
			creditsCharged: 0,
			completedAt: null,
		}));

		const result = await summarizeVideoHandler(
			{ videoId: VIDEO_ID, lang: 'en' },
			api,
			undefined,
			{ sleep: instantSleep, pollIntervalMs: 5000, maxWaitMs: 10_000 },
		);

		expect(result.isError).toBe(true);
		const text = (result.content[0] as { type: 'text'; text: string }).text;
		expect(text).toContain('job_sum_slow');
		expect(text).toContain('server-side');
		expect(text).toContain('same input');
	});

	it('returns a tool error without calling the API when both url and videoId are missing', async () => {
		const api = createFakeApi();

		const result = await summarizeVideoHandler({ lang: 'en' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'url or videoId is required' }],
			isError: true,
		});
		expect(api.submitSummary).not.toHaveBeenCalled();
	});

	it('maps UNAUTHORIZED to API-key guidance', async () => {
		const api = createFakeApi();
		api.submitSummary.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Invalid API key', 401));

		const result = await summarizeVideoHandler({ videoId: VIDEO_ID, lang: 'en' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: UNAUTHORIZED_TEXT }],
			isError: true,
		});
	});
});
