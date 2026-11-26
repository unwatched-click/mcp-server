import { z } from 'zod';

export const searchArticlesInputSchema = z.object({
	query: z.string().optional().describe('Text to match against video titles.'),
	category: z.string().optional().describe('Category slug filter.'),
	lang: z.string().optional().describe('Article language filter, e.g. "en".'),
	page: z.number().int().positive().optional().describe('1-based page number.'),
	limit: z.number().int().positive().max(50).optional().describe('Results per page, max 50. Defaults to 20.'),
});

export type SearchArticlesInput = z.infer<typeof searchArticlesInputSchema>;
