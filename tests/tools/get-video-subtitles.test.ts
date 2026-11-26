import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { SubtitlesResult } from '../../src/api/types.js';
import { getVideoSubtitlesHandler } from '../../src/tools/get-video-subtitles/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const WATCH_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const UNAUTHORIZED_TEXT = 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys';

const subtitlesResult: SubtitlesResult = {
	videoId: VIDEO_ID,
	lang: 'en',
	detectedLang: 'en',
	video: {
		videoId: VIDEO_ID,
		title: 'Never Gonna Give You Up',
		durationSeconds: 213,
		thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
		publishedAt: '2009-10-25T06:57:33.000Z',
	},
	segments: [
		{ start: 0, end: 4.48, text: "We're no strangers to love" },
		{ start: 61.2, end: 64.8, text: 'Never gonna give you up' },
		{ start: 3661.7, end: 3665, text: 'Never gonna let you down' },
	],
	tracks: [],
	cached: false,
	usage: { creditsCharged: 1, creditsRemaining: 19 },
};

describe('get_video_subtitles handler', () => {
	it('calls getSubtitles with the video ref and lang, and renders timestamped lines', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockResolvedValue(subtitlesResult);

		const result = await getVideoSubtitlesHandler({ url: WATCH_URL, lang: 'en' }, api);

		expect(api.getSubtitles).toHaveBeenCalledTimes(1);
		expect(api.getSubtitles).toHaveBeenCalledWith({ url: WATCH_URL, videoId: undefined, lang: 'en' });
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([
			{
				type: 'text',
				text: [
					'Title: Never Gonna Give You Up',
					`Video: ${VIDEO_ID}  ·  Language: en`,
					'Duration: 03:33',
					'Segments: 3/3',
					'Credits charged: 1',
					'',
					"[00:00] We're no strangers to love",
					'[01:01] Never gonna give you up',
					'[1:01:01] Never gonna let you down',
				].join('\n'),
			},
		]);
	});

	it('passes a bare videoId through', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockResolvedValue(subtitlesResult);

		await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(api.getSubtitles).toHaveBeenCalledWith({ url: undefined, videoId: VIDEO_ID, lang: undefined });
	});

	it('announces cache hits and the free charge', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockResolvedValue({
			...subtitlesResult,
			cached: true,
			usage: { creditsCharged: 0, creditsRemaining: 19 },
		});

		const result = await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(result.content).toEqual([
			{
				type: 'text',
				text: [
					'Title: Never Gonna Give You Up',
					`Video: ${VIDEO_ID}  ·  Language: en`,
					'Duration: 03:33',
					'Segments: 3/3',
					'Credits charged: 0 (cache hit)',
					'',
					"[00:00] We're no strangers to love",
					'[01:01] Never gonna give you up',
					'[1:01:01] Never gonna let you down',
				].join('\n'),
			},
		]);
	});

	it('truncates long transcripts and announces the cut', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockResolvedValue({
			...subtitlesResult,
			segments: [
				{ start: 0, end: 1, text: 'kept line' },
				{ start: 5, end: 6, text: 'x'.repeat(60_000) },
			],
		});

		const result = await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(result.content).toEqual([
			{
				type: 'text',
				text: [
					'Title: Never Gonna Give You Up',
					`Video: ${VIDEO_ID}  ·  Language: en`,
					'Duration: 03:33',
					'Segments: 1/2 (truncated to fit context)',
					'Credits charged: 1',
					'',
					'[00:00] kept line',
				].join('\n'),
			},
		]);
	});

	it('returns a tool error before calling the API when both url and videoId are missing', async () => {
		const api = createFakeApi();

		const result = await getVideoSubtitlesHandler({}, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'url or videoId is required' }],
			isError: true,
		});
		expect(api.getSubtitles).not.toHaveBeenCalled();
	});

	it('maps UNAUTHORIZED to API-key guidance', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Invalid API key', 401));

		const result = await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: UNAUTHORIZED_TEXT }],
			isError: true,
		});
	});

	it('maps INSUFFICIENT_CREDITS to the top-up URL', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockRejectedValue(new ApiError('INSUFFICIENT_CREDITS', 'Insufficient credits: 2 required, 1 available', 402));

		const result = await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Not enough Unwatched credits for this operation. Top up at https://unwatched.click/en/pricing' }],
			isError: true,
		});
	});

	it('maps RATE_LIMITED to a retry hint using retryAfterSeconds', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockRejectedValue(new ApiError('RATE_LIMITED', 'Too many requests', 429, 30));

		const result = await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Rate limited by the Unwatched API. Retry after 30 seconds.' }],
			isError: true,
		});
	});

	it('falls back to code: message for unknown error codes', async () => {
		const api = createFakeApi();
		api.getSubtitles.mockRejectedValue(new ApiError('SUBTITLE_FETCH_FAILED', 'Subtitle extraction failed for this video.', 502));

		const result = await getVideoSubtitlesHandler({ videoId: VIDEO_ID }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'SUBTITLE_FETCH_FAILED: Subtitle extraction failed for this video.' }],
			isError: true,
		});
	});
});
