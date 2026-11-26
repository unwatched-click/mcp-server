import { once } from 'node:events';
import { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../src/server.js';
import { startHttpServer } from '../../src/transports/http.js';
import { createFakeApi } from '../tools/fake-api.js';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const RUNNING_JOB = {
	id: 'job_running',
	status: 'running',
	progress: { stage: 'generating', percent: 50 },
	creditsCharged: 0,
	createdAt: '2026-11-26T10:00:00.000Z',
	startedAt: '2026-11-26T10:00:01.000Z',
	completedAt: null,
} as const;

describe('HTTP shutdown', () => {
	it('closes the listener once and clears the deadline after the last response', async () => {
		vi.useFakeTimers();
		vi.spyOn(Server.prototype, 'listen').mockReturnThis();
		const { server, shutdown } = startHttpServer(0);
		const close = vi.spyOn(server, 'close').mockReturnThis();
		const closeIdle = vi.spyOn(server, 'closeIdleConnections').mockImplementation(() => {});
		const forceClose = vi.spyOn(server, 'closeAllConnections');
		const req = new IncomingMessage(new Socket());
		const res = new ServerResponse(req);
		server.listeners('request')[0].call(server, req, res);

		const closed = shutdown();
		expect(shutdown()).toBe(closed);
		expect(close).toHaveBeenCalledTimes(1);
		expect(forceClose).not.toHaveBeenCalled();

		res.emit('finish');
		await vi.advanceTimersByTimeAsync(0);
		expect(closeIdle).toHaveBeenCalledOnce();
		close.mock.calls[0][0]?.();
		await closed;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(forceClose).not.toHaveBeenCalled();
	});

	it('force-closes stuck HTTP connections after ten seconds', async () => {
		vi.useFakeTimers();
		vi.spyOn(Server.prototype, 'listen').mockReturnThis();
		const { server, shutdown } = startHttpServer(0);
		vi.spyOn(server, 'close').mockReturnThis();
		const forceClose = vi.spyOn(server, 'closeAllConnections').mockImplementation(() => {});

		const closed = expect(shutdown()).rejects.toThrow('MCP HTTP shutdown timed out');
		await vi.advanceTimersByTimeAsync(9_999);
		expect(forceClose).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await closed;
		expect(forceClose).toHaveBeenCalledOnce();
	});

	it('stops listening and drains an active HTTP tool call with a retry response', async () => {
		const clientFetch = fetch;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
			{ ...RUNNING_JOB, kind: 'summary' },
			{ status: 202, headers: { 'Retry-After': '60' } },
		)));
		const { server, shutdown } = startHttpServer(0);
		await once(server, 'listening');
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
			const baseUrl = `http://127.0.0.1:${address.port}`;
			const response = await clientFetch(`${baseUrl}/mcp`, {
				method: 'POST',
				headers: {
					accept: 'application/json, text/event-stream',
					'content-type': 'application/json',
					'x-api-key': 'test-key',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: {
						name: 'summarize_video',
						arguments: { videoId: 'dQw4w9WgXcQ', lang: 'en' },
						_meta: { progressToken: 1 },
					},
				}),
			});
			expect(response.status).toBe(200);
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			expect(decoder.decode((await reader.read()).value)).toContain('notifications/progress');

			const closed = shutdown();
			expect(server.listening).toBe(false);
			let remaining = '';
			let chunk = await reader.read();
			while (!chunk.done) {
				remaining += decoder.decode(chunk.value, { stream: true });
				chunk = await reader.read();
			}
			await closed;
			expect(remaining).toContain('"isError":true');
			expect(remaining).toContain('Retry this tool with the same input');
		} finally {
			await shutdown();
		}
	});

	it.each([
		{ name: 'summarize_video', kind: 'summary', args: { videoId: 'dQw4w9WgXcQ', lang: 'en' } },
		{ name: 'translate_transcript', kind: 'translation', args: { videoId: 'dQw4w9WgXcQ', sourceLang: 'en', targetLang: 'uk' } },
	] as const)('sends a retryable tool error over SSE for $name', async ({ name, kind, args }) => {
		const api = createFakeApi();
		api.submitSummary.mockResolvedValue({ ...RUNNING_JOB, kind: 'summary' });
		api.submitTranslation.mockResolvedValue({ ...RUNNING_JOB, kind: 'translation' });
		const shutdown = new AbortController();
		const server = createServer(api, shutdown.signal);
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		await server.connect(transport);
		try {
			const response = await transport.handleRequest(new Request('http://localhost/mcp', {
				method: 'POST',
				headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name, arguments: args, _meta: { progressToken: 1 } },
				}),
			}));
			expect(response.status).toBe(200);
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			const progress = decoder.decode((await reader.read()).value);
			expect(progress).toContain('notifications/progress');
			expect(kind === 'summary' ? api.submitSummary : api.submitTranslation).toHaveBeenCalledOnce();

			const retryGuidance = 'The MCP server is restarting. Retry this tool with the same input.';
			shutdown.abort(new DOMException(retryGuidance, 'AbortError'));
			const result = decoder.decode((await reader.read()).value);
			expect(result).toContain('"isError":true');
			expect(result).toContain(retryGuidance);
			expect((await reader.read()).done).toBe(true);
			expect(api.getJob).not.toHaveBeenCalled();
		} finally {
			await server.close();
		}
	});
});
