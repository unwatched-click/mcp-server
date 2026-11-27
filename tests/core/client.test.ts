import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getJobRetryAfterSeconds } from '../../src/api/contract.js';
import { ApiClient } from '../../src/http/client.js';
import { ApiError, CLIENT_ERROR_CODES } from '../../src/api/errors.js';
import type { ApiJob } from '../../src/api/types.js';
import { version } from '../../src/utils/version.js';

const KEY = 'unw_sk_test-secret-key';
const BASE = 'https://api.test';

/** Minimal stand-in matching how the client calls fetch: (url, init). */
type FetchCall = [Parameters<typeof fetch>[0], RequestInit | undefined];

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

describe('ApiClient request shape', () => {
	const fetchMock = vi.fn(async (): Promise<Response> => jsonResponse({ ok: true }));
	let client: ApiClient;

	beforeEach(() => {
		// A Response body can be consumed once, so never reuse instances: give
		// the mock a fresh default implementation for every test.
		fetchMock.mockReset();
		fetchMock.mockImplementation(async (): Promise<Response> => jsonResponse({ ok: true }));
		client = new ApiClient(KEY, { baseUrl: BASE, fetch: fetchMock });
	});

	function lastCall(): FetchCall {
		const calls = fetchMock.mock.calls as unknown as FetchCall[];
		return calls[calls.length - 1];
	}

	function headersOf(init: RequestInit | undefined): Record<string, string> {
		return (init?.headers ?? {}) as Record<string, string>;
	}

	it('POSTs subtitles with auth, JSON headers and body', async () => {
		const input = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', lang: 'en' };
		const result = await client.getSubtitles(input);

		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/subtitles`);
		expect(init?.method).toBe('POST');
		expect(headersOf(init)).toEqual({
			Authorization: `Bearer ${KEY}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': `unwatched-click-mcp/${version}`,
		});
		expect(JSON.parse(String(init?.body))).toEqual(input);
		expect(result).toEqual({ ok: true });
	});

	it('GETs video info and unwraps { video }', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ video: { videoId: 'abc', title: 'T' } }));
		const video = await client.getVideoInfo('dQw4w9WgXcQ');

		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/videos/dQw4w9WgXcQ`);
		expect(init?.method).toBe('GET');
		expect(init?.body).toBeUndefined();
		expect(headersOf(init)['Content-Type']).toBeUndefined();
		expect(video).toEqual({ videoId: 'abc', title: 'T' });
	});

	it('URL-encodes path segments', async () => {
		await client.listSubtitleTracks('a b/c?');
		const [url] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/videos/a%20b%2Fc%3F/tracks`);
	});

	it('POSTs frames', async () => {
		const input = { videoId: 'abc', timestamps: [1, 2], width: 320, includeBase64: true };
		await client.getFrames(input);
		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/frames`);
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual(input);
	});

	it('POSTs transcript translation and parses 202 + Location + Retry-After', async () => {
		const queuedJob: ApiJob = {
			id: 'job_tr_1',
			kind: 'translation',
			status: 'queued',
			progress: { stage: 'queued', percent: 0 },
			creditsCharged: 0,
			createdAt: '2026-11-26T10:00:00.000Z',
			startedAt: null,
			completedAt: null,
		};
		fetchMock.mockResolvedValueOnce(jsonResponse(queuedJob, 202, {
			location: '/api/v1/jobs/job_tr_1',
			'retry-after': '5',
		}));
		const input = { videoId: 'abc', sourceLang: 'uk', targetLang: 'en' };
		const job = await client.submitTranslation(input);
		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/transcripts/translate`);
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual(input);
		expect(job).toEqual(queuedJob);
		expect(getJobRetryAfterSeconds(job)).toBe(5);
	});

	it('POSTs summary creation and falls back to Location header id if omitted', async () => {
		const bodyWithoutId = {
			kind: 'summary',
			status: 'queued',
			progress: null,
			creditsCharged: 0,
			createdAt: '2026-11-26T10:00:00.000Z',
			startedAt: null,
			completedAt: null,
		};
		fetchMock.mockResolvedValueOnce(jsonResponse(bodyWithoutId, 202, {
			Location: '/api/v1/jobs/job_sum_42',
			'Retry-After': '7',
		}));
		const input = { videoId: 'abc', lang: 'en', length: 'brief' as const, aiTranscript: true };
		const job = await client.submitSummary(input);
		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/summaries`);
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual(input);
		expect(job.id).toBe('job_sum_42');
		expect(getJobRetryAfterSeconds(job)).toBe(7);
	});

	it('omits aiTranscript on the wire unless supplied', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'job_sum_42' }, 202));
		await client.submitSummary({ videoId: 'dQw4w9WgXcQ', lang: 'en', aiTranscript: undefined });

		const [, init] = lastCall();
		expect(JSON.parse(String(init?.body))).toEqual({ videoId: 'dQw4w9WgXcQ', lang: 'en' });
	});

	it('POSTs AI transcription and reads the job and polling delay', async () => {
		const queuedJob: ApiJob = {
			id: 'job_ai_1',
			kind: 'transcription',
			status: 'queued',
			progress: { stage: 'queued', percent: 0 },
			creditsCharged: 0,
			createdAt: '2026-11-26T10:00:00.000Z',
			startedAt: null,
			completedAt: null,
		};
		fetchMock.mockResolvedValueOnce(jsonResponse(queuedJob, 202, { 'Retry-After': '5' }));
		const input = { url: 'https://youtu.be/dQw4w9WgXcQ', lang: 'uk' };
		const job = await client.submitTranscription(input);

		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/transcripts/ai`);
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual(input);
		expect(job).toEqual(queuedJob);
		expect(getJobRetryAfterSeconds(job)).toBe(5);
	});

	it('GETs job status by id with URL encoding and Retry-After', async () => {
		const runningJob: ApiJob = {
			id: 'job/1',
			kind: 'summary',
			status: 'running',
			progress: { stage: 'generating', percent: 60 },
			creditsCharged: 0,
			createdAt: '2026-11-26T10:00:00.000Z',
			startedAt: '2026-11-26T10:00:01.000Z',
			completedAt: null,
		};
		fetchMock.mockResolvedValueOnce(jsonResponse(runningJob, 200, { 'retry-after': '5' }));
		const job = await client.getJob('job/1');
		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/jobs/job%2F1`);
		expect(init?.method).toBe('GET');
		expect(job).toEqual(runningJob);
		expect(getJobRetryAfterSeconds(job)).toBe(5);
	});

	it('sends article search params only when defined', async () => {
		await client.searchArticles({});
		const [bareUrl] = lastCall();
		expect(new URL(String(bareUrl)).search).toBe('');

		await client.searchArticles({ query: 'climate change', page: 2, limit: 10 });
		const [url] = lastCall();
		const searchParams = new URL(String(url)).searchParams;
		expect(searchParams.size).toBe(3);
		expect(searchParams.get('query')).toBe('climate change');
		expect(searchParams.get('page')).toBe('2');
		expect(searchParams.get('limit')).toBe('10');
	});

	it('GETs credits', async () => {
		await client.getCredits();
		const [url, init] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/credits`);
		expect(init?.method).toBe('GET');
	});

	it('strips trailing slashes from the base URL', async () => {
		const slashed = new ApiClient(KEY, { baseUrl: `${BASE}///`, fetch: fetchMock });
		await slashed.getCredits();
		const [url] = lastCall();
		expect(String(url)).toBe(`${BASE}/api/v1/credits`);
	});

	it('defaults the base URL to UNWATCHED_API_BASE, then to production', async () => {
		vi.stubEnv('UNWATCHED_API_BASE', 'https://env-base.example');
		await new ApiClient(KEY, { fetch: fetchMock }).getCredits();
		expect(String(lastCall()[0])).toBe('https://env-base.example/api/v1/credits');
		vi.unstubAllEnvs();

		delete process.env.UNWATCHED_API_BASE;
		await new ApiClient(KEY, { fetch: fetchMock }).getCredits();
		expect(String(lastCall()[0])).toBe('https://api.unwatched.click/api/v1/credits');
	});
});

