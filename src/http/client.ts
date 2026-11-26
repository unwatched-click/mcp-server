import { ApiError, CLIENT_ERROR_CODES } from '../api/errors.js';
import type { UnwatchedApi } from '../api/contract.js';
import type {
	ArticleSearchResult,
	CreditSnapshot,
	FramesResult,
	SubtitlesResult,
	SummaryLength,
	SummaryResult,
	TracksResult,
	TranslateResult,
	VideoInfo,
	VideoRef,
} from '../api/types.js';
import { version } from '../utils/version.js';

/** Summaries can take minutes to generate, so default to a generous ceiling. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const KEYS_URL = 'https://unwatched.click/en/developer/keys';

export interface ApiClientOptions {
	/** API host, without `/api/v1`. */
	baseUrl?: string;
	/** Request timeout in milliseconds. */
	timeoutMs?: number;
	/** Injectable for tests. */
	fetch?: typeof fetch;
}

interface RequestOptions {
	method: 'GET' | 'POST';
	body?: unknown;
}

export class ApiClient implements UnwatchedApi {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(
		private readonly apiKey: string,
		options?: ApiClientOptions,
	) {
		const baseUrl = options?.baseUrl ?? process.env.UNWATCHED_API_BASE ?? 'https://api.unwatched.click';
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.fetchImpl = options?.fetch ?? fetch;
	}

	async getSubtitles(input: VideoRef & { lang?: string }): Promise<SubtitlesResult> {
		return this.request('/api/v1/subtitles', { method: 'POST', body: input });
	}

	async getVideoInfo(videoId: string): Promise<VideoInfo> {
		const body = await this.request<{ video?: VideoInfo }>(`/api/v1/videos/${encodeURIComponent(videoId)}`, {
			method: 'GET',
		});
		if (!body?.video) {
			// The request itself succeeded (2xx); only the shape was wrong.
			throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API response did not contain a video object', 200);
		}
		return body.video;
	}

	async listSubtitleTracks(videoId: string): Promise<TracksResult> {
		return this.request(`/api/v1/videos/${encodeURIComponent(videoId)}/tracks`, { method: 'GET' });
	}

	async getFrames(input: VideoRef & {
		timestamps: number[];
		width?: number;
		includeBase64?: boolean;
	}): Promise<FramesResult> {
		return this.request('/api/v1/frames', { method: 'POST', body: input });
	}

	async translateTranscript(input: {
		videoId: string;
		sourceLang: string;
		targetLang: string;
	}): Promise<TranslateResult> {
		return this.request('/api/v1/transcripts/translate', { method: 'POST', body: input });
	}

	async createSummary(input: VideoRef & {
		lang: string;
		length?: SummaryLength;
		sourceLang?: string;
	}): Promise<SummaryResult> {
		return this.request('/api/v1/summaries', { method: 'POST', body: input });
	}

	async searchArticles(input: {
		query?: string;
		category?: string;
		lang?: string;
		page?: number;
		limit?: number;
	}): Promise<ArticleSearchResult> {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(input)) {
			if (value !== undefined) params.set(key, String(value));
		}
		const query = params.toString();
		return this.request(query ? `/api/v1/articles?${query}` : '/api/v1/articles', { method: 'GET' });
	}

	async getCredits(): Promise<CreditSnapshot> {
		return this.request('/api/v1/credits', { method: 'GET' });
	}

	private async request<T>(path: string, init: RequestOptions): Promise<T> {
		if (!this.apiKey) {
			throw new ApiError(
				CLIENT_ERROR_CODES.missingApiKey,
				`UNWATCHED_API_KEY is not set. Get a key at ${KEYS_URL} and pass it as the UNWATCHED_API_KEY environment variable.`,
				0,
			);
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

		let response: Response;
		try {
			response = await this.fetchImpl(this.baseUrl + path, {
				method: init.method,
				headers,
				body,
				signal: AbortSignal.timeout(this.timeoutMs),
			});
		} catch (error) {
			throw this.requestFailure(error);
		}

		if (!response.ok) {
			throw await this.responseError(response);
		}

		try {
			return await response.json() as T;
		} catch {
			throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API returned a non-JSON body', response.status);
		}
	}

	/** Maps a fetch rejection to the closest client-side code; never echoes the key. */
	private requestFailure(error: unknown): ApiError {
		if (error instanceof Error && error.name === 'TimeoutError') {
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

	/** Reads `{ error: { code, message } }` when present, else falls back to `HTTP_<status>`. */
	private async responseError(response: Response): Promise<ApiError> {
		let code = `HTTP_${response.status}`;
		let message = `Unwatched API returned HTTP ${response.status}`;
		try {
			const body = await response.json() as { error?: { code?: unknown; message?: unknown } };
			if (typeof body?.error?.code === 'string' && typeof body?.error?.message === 'string') {
				code = body.error.code;
				message = body.error.message;
			}
		} catch {
			// Not the JSON error envelope; keep the fallback code and message.
		}
		return new ApiError(code, message, response.status, parseRetryAfter(response.headers.get('retry-after')));
	}
}

/** `Retry-After` in seconds; the backend's rate limiter always sends a plain integer. */
function parseRetryAfter(header: string | null): number | undefined {
	if (!header) return undefined;
	const seconds = Number(header);
	return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}
