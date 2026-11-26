import type {
	ApiJob,
	ArticleSearchResult,
	CreditSnapshot,
	FramesResult,
	SubtitlesResult,
	SummaryLength,
	TracksResult,
	VideoInfo,
	VideoRef,
} from './types.js';

export interface ApiRequestOptions {
	signal?: AbortSignal;
}

/**
 * Everything the MCP tools need from the Unwatched REST API. Tools depend on
 * this interface only, so they can be tested with a fake; `http/client.ts`
 * is the real implementation. Every method rejects with `ApiError` (or an
 * `AbortError` when the caller's `signal` aborts).
 */
export interface UnwatchedApi {
	/** POST /api/v1/subtitles */
	getSubtitles(input: VideoRef & { lang?: string }, opts?: ApiRequestOptions): Promise<SubtitlesResult>;

	/** GET /api/v1/videos/:videoId → `{ video }`, unwrapped. */
	getVideoInfo(videoId: string, opts?: ApiRequestOptions): Promise<VideoInfo>;

	/** GET /api/v1/videos/:videoId/tracks */
	listSubtitleTracks(videoId: string, opts?: ApiRequestOptions): Promise<TracksResult>;

	/** POST /api/v1/frames */
	getFrames(input: VideoRef & {
		timestamps: number[];
		width?: number;
		includeBase64?: boolean;
	}, opts?: ApiRequestOptions): Promise<FramesResult>;

	/** POST /api/v1/transcripts/translate */
	submitTranslation(input: {
		videoId: string;
		sourceLang: string;
		targetLang: string;
	}, opts?: ApiRequestOptions): Promise<ApiJob>;

	/** POST /api/v1/summaries */
	submitSummary(input: VideoRef & {
		lang: string;
		length?: SummaryLength;
		sourceLang?: string;
	}, opts?: ApiRequestOptions): Promise<ApiJob>;

	/** GET /api/v1/jobs/:id */
	getJob(id: string, opts?: ApiRequestOptions): Promise<ApiJob>;

	/** GET /api/v1/articles */
	searchArticles(input: {
		query?: string;
		category?: string;
		lang?: string;
		page?: number;
		limit?: number;
	}, opts?: ApiRequestOptions): Promise<ArticleSearchResult>;

	/** GET /api/v1/credits */
	getCredits(opts?: ApiRequestOptions): Promise<CreditSnapshot>;
}

const jobRetryAfterSeconds = new WeakMap<ApiJob, number>();

/** Attaches a `Retry-After` delay (in seconds) from HTTP headers without mutating the wire `ApiJob`. */
export function setJobRetryAfterSeconds(job: ApiJob, seconds: number | undefined): void {
	if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
		jobRetryAfterSeconds.set(job, seconds);
	}
}

/** Reads the `Retry-After` delay (in seconds) attached by the API client, if present. */
export function getJobRetryAfterSeconds(job: ApiJob): number | undefined {
	return jobRetryAfterSeconds.get(job);
}

/** Upper bound of `timestamps` per `getFrames` call, enforced by the backend. */
export const MAX_FRAMES_PER_REQUEST = 5;
