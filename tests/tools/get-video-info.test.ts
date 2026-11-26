import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { VideoInfo } from '../../src/api/types.js';
import { getVideoInfoHandler } from '../../src/tools/get-video-info/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const UNAUTHORIZED_TEXT = 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys';

const videoInfo: VideoInfo = {
	videoId: VIDEO_ID,
	title: 'Never Gonna Give You Up',
	durationSeconds: 213,
	thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
	publishedAt: '2009-10-25T06:57:33.000Z',
};

const VIDEO_INFO_JSON = `{
  "videoId": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "durationSeconds": 213,
  "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "publishedAt": "2009-10-25T06:57:33.000Z"
}`;

describe('get_video_info handler', () => {
	it('resolves the video id from a URL and returns the metadata as JSON', async () => {
		const api = createFakeApi();
		api.getVideoInfo.mockResolvedValue(videoInfo);

		const result = await getVideoInfoHandler({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, api);

		expect(api.getVideoInfo).toHaveBeenCalledTimes(1);
		expect(api.getVideoInfo).toHaveBeenCalledWith('dQw4w9WgXcQ');
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: VIDEO_INFO_JSON }]);
	});

	it('accepts a bare videoId', async () => {
		const api = createFakeApi();
		api.getVideoInfo.mockResolvedValue(videoInfo);

		await getVideoInfoHandler({ videoId: VIDEO_ID }, api);

		expect(api.getVideoInfo).toHaveBeenCalledWith(VIDEO_ID);
	});

	it('returns a tool error without calling the API when both url and videoId are missing', async () => {
		const api = createFakeApi();

		const result = await getVideoInfoHandler({}, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'url or videoId is required' }],
			isError: true,
		});
		expect(api.getVideoInfo).not.toHaveBeenCalled();
	});

	it('rejects a malformed videoId before calling the API', async () => {
		const api = createFakeApi();

		const result = await getVideoInfoHandler({ videoId: 'way-too-long-video-id' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'videoId must be an 11-character YouTube id' }],
			isError: true,
		});
		expect(api.getVideoInfo).not.toHaveBeenCalled();
	});

	it('maps UNAUTHORIZED to API-key guidance', async () => {
		const api = createFakeApi();
		api.getVideoInfo.mockRejectedValue(new ApiError('UNAUTHORIZED', 'Invalid API key', 401));

		const result = await getVideoInfoHandler({ videoId: VIDEO_ID }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: UNAUTHORIZED_TEXT }],
			isError: true,
		});
	});
});
