import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VideoInfo } from '../../src/api/types.js';
import { registerAllTools } from '../../src/tools/index.js';
import { createFakeApi } from './fake-api.js';

/** Minimal structural view of the JSON schema `tools/list` reports. */
interface JsonSchemaShape {
	properties?: Record<string, { type?: string; maxItems?: number }>;
	required?: string[];
}

async function startServer() {
	const server = new McpServer({ name: 'unwatched-click-mcp', version: '0.1.0' });
	const api = createFakeApi();
	registerAllTools(server, api);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'registry-test-client', version: '0.0.0' });
	await client.connect(clientTransport);
	return { server, api, client };
}

const VIDEO_INFO_JSON = `{
  "videoId": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "durationSeconds": 213,
  "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "publishedAt": "2009-10-25T06:57:33.000Z"
}`;

describe('registerAllTools', () => {
	it('exposes exactly the eight Unwatched tools', async () => {
		const { server, client } = await startServer();

		const { tools } = await client.listTools();

		expect(tools.map(tool => tool.name)).toEqual([
			'get_video_subtitles',
			'list_subtitle_tracks',
			'get_video_info',
			'get_video_frame',
			'translate_transcript',
			'summarize_video',
			'search_articles',
			'get_credit_balance',
		]);
		await client.close();
		await server.close();
	});

	it('reports input schemas for the tools', async () => {
		const { server, client } = await startServer();

		const { tools } = await client.listTools();
		const byName = new Map(tools.map(tool => [tool.name, tool]));

		const subtitlesSchema = byName.get('get_video_subtitles')!.inputSchema as JsonSchemaShape;
		expect(Object.keys(subtitlesSchema.properties ?? {})).toEqual(['url', 'videoId', 'lang']);
		expect(subtitlesSchema.required).toBeUndefined();

		const frameSchema = byName.get('get_video_frame')!.inputSchema as JsonSchemaShape;
		expect(Object.keys(frameSchema.properties ?? {})).toEqual(['url', 'videoId', 'timestamps', 'width']);
		expect(frameSchema.required).toEqual(['timestamps']);
		expect(frameSchema.properties?.timestamps?.maxItems).toBe(5);

		const translateSchema = byName.get('translate_transcript')!.inputSchema as JsonSchemaShape;
		expect(translateSchema.required).toEqual(['videoId', 'sourceLang', 'targetLang']);

		const summarizeSchema = byName.get('summarize_video')!.inputSchema as JsonSchemaShape;
		expect(summarizeSchema.required).toEqual(['lang']);

		const balanceSchema = byName.get('get_credit_balance')!.inputSchema as JsonSchemaShape;
		expect(balanceSchema.properties).toEqual({});
		await client.close();
		await server.close();
	});

	it('serves a tools/call end to end through the in-memory transport', async () => {
		const { server, api, client } = await startServer();
		api.getVideoInfo.mockResolvedValue({
			videoId: 'dQw4w9WgXcQ',
			title: 'Never Gonna Give You Up',
			durationSeconds: 213,
			thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
			publishedAt: '2009-10-25T06:57:33.000Z',
		} satisfies VideoInfo);

		const result = await client.callTool({ name: 'get_video_info', arguments: { videoId: 'dQw4w9WgXcQ' } });

		expect(api.getVideoInfo).toHaveBeenCalledWith('dQw4w9WgXcQ');
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: VIDEO_INFO_JSON }]);
		await client.close();
		await server.close();
	});
});
