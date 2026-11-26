import { z } from 'zod';

export const translateTranscriptInputSchema = z.object({
	videoId: z.string().describe('11-character YouTube video id.'),
	sourceLang: z.string().describe('Language of the stored transcript, e.g. "en".'),
	targetLang: z.string().describe('Language to translate into, e.g. "uk".'),
});

export type TranslateTranscriptInput = z.infer<typeof translateTranscriptInputSchema>;
