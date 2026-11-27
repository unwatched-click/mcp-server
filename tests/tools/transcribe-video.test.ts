import { describe, expect, it, vi } from 'vitest';
import type { TranscriptionJob, TranscriptionResult } from '../../src/api/types.js';
import { transcribeVideoHandler } from '../../src/tools/transcribe-video/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const VIDEO_URL = `https://youtu.be/${VIDEO_ID}`;
const transcript: TranscriptionResult = {
	videoId: VIDEO_ID,
	video: {
		videoId: VIDEO_ID,
		title: 'Video without subtitles',
		durationSeconds: 450,
		thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`,
		publishedAt: null,
	},
	lang: 'uk',
	method: 'hybrid',
	segments: [{ start: 0, end: 3, text: 'Рука малює коло.', kind: 'visual' }],
	cached: false,
	usage: { creditsCharged: 2.5, creditsRemaining: 17.5 },
};

function makeJob(overrides: Partial<TranscriptionJob> = {}): TranscriptionJob {
	return {
		id: 'job_ai_1',
		kind: 'transcription',
		status: 'succeeded',
		progress: { stage: 'saving', percent: 100 },
		result: transcript,
		creditsCharged: 2.5,
		createdAt: '2026-11-26T10:00:00.000Z',
		startedAt: '2026-11-26T10:00:01.000Z',
		completedAt: '2026-11-26T10:00:10.000Z',
		...overrides,
	};
}

describe('transcribe_video handler', () => {
	it('polls with progress and returns timed visual descriptions with their kind intact', async () => {
		const api = createFakeApi();
		const signal = new AbortController().signal;
		const sendNotification = vi.fn(async () => {});
		api.submitTranscription.mockResolvedValue(makeJob({
			status: 'queued',
			progress: { stage: 'queued', percent: 0 },
			result: undefined,
			creditsCharged: 0,
			startedAt: null,
			completedAt: null,
		}));
		api.getJob
			.mockResolvedValueOnce(makeJob({
				status: 'running',
				progress: { stage: 'transcribing', percent: 50 },
				result: undefined,
				creditsCharged: 0,
				completedAt: null,
			}))
			.mockResolvedValueOnce(makeJob());

		const result = await transcribeVideoHandler(
			{ url: VIDEO_URL, lang: 'uk' },
			api,
			{ signal, _meta: { progressToken: 'transcription' }, sendNotification },
			{ sleep: async () => {} },
		);

		expect(api.submitTranscription).toHaveBeenCalledWith({ url: VIDEO_URL, videoId: undefined, lang: 'uk' }, { signal });
		expect(api.getJob).toHaveBeenCalledTimes(2);
		expect(api.getJob).toHaveBeenCalledWith('job_ai_1', { signal });
		expect(result.isError).toBeUndefined();
		const { video, lang, method, segments, cached, usage } = transcript;
		expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ video, lang, method, segments, cached, usage }, null, 2) }]);
		expect(sendNotification.mock.calls).toEqual([
			[{ method: 'notifications/progress', params: { progressToken: 'transcription', progress: 0, total: 100, message: 'Queued' } }],
			[{ method: 'notifications/progress', params: { progressToken: 'transcription', progress: 50, total: 100, message: 'Transcribing' } }],
			[{ method: 'notifications/progress', params: { progressToken: 'transcription', progress: 100, total: 100, message: 'Saving' } }],
		]);
	});

	it('returns a free cached transcript immediately and allows the API to default lang', async () => {
		const api = createFakeApi();
		const cachedTranscript: TranscriptionResult = {
			...transcript,
			lang: 'en',
			method: 'whisper',
			segments: [{ start: 0, end: 3, text: 'Hello.' }],
			cached: true,
			usage: { creditsCharged: 0, creditsRemaining: 17.5 },
		};
		api.submitTranscription.mockResolvedValue(makeJob({ result: cachedTranscript, creditsCharged: 0 }));

		const result = await transcribeVideoHandler({ videoId: VIDEO_ID }, api);

		expect(api.submitTranscription).toHaveBeenCalledWith({ url: undefined, videoId: VIDEO_ID, lang: undefined });
		expect(api.getJob).not.toHaveBeenCalled();
		expect(result.isError).toBeUndefined();
		const { video, lang, method, segments, cached, usage } = cachedTranscript;
		expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ video, lang, method, segments, cached, usage }, null, 2) }]);
	});

	it('requires a video reference before submitting a job', async () => {
		const api = createFakeApi();

		const result = await transcribeVideoHandler({}, api);

		expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'url or videoId is required' }] });
		expect(api.submitTranscription).not.toHaveBeenCalled();
	});
});
