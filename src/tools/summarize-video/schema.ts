import { z } from 'zod';

export const summarizeVideoInputSchema = z.object({
	url: z.string().optional().describe('Full YouTube URL. Either this or videoId is required.'),
	videoId: z.string().optional().describe('11-character YouTube video id.'),
	lang: z.string().describe('Language for the article, e.g. "en". Use "auto" to keep the video\'s language.'),
	length: z.enum(['brief', 'medium', 'full']).optional().describe('Article length. Defaults to "medium".'),
	sourceLang: z.string().optional().describe('Language of the source subtitles, when it differs from the article language.'),
});

export type SummarizeVideoInput = z.infer<typeof summarizeVideoInputSchema>;
