import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHttpApp } from '../../src/transports/http.js';
import { version } from '../../src/utils/version.js';

const KEY = 'unw_sk_test-key';
const MCP_HEADERS: Record<string, string> = {
	authorization: `Bearer ${KEY}`,
	'content-type': 'application/json',
	accept: 'application/json, text/event-stream',
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	await new Promise<void>((resolve) => {
		server = createHttpApp().listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (typeof address !== 'object' || address === null) throw new Error('no port');
			const { port } = address as AddressInfo;
			baseUrl = `http://127.0.0.1:${port}`;
			resolve();
		});
	});
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Claim-token tests mutate the environment; never leak that to the machine.
const envBackup: Record<string, string | undefined> = {};
beforeAll(() => {
	for (const key of ['GLAMA_CLAIM_TOKEN', 'MCPRUSH_CLAIM_TOKEN']) {
		envBackup[key] = process.env[key];
		delete process.env[key];
	}
});
afterAll(() => {
	for (const [key, value] of Object.entries(envBackup)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

afterEach(() => {
	delete process.env.GLAMA_CLAIM_TOKEN;
	delete process.env.MCPRUSH_CLAIM_TOKEN;
});

/** Extracts the JSON-RPC payload from an SSE body (`event: message` + `data: ...`). */
async function readSseResponse(res: Response): Promise<Record<string, unknown>> {
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toContain('text/event-stream');
	const data = (await res.text())
		.split('\n')
		.filter((line) => line.startsWith('data: '))
		.map((line) => line.slice('data: '.length))
		.join('\n');
	expect(data).not.toBe('');
	return JSON.parse(data) as Record<string, unknown>;
}

async function postRpc(body: unknown, headers: Record<string, string> = MCP_HEADERS): Promise<Record<string, unknown>> {
	const res = await fetch(`${baseUrl}/mcp`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	return readSseResponse(res);
}

describe('unauthenticated /mcp access', () => {
	it('rejects POST without a key with 401 and WWW-Authenticate', async () => {
		const res = await fetch(`${baseUrl}/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
		});
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toBe('Bearer realm="unwatched"');
		const body = await res.json() as { error: { code: string; message: string } };
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(body.error.message).toContain('API key required');
	});
});

describe('method handling', () => {
	it('answers GET /mcp with 405', async () => {
		const res = await fetch(`${baseUrl}/mcp`);
		expect(res.status).toBe(405);
		const body = await res.json() as { error: { code: string } };
		expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
	});

	it('answers DELETE /mcp with 405', async () => {
		const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers: { authorization: `Bearer ${KEY}` } });
		expect(res.status).toBe(405);
		const body = await res.json() as { error: { code: string } };
		expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
	});
});

describe('GET /health', () => {
	it('reports status and version without a key', async () => {
		const res = await fetch(`${baseUrl}/health`);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: 'ok', version });
	});
});

describe('directory claim proofs', () => {
	it('returns 404 when tokens are unset', async () => {
		const glama = await fetch(`${baseUrl}/.well-known/glama.json`);
		expect(glama.status).toBe(404);
		const mcprush = await fetch(`${baseUrl}/.well-known/mcprush.com-claim.txt`);
		expect(mcprush.status).toBe(404);
	});

	it('serves the configured bodies when tokens are set', async () => {
		process.env.GLAMA_CLAIM_TOKEN = 'glama_claim_test-token';
		process.env.MCPRUSH_CLAIM_TOKEN = 'mcprush_test-claim-token';

		const glama = await fetch(`${baseUrl}/.well-known/glama.json`);
		expect(glama.status).toBe(200);
		expect(await glama.json()).toEqual({
			$schema: 'https://glama.ai/mcp/schemas/connector.json',
			claim: 'glama_claim_test-token',
		});

		const mcprush = await fetch(`${baseUrl}/.well-known/mcprush.com-claim.txt`);
		expect(mcprush.status).toBe(200);
		expect(mcprush.headers.get('content-type')).toContain('text/plain');
		expect(await mcprush.text()).toBe('mcprush_test-claim-token\n');
	});
});

describe('JSON-RPC over POST /mcp', () => {
	it('answers initialize', async () => {
		const res = await fetch(`${baseUrl}/mcp`, {
			method: 'POST',
			headers: MCP_HEADERS,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2025-06-18',
					capabilities: {},
					clientInfo: { name: 'vitest', version: '0.0.0' },
				},
			}),
		});
		const payload = await readSseResponse(res);
		// Stateless: no session id is ever issued.
		expect(res.headers.get('mcp-session-id')).toBeNull();

		const result = payload.result as {
			protocolVersion: string;
			capabilities: Record<string, unknown>;
			serverInfo: { name: string; version: string };
			instructions: string;
		};
		expect(payload.id).toBe(1);
		expect(payload.jsonrpc).toBe('2.0');
		expect(result.protocolVersion).toBe('2025-06-18');
		expect(result.capabilities).toBeTypeOf('object');
		expect(result.serverInfo).toEqual({ name: 'unwatched', version });
		expect(result.instructions).toContain('get_video_subtitles');
	});

	it('lists tools (the list may be empty in the stub)', async () => {
		const payload = await postRpc(
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' },
			{ ...MCP_HEADERS, 'mcp-protocol-version': '2025-06-18' },
		);
		const result = payload.result as { tools: unknown[] };
		expect(Array.isArray(result.tools)).toBe(true);
	});

	it('accepts the key via x-api-key instead of the Authorization header', async () => {
		const payload = await postRpc(
			{ jsonrpc: '2.0', id: 3, method: 'tools/list' },
			{ ...MCP_HEADERS, authorization: '', 'x-api-key': KEY },
		);
		expect(payload.id).toBe(3);
		expect(payload.error).toBeUndefined();
	});

	it('acknowledges notification-only POSTs with 202 and no body', async () => {
		const res = await fetch(`${baseUrl}/mcp`, {
			method: 'POST',
			headers: MCP_HEADERS,
			body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		});
		expect(res.status).toBe(202);
		expect(await res.text()).toBe('');
	});

	it('answers a malformed JSON body with the 400 error envelope', async () => {
		const res = await fetch(`${baseUrl}/mcp`, {
			method: 'POST',
			headers: MCP_HEADERS,
			body: '{oops',
		});
		expect(res.status).toBe(400);
		const body = await res.json() as { error: { code: string } };
		expect(body.error.code).toBe('INVALID_REQUEST');
	});
});