describe('ApiClient error mapping', () => {
	const fetchMock = vi.fn(async (): Promise<Response> => jsonResponse({}));

	beforeEach(() => {
		fetchMock.mockReset();
		fetchMock.mockImplementation(async (): Promise<Response> => jsonResponse({}));
	});

	async function failure(call: () => Promise<unknown>): Promise<ApiError> {
		try {
			await call();
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			return error as ApiError;
		}
		throw new Error('expected the call to reject');
	}

	it('maps the backend error envelope to ApiError fields', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(
			{ error: { code: 'INSUFFICIENT_CREDITS', message: 'Not enough credits.' } },
			402,
		));
		const error = await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getSubtitles({ videoId: 'abc' }));
		expect(error.code).toBe('INSUFFICIENT_CREDITS');
		expect(error.message).toBe('Not enough credits.');
		expect(error.status).toBe(402);
		expect(error.retryAfterSeconds).toBeUndefined();
	});

	it('preserves the AI transcription details from a NO_SUBTITLES response', async () => {
		const details = { aiTranscriptAvailable: true, estimatedCredits: 2.5, durationSeconds: 450 };
		fetchMock.mockResolvedValueOnce(jsonResponse(
			{ error: { code: 'NO_SUBTITLES', message: 'This video has no subtitles.', details } },
			422,
		));
		const client = new ApiClient(KEY, { fetch: fetchMock });

		const error = await failure(() => client.submitSummary({ videoId: 'dQw4w9WgXcQ', lang: 'en' }));

		expect(error).toMatchObject({ code: 'NO_SUBTITLES', status: 422, details });
	});

	it('falls back to HTTP_<status> for non-envelope error bodies', async () => {
		fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', {
			status: 502,
			headers: { 'content-type': 'text/html' },
		}));
		const error = await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits());
		expect(error.code).toBe('HTTP_502');
		expect(error.status).toBe(502);
		expect(error.message).toContain('502');
	});

	it('parses Retry-After seconds on rate limits', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(
			{ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
			429,
			{ 'retry-after': '30' },
		));
		const error = await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits());
		expect(error.code).toBe('RATE_LIMITED');
		expect(error.status).toBe(429);
		expect(error.retryAfterSeconds).toBe(30);
	});

	it('parses Retry-After seconds from error body when header is absent', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(
			{ error: { code: 'RATE_LIMITED', message: 'Too many requests.', retryAfterSeconds: 15 } },
			429,
		));
		const error = await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits());
		expect(error.code).toBe('RATE_LIMITED');
		expect(error.status).toBe(429);
		expect(error.retryAfterSeconds).toBe(15);
	});

	it('rejects immediately with AbortError when signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			new ApiClient(KEY, { fetch: fetchMock }).getJob('job_1', { signal: controller.signal }),
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('propagates AbortError instead of NETWORK_ERROR when caller signal aborts in-flight', async () => {
		const controller = new AbortController();
		const abortingFetch = vi.fn(
			(_input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				}),
		);
		const client = new ApiClient(KEY, { baseUrl: BASE, fetch: abortingFetch });
		const pending = client.getJob('job_1', { signal: controller.signal });
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('rejects with MISSING_API_KEY before making any request', async () => {
		const error = await failure(() => new ApiClient('', { fetch: fetchMock }).getCredits());
		expect(error.code).toBe(CLIENT_ERROR_CODES.missingApiKey);
		expect(error.status).toBe(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('maps timeouts to TIMEOUT', async () => {
		const hangingFetch = vi.fn(
			(_input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				}),
		);
		const error = await failure(() =>
			new ApiClient(KEY, { baseUrl: BASE, timeoutMs: 25, fetch: hangingFetch }).getCredits(),
		);
		expect(error.code).toBe(CLIENT_ERROR_CODES.timeout);
		expect(error.status).toBe(0);
	});

	it('maps network failures to NETWORK_ERROR', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		const error = await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits());
		expect(error.code).toBe(CLIENT_ERROR_CODES.network);
		expect(error.status).toBe(0);
	});

	it('rejects 2xx non-JSON bodies with BAD_RESPONSE', async () => {
		fetchMock.mockResolvedValue(new Response('not json', {
			status: 200,
			headers: { 'content-type': 'text/plain' },
		}));
		const error = await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits());
		expect(error.code).toBe(CLIENT_ERROR_CODES.badResponse);
		expect(error.status).toBe(200);
	});

	it('never includes the API key in thrown messages', async () => {
		const errors: ApiError[] = [];
		fetchMock.mockResolvedValueOnce(jsonResponse(
			{ error: { code: 'UNAUTHORIZED', message: 'API key is not valid.' } },
			401,
		));
		errors.push(await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits()));

		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		errors.push(await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits()));

		fetchMock.mockResolvedValueOnce(new Response('<html/>', { status: 502, headers: { 'content-type': 'text/html' } }));
		errors.push(await failure(() => new ApiClient(KEY, { fetch: fetchMock }).getCredits()));

		errors.push(await failure(() =>
			new ApiClient(KEY, { baseUrl: BASE, timeoutMs: 25, fetch: (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				}) }).getCredits(),
		));

		expect(errors).toHaveLength(4);
		for (const error of errors) {
			expect(error.message).not.toContain(KEY);
			expect(error.message).not.toContain('Bearer');
		}
	});
});
