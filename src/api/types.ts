import type { components } from './generated/openapi.js';

type Schemas = components['schemas'];

/**
 * Wire types of the Unwatched public REST API (`/api/v1`), aliased from the
 * generated OpenAPI schema (`openapi/openapi.json`).
 */

export type ErrorCode = Schemas['ErrorCode'];

export type UsageInfo = Schemas['Usage'];

export type VideoInfo = Schemas['VideoInfo'];

export type Segment = Schemas['Segment'];

export type SubtitleTrack = Schemas['SubtitleTrack'];

/** Either a full YouTube URL or an 11-character video id must be set. */
export type VideoRef = Pick<Schemas['SubtitlesRequest'], 'url' | 'videoId'>;

export type SubtitlesResult = Schemas['SubtitlesResult'];

export type TracksResult = Schemas['TracksResponse'];

export type Frame = Schemas['Frame'];

export type FramesResult = Schemas['FramesResult'];

export type TranslateResult = Schemas['TranslateResult'];

export type SummaryLength = NonNullable<Schemas['SummaryRequest']['length']>;

export type SummaryArticle = Schemas['SummaryArticle'];

export type SummaryResult = Schemas['SummaryResult'];

export type ArticleSearchItem = Schemas['ArticleSearchItem'];

export type ArticleSearchResult = Schemas['ArticlesResponse'];

export type CreditSnapshot = Schemas['CreditSnapshot'];

export type ApiErrorBody = Schemas['ErrorResponse'];

export type SummaryJob = Schemas['SummaryJob'];

export type TranslationJob = Schemas['TranslationJob'];

export type ApiJob = Schemas['ApiJob'];

export type ApiJobKind = ApiJob['kind'];

export type ApiJobStatus = ApiJob['status'];

export type ApiJobProgress = Schemas['JobProgress'];

export type ApiJobStage = ApiJobProgress['stage'];
