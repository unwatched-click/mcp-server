import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import type { SummaryResult } from '../../api/types.js';
import { guard } from '../shared/errors.js';
import { json } from '../shared/format.js';
import { resolveJob, type JobToolExtra, type WaitForJobOptions } from '../shared/jobs.js';
import { requireVideoRef } from '../shared/video-ref.js';
import type { SummarizeVideoInput } from './schema.js';

export async function summarizeVideoHandler(
	input: SummarizeVideoInput,
	api: UnwatchedApi,
	extra?: JobToolExtra,
	waitOptions?: WaitForJobOptions,
): Promise<CallToolResult> {
	return guard(async () => {
		requireVideoRef(input);
		const body = {
			url: input.url,
			videoId: input.videoId,
			lang: input.lang,
			length: input.length,
			sourceLang: input.sourceLang,
		};
		const submitted = extra?.signal
			? await api.submitSummary(body, { signal: extra.signal })
			: await api.submitSummary(body);
		const job = await resolveJob(api, submitted, extra, waitOptions);
		const result = job.result as SummaryResult;
		return json({
			video: result.video,
			article: result.article,
			cached: result.cached,
			usage: result.usage
				? { ...result.usage, creditsCharged: job.creditsCharged }
				: { creditsCharged: job.creditsCharged, creditsRemaining: null },
		});
	});
}
