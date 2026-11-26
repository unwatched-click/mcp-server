import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import { resolveVideoId } from '../shared/video-ref.js';
import type { ListSubtitleTracksInput } from './schema.js';

export async function listSubtitleTracksHandler(
	input: ListSubtitleTracksInput,
	api: UnwatchedApi,
): Promise<CallToolResult> {
	return guard(async () => {
		const videoId = resolveVideoId(input);
		return json(await api.listSubtitleTracks(videoId));
	});
}
