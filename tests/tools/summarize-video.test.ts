import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { SummaryResult } from '../../src/api/types.js';
import { summarizeVideoHandler } from '../../src/tools/summarize-video/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const YOUTU_BE_URL = 'https://youtu.be/dQw4w9WgXcQ';
const UNAUTHORIZED_TEXT = 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys';

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
	it('calls createSummary with the video ref and options, and returns the article JSON', async () => {
		const api = createFakeApi();
		api.createSummary.mockResolvedValue(summaryResult);

		const result = await summarizeVideoHandler({ url: YOUTU_BE_URL, lang: 'en', length: 'brief' }, api);

		expect(api.createSummary).toHaveBeenCalledTimes(1);
		expect(api.createSummary).toHaveBeenCalledWith({
			url: YOUTU_BE_URL,
			videoId: undefined,
			lang: 'en',
			length: 'brief',
			sourceLang: undefined,
		});
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: SUMMARY_JSON }]);
	});

	it('forwards sourceLang when it differs from the article language', async () => {
		const api = createFakeApi();
		api.createSummary.mockResolvedValue(summaryResult);

		await summarizeVideoHandler({ videoId: VIDEO_ID, lang: 'uk', sourceLang: 'en' }, api);

		expect(api.createSummary).toHaveBeenCalledWith({
			url: undefined,
			videoId: VIDEO_ID,
			lang: 'uk',
			length: undefined,
			sourceLang: 'en',
		});
	});

	it('returns a tool error without calling the API when both url and videoId are missing', async () => {
		const api = createFakeApi();

		const result = await summarizeVideoHandler({ lang: 'en' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'url or videoId is required' }],
			isError: true,
		});
		expect(api.createSummary).not.toHaveBeenCalled();
	});

	it('maps UNAUTHORIZED to API-key guidance', async () => {
		const api = createFakeApi();
		api.createSummary.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Invalid API key', 401));

		const result = await summarizeVideoHandler({ videoId: VIDEO_ID, lang: 'en' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: UNAUTHORIZED_TEXT }],
			isError: true,
		});
	});
});
