import { ApiError, CLIENT_ERROR_CODES } from '../api/errors.js';
import { setJobRetryAfterSeconds, type ApiRequestOptions, type UnwatchedApi } from '../api/contract.js';
import type {
	ApiJob,
	ApiErrorBody,
	ApiErrorDetails,
	ArticleSearchResult,
	CreditSnapshot,
	FramesResult,
	SubtitlesResult,
	SummaryRequest,
	TracksResult,
	TranscriptionRequest,
	VideoInfo,
	VideoRef,
} from '../api/types.js';
import { version } from '../utils/version.js';

const DEFAULT_TIMEOUT_MS = 60 * 1000;

const KEYS_URL = 'https://unwatched.click/en/developer/keys';

export interface ApiClientOptions {
	/** API host, without `/api/v1`. */
	baseUrl?: string;
	/** Request timeout in milliseconds. */
	timeoutMs?: number;
	/** Injectable for tests. */
	fetch?: typeof fetch;
	oauth?: {
		invalidTokenChallenge: string;
		invalidate: () => void;
	};
}

interface RequestOptions {
	method: 'GET' | 'POST';
	body?: unknown;
	signal?: AbortSignal;
}

export class ApiClient implements UnwatchedApi {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(
		private readonly apiKey: string,
		private readonly options?: ApiClientOptions,
	) {
		const baseUrl = options?.baseUrl ?? process.env.UNWATCHED_API_BASE ?? 'https://api.unwatched.click';
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.fetchImpl = options?.fetch ?? fetch;
	}

	async getSubtitles(input: VideoRef & { lang?: string }, opts?: ApiRequestOptions): Promise<SubtitlesResult> {
		return this.request('/api/v1/subtitles', { method: 'POST', body: input, signal: opts?.signal });
	}

	async getVideoInfo(videoId: string, opts?: ApiRequestOptions): Promise<VideoInfo> {
		const body = await this.request<{ video?: VideoInfo }>(`/api/v1/videos/${encodeURIComponent(videoId)}`, {
			method: 'GET',
			signal: opts?.signal,
		});
		if (!body?.video) {
			// The request itself succeeded (2xx); only the shape was wrong.
			throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API response did not contain a video object', 200);
		}
		return body.video;
	}

	async listSubtitleTracks(videoId: string, opts?: ApiRequestOptions): Promise<TracksResult> {
		return this.request(`/api/v1/videos/${encodeURIComponent(videoId)}/tracks`, {
			method: 'GET',
			signal: opts?.signal,
		});
	}

	async getFrames(input: VideoRef & {
		timestamps: number[];
		width?: number;
		includeBase64?: boolean;
	}, opts?: ApiRequestOptions): Promise<FramesResult> {
		return this.request('/api/v1/frames', { method: 'POST', body: input, signal: opts?.signal });
	}

	async submitTranslation(input: {
		videoId: string;
		sourceLang: string;
		targetLang: string;
	}, opts?: ApiRequestOptions): Promise<ApiJob> {
		return this.requestJob('/api/v1/transcripts/translate', {
			method: 'POST',
			body: input,
			signal: opts?.signal,
		});
	}

	async submitTranscription(input: TranscriptionRequest, opts?: ApiRequestOptions): Promise<ApiJob> {
		return this.requestJob('/api/v1/transcripts/ai', {
			method: 'POST',
			body: input,
			signal: opts?.signal,
		});
	}

	async submitSummary(input: SummaryRequest, opts?: ApiRequestOptions): Promise<ApiJob> {
		return this.requestJob('/api/v1/summaries', {
			method: 'POST',
			body: input,
			signal: opts?.signal,
		});
	}

	async getJob(id: string, opts?: ApiRequestOptions): Promise<ApiJob> {
		return this.requestJob(`/api/v1/jobs/${encodeURIComponent(id)}`, {
			method: 'GET',
			signal: opts?.signal,
		});
	}

