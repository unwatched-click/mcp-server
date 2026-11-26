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
} from './types.js';

/**
 * Everything the MCP tools need from the Unwatched REST API. Tools depend on
 * this interface only, so they can be tested with a fake; `http/client.ts`
 * is the real implementation. Every method rejects with `ApiError`.
 */
export interface UnwatchedApi {
	/** POST /api/v1/subtitles */
	getSubtitles(input: VideoRef & { lang?: string }): Promise<SubtitlesResult>;

	/** GET /api/v1/videos/:videoId → `{ video }`, unwrapped. */
	getVideoInfo(videoId: string): Promise<VideoInfo>;

	/** GET /api/v1/videos/:videoId/tracks */
	listSubtitleTracks(videoId: string): Promise<TracksResult>;

	/** POST /api/v1/frames */
	getFrames(input: VideoRef & {
		timestamps: number[];
		width?: number;
		includeBase64?: boolean;
	}): Promise<FramesResult>;

	/** POST /api/v1/transcripts/translate */
	translateTranscript(input: {
		videoId: string;
		sourceLang: string;
		targetLang: string;
	}): Promise<TranslateResult>;

	/** POST /api/v1/summaries */
	createSummary(input: VideoRef & {
		lang: string;
		length?: SummaryLength;
		sourceLang?: string;
	}): Promise<SummaryResult>;

	/** GET /api/v1/articles */
	searchArticles(input: {
		query?: string;
		category?: string;
		lang?: string;
		page?: number;
		limit?: number;
	}): Promise<ArticleSearchResult>;

	/** GET /api/v1/credits */
	getCredits(): Promise<CreditSnapshot>;
}

/** Upper bound of `timestamps` per `getFrames` call, enforced by the backend. */
export const MAX_FRAMES_PER_REQUEST = 5;
