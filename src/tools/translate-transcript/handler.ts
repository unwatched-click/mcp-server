import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../../api/contract.js';
import type { TranslateResult } from '../../api/types.js';
import { guard } from '../shared/errors.js';
import { ok, renderSegments } from '../shared/format.js';
import { resolveJob, type JobToolExtra, type WaitForJobOptions } from '../shared/jobs.js';
import type { TranslateTranscriptInput } from './schema.js';

export async function translateTranscriptHandler(
	input: TranslateTranscriptInput,
	api: UnwatchedApi,
	extra?: JobToolExtra,
	waitOptions?: WaitForJobOptions,
): Promise<CallToolResult> {
	return guard(async () => {
		const body = {
			videoId: input.videoId,
			sourceLang: input.sourceLang,
			targetLang: input.targetLang,
		};
		const submitted = extra?.signal
			? await api.submitTranslation(body, { signal: extra.signal })
			: await api.submitTranslation(body);
		const job = await resolveJob(api, submitted, extra, waitOptions);
		const result = job.result as TranslateResult;
		const rendered = renderSegments(result.segments);
		const header = `${result.videoId}: ${input.sourceLang} → ${input.targetLang}  ·  `
			+ `${rendered.included}/${result.segments.length} segments  ·  `
			+ `credits charged: ${job.creditsCharged}${result.cached ? ' (cache hit)' : ''}`;
		return ok(`${header}\n\n${rendered.text}`);
	});
}