	async searchArticles(input: {
		query?: string;
		category?: string;
		lang?: string;
		page?: number;
		limit?: number;
	}, opts?: ApiRequestOptions): Promise<ArticleSearchResult> {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(input)) {
			if (value !== undefined) params.set(key, String(value));
		}
		const query = params.toString();
		return this.request(query ? `/api/v1/articles?${query}` : '/api/v1/articles', {
			method: 'GET',
			signal: opts?.signal,
		});
	}

	async getCredits(opts?: ApiRequestOptions): Promise<CreditSnapshot> {
		return this.request('/api/v1/credits', { method: 'GET', signal: opts?.signal });
	}

	private async request<T>(path: string, init: RequestOptions): Promise<T> {
		const response = await this.performRequest(path, init);
		return this.parseJson<T>(response);
	}

	private async requestJob(path: string, init: RequestOptions): Promise<ApiJob> {
		const response = await this.performRequest(path, init);
		const body = await this.parseJson<Partial<ApiJob>>(response);
		if (!body || typeof body !== 'object') {
			throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API job response was not an object', response.status);
		}
		// 202 responses also carry Location: /api/v1/jobs/{id}; fall back to it if id is omitted.
		if (typeof body.id !== 'string' || !body.id) {
			const locationId = parseJobIdFromLocation(response.headers.get('location'));
			if (!locationId) {
				throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API job response did not contain a job id', response.status);
			}
			body.id = locationId;
		}
		const job = body as ApiJob;
		setJobRetryAfterSeconds(job, parseRetryAfter(response.headers.get('retry-after')));
		return job;
	}

	private async performRequest(path: string, init: RequestOptions): Promise<Response> {
		if (!this.apiKey) {
			throw new ApiError(
				CLIENT_ERROR_CODES.missingApiKey,
				`UNWATCHED_API_KEY is not set. Get a key at ${KEYS_URL} and pass it as the UNWATCHED_API_KEY environment variable.`,
				0,
			);
		}

		if (init.signal?.aborted) {
			throw createAbortError(init.signal.reason);
		}

		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			Accept: 'application/json',
			'User-Agent': `unwatched-click-mcp/${version}`,
		};
		let body: string | undefined;
		if (init.body !== undefined) {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(init.body);
		}

		const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
		const signal = init.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal;

		let response: Response;
		try {
			response = await this.fetchImpl(this.baseUrl + path, {
				method: init.method,
				headers,
				body,
				signal,
			});
		} catch (error) {
			if (init.signal?.aborted) {
				throw createAbortError(init.signal.reason);
			}
			throw this.requestFailure(error, timeoutSignal);
		}

		if (!response.ok) {
			throw await this.responseError(response);
		}

		return response;
	}

	private async parseJson<T>(response: Response): Promise<T> {
		try {
			return await response.json() as T;
		} catch {
			throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API returned a non-JSON body', response.status);
		}
	}

	/** Maps a fetch rejection to the closest client-side code; never echoes the key. */
	private requestFailure(error: unknown, timeoutSignal: AbortSignal): ApiError {
		if (timeoutSignal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
			return new ApiError(
				CLIENT_ERROR_CODES.timeout,
				`Unwatched API request timed out after ${Math.round(this.timeoutMs / 1000)}s`,
				0,
			);
		}
		return new ApiError(
			CLIENT_ERROR_CODES.network,
			error instanceof Error ? error.message : 'Unwatched API request failed',
			0,
		);
	}

	/** Reads the API error envelope when present, else falls back to `HTTP_<status>`. */
	private async responseError(response: Response): Promise<ApiError> {
		const oauth = this.options?.oauth;
		const invalidToken = oauth && response.status === 401
			&& response.headers.get('www-authenticate') === 'Bearer error="invalid_token"';
		if (invalidToken) oauth.invalidate();

		let code = `HTTP_${response.status}`;
		let message = `Unwatched API returned HTTP ${response.status}`;
		let bodyRetryAfter: number | undefined;
		let details: ApiErrorDetails;
		try {
			const body = await response.json() as { error?: Partial<ApiErrorBody['error']> };
			if (typeof body?.error?.code === 'string' && typeof body?.error?.message === 'string') {
				code = body.error.code;
				message = body.error.message;
				details = body.error.details;
			}
			if (
				typeof body?.error?.retryAfterSeconds === 'number'
				&& Number.isFinite(body.error.retryAfterSeconds)
				&& body.error.retryAfterSeconds >= 0
			) {
				bodyRetryAfter = Math.ceil(body.error.retryAfterSeconds);
			}
		} catch {
			// Not the JSON error envelope; keep the fallback code and message.
		}
		const headerRetryAfter = parseRetryAfter(response.headers.get('retry-after'));
		return new ApiError(
			code, message, response.status, headerRetryAfter ?? bodyRetryAfter,
			invalidToken ? oauth.invalidTokenChallenge : undefined,
			details,
		);
	}
}

function createAbortError(reason?: unknown): Error {
	if (reason instanceof Error && reason.name === 'AbortError') return reason;
	const err = new Error(typeof reason === 'string' && reason ? reason : 'The operation was aborted');
	err.name = 'AbortError';
	return err;
}

function parseJobIdFromLocation(location: string | null): string | undefined {
	if (!location) return undefined;
	const match = location.match(/\/jobs\/([^/?#]+)/);
	if (!match) return undefined;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}

/** `Retry-After` in seconds; the backend's rate limiter always sends a plain integer. */
function parseRetryAfter(header: string | null): number | undefined {
	if (!header) return undefined;
	const seconds = Number(header);
	return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}
