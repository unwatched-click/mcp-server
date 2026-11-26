import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import { resolveVideoId } from '../shared/video-ref.js';
import type { GetVideoInfoInput } from './schema.js';

export async function getVideoInfoHandler(
	input: GetVideoInfoInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => {
		const videoId = resolveVideoId(input);
		return json(await api.getVideoInfo(videoId));
	});
}
