import { describe, expect, it, vi } from 'vitest';
import { setJobRetryAfterSeconds } from '../../src/api/contract.js';
import { ApiError, CLIENT_ERROR_CODES } from '../../src/api/errors.js';
import type { SummaryJob } from '../../src/api/types.js';
import { JobTimeoutError, waitForJob } from '../../src/tools/shared/jobs.js';
import { createFakeApi } from './fake-api.js';

function makeJob(overrides: Partial<SummaryJob> = {}): SummaryJob {
	return {
		id: 'job_123',
		kind: 'summary',
		status: 'queued',
		progress: { stage: 'queued', percent: 0 },
		creditsCharged: 0,
		createdAt: '2026-11-26T10:00:00.000Z',
		startedAt: null,
		completedAt: null,
		...overrides,
	};
}

describe('waitForJob', () => {
	it('returns terminal jobs immediately without sleeping or polling', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const succeeded = makeJob({ status: 'succeeded', progress: { stage: 'saving', percent: 100 } });

		const result = await waitForJob(api, succeeded, { sleep });

		expect(result).toBe(succeeded);
		expect(sleep).not.toHaveBeenCalled();
		expect(api.getJob).not.toHaveBeenCalled();
	});

	it('polls until succeeded and calls onProgress only when stage or percent changes', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const onProgress = vi.fn();
		const initial = makeJob({ status: 'queued', progress: { stage: 'queued', percent: 0 } });
		const poll1 = makeJob({ status: 'running', progress: { stage: 'fetching_transcript', percent: 25 } });
		const poll2 = makeJob({ status: 'running', progress: { stage: 'fetching_transcript', percent: 25 } });
		const poll3 = makeJob({ status: 'running', progress: { stage: 'generating', percent: 60 } });
		const final = makeJob({
			status: 'succeeded',
			progress: { stage: 'saving', percent: 100 },
			creditsCharged: 2,
		});

		api.getJob
			.mockResolvedValueOnce(poll1)
			.mockResolvedValueOnce(poll2)
			.mockResolvedValueOnce(poll3)
			.mockResolvedValueOnce(final);

		const result = await waitForJob(api, initial, { sleep, onProgress });

		expect(result).toBe(final);
		expect(api.getJob).toHaveBeenCalledTimes(4);
		expect(sleep).toHaveBeenCalledTimes(4);
		expect(sleep).toHaveBeenCalledWith(5000, undefined);
		expect(onProgress.mock.calls.map(([j]) => j.progress)).toEqual([
			{ stage: 'queued', percent: 0 },
			{ stage: 'fetching_transcript', percent: 25 },
			{ stage: 'generating', percent: 60 },
			{ stage: 'saving', percent: 100 },
		]);
	});

	it('honours Retry-After attached to job responses', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const initial = makeJob({ status: 'queued', progress: null });
		setJobRetryAfterSeconds(initial, 8);
		const running = makeJob({ status: 'running', progress: { stage: 'generating', percent: 50 } });
		setJobRetryAfterSeconds(running, 3);
		const final = makeJob({ status: 'succeeded', progress: { stage: 'saving', percent: 100 } });

		api.getJob.mockResolvedValueOnce(running).mockResolvedValueOnce(final);

		await waitForJob(api, initial, { sleep });

		expect(sleep.mock.calls).toEqual([
			[8000, undefined],
			[3000, undefined],
		]);
	});

	it('stops immediately on AbortSignal mid-poll without making further requests', async () => {
		const api = createFakeApi();
		const controller = new AbortController();
		const sleep = vi.fn(async () => {
			if (sleep.mock.calls.length === 2) {
				controller.abort();
			}
		});
		const initial = makeJob({ status: 'queued', progress: null });
		api.getJob.mockResolvedValueOnce(makeJob({ status: 'running', progress: { stage: 'generating', percent: 40 } }));

		await expect(waitForJob(api, initial, { signal: controller.signal, sleep })).rejects.toMatchObject({
			name: 'AbortError',
		});

		expect(api.getJob).toHaveBeenCalledTimes(1);
		expect(api.getJob).toHaveBeenCalledWith('job_123', { signal: controller.signal });
	});

	it('retries transient 503, NETWORK_ERROR, and RATE_LIMITED during polling and recovers', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const initial = makeJob({ status: 'queued', progress: null });
		const final = makeJob({ status: 'succeeded', progress: { stage: 'saving', percent: 100 } });

		api.getJob
			.mockRejectedValueOnce(new ApiError('HTTP_503', 'Service Unavailable', 503))
			.mockRejectedValueOnce(new ApiError(CLIENT_ERROR_CODES.network, 'socket hang up', 0))
			.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 'Slow down', 429, 9))
			.mockResolvedValueOnce(final);

		const result = await waitForJob(api, initial, { sleep, pollIntervalMs: 5000 });

		expect(result).toBe(final);
		expect(api.getJob).toHaveBeenCalledTimes(4);
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 5000, 10000, 9000]);
	});

	it('propagates transient errors once retries are exhausted', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const initial = makeJob({ status: 'queued', progress: null });

		api.getJob.mockRejectedValue(new ApiError('HTTP_503', 'Service Unavailable', 503));

		await expect(waitForJob(api, initial, { sleep })).rejects.toMatchObject({
			code: 'HTTP_503',
			status: 503,
		});
		expect(api.getJob).toHaveBeenCalledTimes(4);
	});

	it('propagates non-transient errors such as 404 JOB_NOT_FOUND immediately', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const initial = makeJob({ status: 'queued', progress: null });

		api.getJob.mockRejectedValueOnce(new ApiError('JOB_NOT_FOUND', 'Unknown job', 404));

		await expect(waitForJob(api, initial, { sleep })).rejects.toMatchObject({
			code: 'JOB_NOT_FOUND',
			status: 404,
		});
		expect(api.getJob).toHaveBeenCalledTimes(1);
	});

	it('throws JobTimeoutError containing the job id when maxWaitMs is reached', async () => {
		const api = createFakeApi();
		const sleep = vi.fn(async () => {});
		const initial = makeJob({ id: 'job_timeout_99', status: 'queued', progress: null });
		api.getJob.mockResolvedValue(makeJob({ id: 'job_timeout_99', status: 'running', progress: { stage: 'generating', percent: 50 } }));

		await expect(
			waitForJob(api, initial, { sleep, pollIntervalMs: 5000, maxWaitMs: 10_000 }),
		).rejects.toThrowError(JobTimeoutError);

		try {
			await waitForJob(api, initial, { sleep, pollIntervalMs: 5000, maxWaitMs: 10_000 });
		} catch (error) {
			expect(error).toBeInstanceOf(JobTimeoutError);
			expect((error as JobTimeoutError).jobId).toBe('job_timeout_99');
			expect((error as Error).message).toContain('job_timeout_99');
			expect((error as Error).message).toContain('server-side');
		}
	});
});
