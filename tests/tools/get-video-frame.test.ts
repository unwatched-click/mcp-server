import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { FramesResult } from '../../src/api/types.js';
import { getVideoFrameHandler } from '../../src/tools/get-video-frame/handler.js';
import { getVideoFrameInputSchema } from '../../src/tools/get-video-frame/schema.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const UNAUTHORIZED_TEXT = 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys';

const framesResult: FramesResult = {
	videoId: VIDEO_ID,
	video: {
		videoId: VIDEO_ID,
		title: 'Never Gonna Give You Up',
		durationSeconds: 213,
		thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
		publishedAt: '2009-10-25T06:57:33.000Z',
	},
	frames: [
		{
			seconds: 61.9,
			width: 480,
			imageUrl: 'https://frames.unwatched.click/dQw4w9WgXcQ/62-480.webp',
			base64: 'Zmlyc3QtZnJhbWUtYnl0ZXM=',
			cached: false,
			mimeType: 'image/webp',
		},
		{
			seconds: 120,
			width: 480,
			imageUrl: 'https://frames.unwatched.click/dQw4w9WgXcQ/120-480.webp',
			cached: true,
			mimeType: 'image/webp',
		},
	],
	usage: { creditsCharged: 1, creditsRemaining: 18 },
};

describe('get_video_frame handler', () => {
	it('requests inline frames and returns text plus image blocks', async () => {
		const api = createFakeApi();
		api.getFrames.mockResolvedValue(framesResult);

		const result = await getVideoFrameHandler({ videoId: VIDEO_ID, timestamps: [61.9, 120], width: 480 }, api);

		expect(api.getFrames).toHaveBeenCalledTimes(1);
		expect(api.getFrames).toHaveBeenCalledWith({
			url: undefined,
			videoId: VIDEO_ID,
			timestamps: [61.9, 120],
			width: 480,
			includeBase64: true,
		});
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([
			{
				type: 'text',
				text: [
					'Title: Never Gonna Give You Up',
					`Video: ${VIDEO_ID}  ·  Frames: 2`,
					'Credits charged: 1',
				].join('\n'),
			},
			{ type: 'text', text: '[01:01] https://frames.unwatched.click/dQw4w9WgXcQ/62-480.webp' },
			{ type: 'image', data: 'Zmlyc3QtZnJhbWUtYnl0ZXM=', mimeType: 'image/webp' },
			{ type: 'text', text: '[02:00] https://frames.unwatched.click/dQw4w9WgXcQ/120-480.webp (cached)' },
		]);
	});

	it('accepts a URL instead of a videoId', async () => {
		const api = createFakeApi();
		api.getFrames.mockResolvedValue(framesResult);

		await getVideoFrameHandler({ url: 'https://youtu.be/dQw4w9WgXcQ', timestamps: [61.9] }, api);

		expect(api.getFrames).toHaveBeenCalledWith({
			url: 'https://youtu.be/dQw4w9WgXcQ',
			videoId: undefined,
			timestamps: [61.9],
			width: undefined,
			includeBase64: true,
		});
	});

	it('caps the batch at MAX_FRAMES_PER_REQUEST in the input schema', () => {
		expect(getVideoFrameInputSchema.safeParse({ videoId: VIDEO_ID, timestamps: [1, 2, 3, 4, 5, 6] }).success).toBe(false);
		expect(getVideoFrameInputSchema.safeParse({ videoId: VIDEO_ID, timestamps: [0, 1, 2, 3, 4] }).success).toBe(true);
		expect(getVideoFrameInputSchema.safeParse({ videoId: VIDEO_ID, timestamps: [] }).success).toBe(false);
	});

	it('returns a tool error without calling the API when both url and videoId are missing', async () => {
		const api = createFakeApi();

		const result = await getVideoFrameHandler({ timestamps: [10] }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'url or videoId is required' }],
			isError: true,
		});
		expect(api.getFrames).not.toHaveBeenCalled();
	});

	it('maps UNAUTHORIZED to API-key guidance', async () => {
		const api = createFakeApi();
		api.getFrames.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Invalid API key', 401));

		const result = await getVideoFrameHandler({ videoId: VIDEO_ID, timestamps: [10] }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: UNAUTHORIZED_TEXT }],
			isError: true,
		});
	});
});
