import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import { requireVideoRef } from '../shared/video-ref.js';
import type { SummarizeVideoInput } from './schema.js';

export async function summarizeVideoHandler(
	input: SummarizeVideoInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => {
		requireVideoRef(input);
		const result = await api.createSummary({
			url: input.url,
			videoId: input.videoId,
			lang: input.lang,
			length: input.length,
			sourceLang: input.sourceLang,
		});
		return json({
			video: result.video,
			article: result.article,
			cached: result.cached,
			usage: result.usage,
		});
	});
}
