import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import type { ArticleSearchResult } from '../../src/api/types.js';
import { searchArticlesHandler } from '../../src/tools/search-articles/handler.js';
import { createFakeApi } from './fake-api.js';

const VIDEO_ID = 'dQw4w9WgXcQ';

const searchResult: ArticleSearchResult = {
	articles: [
		{
			id: 42,
			videoId: VIDEO_ID,
			videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
			videoTitle: 'Never Gonna Give You Up',
			articleLang: 'en',
			title: 'Never Gonna Give You Up, explained',
			intro: "The video that became the internet's favorite bait-and-switch.",
			categories: [{ slug: 'music', label: 'Music' }],
			videoDuration: 213,
			videoPublishedAt: '2009-10-25T06:57:33.000Z',
			createdAt: '2026-11-20T10:00:00.000Z',
		},
	],
	total: 1,
	page: 2,
	limit: 10,
};

const SEARCH_JSON = `{
  "articles": [
    {
      "id": 42,
      "videoId": "dQw4w9WgXcQ",
      "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "videoTitle": "Never Gonna Give You Up",
      "articleLang": "en",
      "title": "Never Gonna Give You Up, explained",
      "intro": "The video that became the internet's favorite bait-and-switch.",
      "categories": [
        {
          "slug": "music",
          "label": "Music"
        }
      ],
      "videoDuration": 213,
      "videoPublishedAt": "2009-10-25T06:57:33.000Z",
      "createdAt": "2026-11-20T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 2,
  "limit": 10
}`;

describe('search_articles handler', () => {
	it('forwards every filter to searchArticles and returns the JSON', async () => {
		const api = createFakeApi();
		api.searchArticles.mockResolvedValue(searchResult);

		const result = await searchArticlesHandler({ query: 'never gonna', category: 'music', lang: 'en', page: 2, limit: 10 }, api);

		expect(api.searchArticles).toHaveBeenCalledTimes(1);
		expect(api.searchArticles).toHaveBeenCalledWith({ query: 'never gonna', category: 'music', lang: 'en', page: 2, limit: 10 });
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: SEARCH_JSON }]);
	});

	it('passes an empty query object through when no filters are given', async () => {
		const api = createFakeApi();
		api.searchArticles.mockResolvedValue(searchResult);

		await searchArticlesHandler({}, api);

		expect(api.searchArticles).toHaveBeenCalledWith({
			query: undefined,
			category: undefined,
			lang: undefined,
			page: undefined,
			limit: undefined,
		});
	});

	it('maps RATE_LIMITED to a retry hint using retryAfterSeconds', async () => {
		const api = createFakeApi();
		api.searchArticles.mockRejectedValue(new ApiError('RATE_LIMITED', 'Too many requests', 429, 15));

		const result = await searchArticlesHandler({ query: 'never gonna' }, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'Rate limited by the Unwatched API. Retry after 15 seconds.' }],
			isError: true,
		});
	});
});
