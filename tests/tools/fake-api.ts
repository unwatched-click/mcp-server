import { vi } from 'vitest';
import type { Mocked } from 'vitest';
import type { UnwatchedApi } from '../../src/api/contract.js';

/**
 * In-memory `UnwatchedApi` double: every method is a typed `vi.fn()` the test
 * programs with `mockResolvedValue` / `mockRejectedValue`. No network and no
 * real `ApiClient` is involved.
 */
export function createFakeApi(): Mocked<UnwatchedApi> {
	return {
		getSubtitles: vi.fn<UnwatchedApi['getSubtitles']>(),
		getVideoInfo: vi.fn<UnwatchedApi['getVideoInfo']>(),
		listSubtitleTracks: vi.fn<UnwatchedApi['listSubtitleTracks']>(),
		getFrames: vi.fn<UnwatchedApi['getFrames']>(),
		translateTranscript: vi.fn<UnwatchedApi['translateTranscript']>(),
		createSummary: vi.fn<UnwatchedApi['createSummary']>(),
		searchArticles: vi.fn<UnwatchedApi['searchArticles']>(),
		getCredits: vi.fn<UnwatchedApi['getCredits']>(),
	};
}
