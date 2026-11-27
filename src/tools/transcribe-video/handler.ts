import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import { ApiError, CLIENT_ERROR_CODES } from '../../api/errors.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import { resolveJob, type JobToolExtra, type WaitForJobOptions } from '../shared/jobs.js';
import { requireVideoRef } from '../shared/video-ref.js';
import type { TranscribeVideoInput } from './schema.js';

export async function transcribeVideoHandler(
	input: TranscribeVideoInput,
	api: UnwatchedApi,
	extra?: JobToolExtra,
	waitOptions?: WaitForJobOptions,
): Promise<CallToolResult> {
	return guard(async () => {
		requireVideoRef(input);
		const body = { url: input.url, videoId: input.videoId, lang: input.lang };
		const submitted = extra?.signal
			? await api.submitTranscription(body, { signal: extra.signal })
			: await api.submitTranscription(body);
		const job = await resolveJob(api, submitted, extra, waitOptions);
		if (job.kind !== 'transcription' || !job.result) {
			throw new ApiError(CLIENT_ERROR_CODES.badResponse, 'Unwatched API did not return a transcription result', 200);
		}
		const { video, lang, method, segments, cached, usage } = job.result;
		return json({ video, lang, method, segments, cached, usage });
	});
}
