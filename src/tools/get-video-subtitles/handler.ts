import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { ok, renderSegments, stamp } from '../shared/format.js';
import { requireVideoRef } from '../shared/video-ref.js';
import type { GetVideoSubtitlesInput } from './schema.js';

export async function getVideoSubtitlesHandler(
	input: GetVideoSubtitlesInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => {
		requireVideoRef(input);
		const result = await api.getSubtitles({
			url: input.url,
			videoId: input.videoId,
			lang: input.lang,
		});
		const rendered = renderSegments(result.segments);
		const header = [
			`Title: ${result.video.title}`,
			`Video: ${result.videoId}  ·  Language: ${result.lang}`,
			result.video.durationSeconds ? `Duration: ${stamp(result.video.durationSeconds)}` : null,
			`Segments: ${rendered.included}/${result.segments.length}${rendered.truncated ? ' (truncated to fit context)' : ''}`,
			`Credits charged: ${result.usage.creditsCharged}${result.cached ? ' (cache hit)' : ''}`,
		].filter(Boolean).join('\n');
		return ok(`${header}\n\n${rendered.text}`);
	});
}
