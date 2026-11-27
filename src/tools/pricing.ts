/**
 * Credit prices shown in tool descriptions. They mirror the backend's
 * CREDIT_CATALOG (`server/src/services/credit.service.ts`, catalog version 12),
 * which is private and cannot be imported from this package — keep the numbers
 * in sync manually when the catalog changes. The authoritative balance and the
 * per-call charges always come back in each API response's `usage` object, so
 * descriptions only need to be roughly right.
 */
export const CREDIT_PRICES = {
	/** `subtitle-fetch`: fixed price for the first fetch of a video + language. */
	subtitleFetch: 1,
	/** `screenshot`: flat price per extracted frame. */
	screenshotPerFrame: 1,
	/** `transcript-translate`: price per hour of video, 1 credit minimum. */
	translatePerHour: 5,
	/** `summary`: price per hour of video, 1 credit minimum. */
	summaryPerHour: 2,
	/** `ai-subtitles`: price per hour of video for fresh AI transcription. */
	aiSubtitlesPerHour: 20,
} as const;
