import { z } from 'zod';

export const summarizeVideoInputSchema = z.object({
	url: z.string().optional().describe('Full YouTube URL. Either this or videoId is required.'),
	videoId: z.string().optional().describe('11-character YouTube video id.'),
	lang: z.string().describe('Language for the article, e.g. "en". Use "auto" to keep the video\'s language.'),
	length: z.enum(['brief', 'medium', 'full']).optional().describe('Article length. Defaults to "medium".'),
	sourceLang: z.string().optional().describe('Language of the source subtitles, when it differs from the article language.'),
	aiTranscript: z.boolean().optional().describe(
		'Opt in to AI transcription when the video has no subtitles. A fresh transcript costs extra credits. '
		+ 'Ask the user to approve the extra cost before setting this to true. The NO_SUBTITLES error gives a price estimate when AI transcription is available. Defaults to false.',
	),
});

export type SummarizeVideoInput = z.infer<typeof summarizeVideoInputSchema>;
