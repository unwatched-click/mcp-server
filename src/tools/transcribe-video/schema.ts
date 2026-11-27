import { z } from 'zod';

export const transcribeVideoInputSchema = z.object({
	url: z.string().optional().describe('Full YouTube URL. Either this or videoId is required.'),
	videoId: z.string().optional().describe('11-character YouTube video id.'),
	lang: z.string().optional().describe('Language for on-screen descriptions when the video has no speech, e.g. "en". Defaults to "auto".'),
});

export type TranscribeVideoInput = z.infer<typeof transcribeVideoInputSchema>;
