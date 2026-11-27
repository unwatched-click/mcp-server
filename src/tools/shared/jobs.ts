import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { getJobRetryAfterSeconds, type UnwatchedApi } from '../../api/contract.js';
import { ApiError, CLIENT_ERROR_CODES } from '../../api/errors.js';
import type { ApiJob, ApiJobProgress, ApiJobStage, ApiJobStatus } from '../../api/types.js';

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_MAX_WAIT_MS = 15 * 60_000;
const MAX_POLL_RETRIES = 3;
const MAX_RETRY_BACKOFF_MS = 30_000;

const STAGE_MESSAGES: Record<ApiJobStage, string> = {
	queued: 'Queued',
	fetching_transcript: 'Fetching transcript',
	transcribing: 'Transcribing',
	generating: 'Generating',
	saving: 'Saving',
};

export interface WaitForJobOptions {
	signal?: AbortSignal;
	onProgress?: (job: ApiJob) => void | Promise<void>;
	pollIntervalMs?: number;
	maxWaitMs?: number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface JobToolExtra {
	signal?: AbortSignal;
	pollShutdownSignal?: AbortSignal;
	_meta?: {
		progressToken?: string | number;
	};
	sendNotification?: (notification: ServerNotification) => Promise<void>;
}

export class JobTimeoutError extends Error {
	constructor(readonly jobId: string, readonly maxWaitMs: number) {
		const duration = maxWaitMs >= 60_000
			? `${Math.round(maxWaitMs / 60_000)} minutes`
			: `${Math.max(1, Math.round(maxWaitMs / 1000))} seconds`;
		super(
			`Job ${jobId} is still running on the server after waiting ${duration}. `
			+ 'It keeps running server-side — call this tool again with the same input to attach to it and retrieve the result once ready.',
		);
		this.name = 'JobTimeoutError';
	}
}

export function formatJobStage(stage: ApiJobStage): string {
	return STAGE_MESSAGES[stage] ?? stage;
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(createAbortError(signal.reason));
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer);
			reject(createAbortError(signal?.reason));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Polls `GET /api/v1/jobs/:id` until the job reaches a terminal state
 * (`succeeded` or `failed`), emitting progress changes and respecting `AbortSignal`
 * and `maxWaitMs`.
 */
export async function waitForJob(
	api: UnwatchedApi,
	initialJob: ApiJob,
	options: WaitForJobOptions = {},
): Promise<ApiJob> {
	const {
		signal,
		onProgress,
		pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
		maxWaitMs = DEFAULT_MAX_WAIT_MS,
		sleep = defaultSleep,
	} = options;

	if (signal?.aborted) {
		throw createAbortError(signal.reason);
	}

	if (isTerminalStatus(initialJob.status)) {
		return initialJob;
	}

	let current = initialJob;
	let lastProgressKey = progressKey(current.progress);
	if (lastProgressKey !== null) {
		await onProgress?.(current);
	}

	const startedAt = Date.now();
	// Track simulated sleep duration alongside wall time so injected instant sleeps still hit maxWaitMs.
	let sleptMs = 0;
	let consecutiveErrors = 0;
	let pendingDelayMs = nextPollDelayMs(current, pollIntervalMs);

	while (true) {
		const elapsed = Math.max(Date.now() - startedAt, sleptMs);
		if (elapsed >= maxWaitMs) {
			throw new JobTimeoutError(current.id, maxWaitMs);
		}

		const delay = Math.min(pendingDelayMs, maxWaitMs - elapsed);
		sleptMs += delay;
		await sleep(delay, signal);

		if (signal?.aborted) {
			throw createAbortError(signal.reason);
		}

		try {
			const next = signal
				? await api.getJob(current.id, { signal })
				: await api.getJob(current.id);
			consecutiveErrors = 0;
			current = next;

			const key = progressKey(current.progress);
			if (key !== null && key !== lastProgressKey) {
				lastProgressKey = key;
				await onProgress?.(current);
			}

			if (isTerminalStatus(current.status)) {
				return current;
			}

			pendingDelayMs = nextPollDelayMs(current, pollIntervalMs);
		} catch (error) {
			if (signal?.aborted || isAbortError(error)) {
				throw signal?.aborted ? createAbortError(signal.reason) : error;
			}
			if (!isTransientPollError(error)) {
				throw error;
			}
			consecutiveErrors += 1;
			if (consecutiveErrors > MAX_POLL_RETRIES) {
				throw error;
			}
			pendingDelayMs = error.retryAfterSeconds !== undefined
				? error.retryAfterSeconds * 1000
				: Math.min(pollIntervalMs * 2 ** (consecutiveErrors - 1), MAX_RETRY_BACKOFF_MS);
		}
	}
}

/**
 * Runs a job-backed tool from initial submission through polling (when not
 * already terminal), progress notification forwarding, and terminal failure checks.
 */
export async function resolveJob(
	api: UnwatchedApi,
	initialJob: ApiJob,
	extra?: JobToolExtra,
	waitOptions?: WaitForJobOptions,
): Promise<ApiJob> {
	let finalJob = initialJob;

	if (!isTerminalStatus(initialJob.status)) {
		const progressToken = extra?._meta?.progressToken;
		const sendNotification = extra?.sendNotification;
		const onProgress = progressToken !== undefined && sendNotification
			? async (job: ApiJob) => {
				if (!job.progress) return;
				await sendNotification({
					method: 'notifications/progress',
					params: {
						progressToken,
						progress: job.progress.percent,
						total: 100,
						message: formatJobStage(job.progress.stage),
					},
				}).catch(() => {});
			}
			: undefined;

		const requestSignal = waitOptions?.signal ?? extra?.signal;
		const pollShutdownSignal = extra?.pollShutdownSignal;
		// Keep the SDK request alive so the tool can send retry guidance after polling stops.
		const signal = requestSignal && pollShutdownSignal
			? AbortSignal.any([requestSignal, pollShutdownSignal])
			: requestSignal ?? pollShutdownSignal;
		finalJob = await waitForJob(api, initialJob, {
			...waitOptions,
			signal,
			onProgress: waitOptions?.onProgress ?? onProgress,
		});
	}

	if (finalJob.status === 'failed') {
		throw new ApiError(
			finalJob.error?.code ?? 'JOB_FAILED',
			finalJob.error?.message ?? 'Job failed.',
			0,
		);
	}

	if (!finalJob.result) {
		throw new ApiError(
			CLIENT_ERROR_CODES.badResponse,
			'Unwatched API job succeeded without a result',
			200,
		);
	}

	return finalJob;
}

function isTerminalStatus(status: ApiJobStatus): boolean {
	return status === 'succeeded' || status === 'failed';
}

function progressKey(progress: ApiJobProgress | null): string | null {
	return progress ? `${progress.stage}:${progress.percent}` : null;
}

function nextPollDelayMs(job: ApiJob, defaultMs: number): number {
	const retryAfterSeconds = getJobRetryAfterSeconds(job);
	return retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : defaultMs;
}

function isTransientPollError(error: unknown): error is ApiError {
	if (!(error instanceof ApiError)) return false;
	return error.code === CLIENT_ERROR_CODES.network
		|| error.code === CLIENT_ERROR_CODES.timeout
		|| error.code === 'RATE_LIMITED'
		|| error.status === 429
		|| (error.status >= 500 && error.status < 600);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

function createAbortError(reason?: unknown): Error {
	if (reason instanceof Error && reason.name === 'AbortError') return reason;
	const err = new Error(typeof reason === 'string' && reason ? reason : 'The operation was aborted');
	err.name = 'AbortError';
	return err;
}
