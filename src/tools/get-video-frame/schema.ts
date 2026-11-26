import { z } from 'zod';
import { MAX_FRAMES_PER_REQUEST } from '../../api/contract.js';

export const getVideoFrameInputSchema = z.object({
	url: z.string().optional().describe('Full YouTube URL. Either this or videoId is required.'),
	videoId: z.string().optional().describe('11-character YouTube video id.'),
	timestamps: z.array(z.number().nonnegative()).min(1).max(MAX_FRAMES_PER_REQUEST)
		.describe('Timestamps in seconds from the start of the video. Rounded to whole seconds.'),
	width: z.number().int().min(160).max(1280).optional()
		.describe('Frame width in pixels, 160-1280. Defaults to 720. Use a smaller width when you only need the gist.'),
});

export type GetVideoFrameInput = z.infer<typeof getVideoFrameInputSchema>;
