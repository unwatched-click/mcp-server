import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { stamp, type ToolContent } from '../shared/format.js';
import { requireVideoRef } from '../shared/video-ref.js';
import type { GetVideoFrameInput } from './schema.js';

export async function getVideoFrameHandler(
	input: GetVideoFrameInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => {
		requireVideoRef(input);
		const result = await api.getFrames({
			url: input.url,
			videoId: input.videoId,
			timestamps: input.timestamps,
			width: input.width,
			includeBase64: true,
		});

		const header = [
			`Title: ${result.video.title}`,
			`Video: ${result.videoId}  ·  Frames: ${result.frames.length}`,
			`Credits charged: ${result.usage.creditsCharged}`,
		].join('\n');

		// Image blocks so the model can actually read the frame; the text block
		// keeps the URL and timestamp addressable for citation.
		const content: ToolContent = [{ type: 'text', text: header }];
		for (const frame of result.frames) {
			content.push({
				type: 'text',
				text: `[${stamp(frame.seconds)}] ${frame.imageUrl}${frame.cached ? ' (cached)' : ''}`,
			});
			if (frame.base64) {
				content.push({ type: 'image', data: frame.base64, mimeType: frame.mimeType });
			}
		}
		return { content };
	});
}
