import { z } from 'zod';

export const listSubtitleTracksInputSchema = z.object({
	url: z.string().optional().describe('Full YouTube URL. Either this or videoId is required.'),
	videoId: z.string().optional().describe('11-character YouTube video id.'),
});

export type ListSubtitleTracksInput = z.infer<typeof listSubtitleTracksInputSchema>;
