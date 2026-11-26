import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { ok, renderSegments } from '../shared/format.js';
import type { TranslateTranscriptInput } from './schema.js';

export async function translateTranscriptHandler(
	input: TranslateTranscriptInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => {
		const result = await api.translateTranscript({
			videoId: input.videoId,
			sourceLang: input.sourceLang,
			targetLang: input.targetLang,
		});
		const rendered = renderSegments(result.segments);
		const header = `${result.videoId}: ${input.sourceLang} → ${input.targetLang}  ·  `
			+ `${rendered.included}/${result.segments.length} segments  ·  `
			+ `credits charged: ${result.usage.creditsCharged}${result.cached ? ' (cache hit)' : ''}`;
		return ok(`${header}\n\n${rendered.text}`);
	});
}
