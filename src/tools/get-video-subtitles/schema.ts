import { z } from 'zod';

export const getVideoSubtitlesInputSchema = z.object({
	url: z.string().optional().describe('Full YouTube URL. Either this or videoId is required.'),
	videoId: z.string().optional().describe('11-character YouTube video id.'),
	lang: z.string().optional().describe('Subtitle language code, e.g. "en". Defaults to the video\'s best available track.'),
});

export type GetVideoSubtitlesInput = z.infer<typeof getVideoSubtitlesInputSchema>;
