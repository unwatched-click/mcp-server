import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createHttpApp } from '../../src/transports/http.js';
import { version } from '../../src/utils/version.js';

const KEY = 'unw_sk_test-key';
const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
const DEFAULT_PUBLIC_URL = 'https://mcp.unwatched.click';
const CHALLENGE = `Bearer resource_metadata="${DEFAULT_PUBLIC_URL}${RESOURCE_METADATA_PATH}", scope="mcp"`;
const INVALID_TOKEN_CHALLENGE = `${CHALLENGE}, error="invalid_token"`;
const INVALID_TOKEN_MESSAGE = 'Invalid or expired OAuth access token.';
const PING = { jsonrpc: '2.0', id: 1, method: 'ping' };
const MCP_HEADERS: Record<string, string> = {
	authorization: `Bearer ${KEY}`,
	'content-type': 'application/json',
	accept: 'application/json, text/event-stream',
};

let server: Server | undefined;
let baseUrl: string;
const clientFetch = fetch;

async function listen(app = createHttpApp()) {
	const listener = app.listen(0, '127.0.0.1');
	await once(listener, 'listening');
	const address = listener.address();
	if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
	return { server: listener, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function close(listener: Server) {
	listener.closeAllConnections();
	await new Promise<void>((resolve) => listener.close(() => resolve()));
}

beforeAll(async () => {
	vi.stubEnv('MCP_PUBLIC_URL', undefined);
	vi.stubEnv('MCP_AUTH_SERVER', undefined);
	const app = createHttpApp();
	vi.unstubAllEnvs();
	({ server, baseUrl } = await listen(app));
});

afterAll(() => server && close(server));

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

function post(body: unknown, headers: Record<string, string> = MCP_HEADERS, url = baseUrl): Promise<Response> {
	return clientFetch(`${url}/mcp`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
}

async function postRpc(body: unknown, headers: Record<string, string> = MCP_HEADERS): Promise<Record<string, unknown>> {
	return readSseResponse(await post(body, headers));
}

describe('unauthenticated /mcp access', () => {
	it('challenges a POST without a credential and explains both ways to authenticate', async () => {
		const res = await post(PING, { ...MCP_HEADERS, authorization: '' });
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toBe(CHALLENGE);
		const body = await res.json() as { error: { code: string; message: string } };
		expect(body.error.code).toBe('UNAUTHORIZED');
		expect(body.error.message).toContain('Sign in to Unwatched or send an API key');
	});
});

describe('OAuth resource metadata', () => {
	it.each([RESOURCE_METADATA_PATH, `${RESOURCE_METADATA_PATH}/mcp`])('publishes %s without auth or a redirect', async (path) => {
		const response = await clientFetch(`${baseUrl}${path}`, {
			headers: { origin: 'https://example.test' },
			redirect: 'manual',
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
		expect(await response.json()).toEqual({
			resource: `${DEFAULT_PUBLIC_URL}/mcp`,
			authorization_servers: ['https://api.unwatched.click'],
			scopes_supported: ['mcp'],
			bearer_methods_supported: ['header'],
			resource_name: 'Unwatched',
			resource_documentation: 'https://unwatched.click/en/api-docs',
		});
	});

	it('uses the configured public URL and authorization server', async () => {
		const publicUrl = 'https://mcp.example.test';
		const authServer = 'https://issuer.example.test';
		vi.stubEnv('MCP_PUBLIC_URL', `${publicUrl}/`);
		vi.stubEnv('MCP_AUTH_SERVER', authServer);
		const app = createHttpApp();
		vi.unstubAllEnvs();
		const custom = await listen(app);
		try {
			const metadata = await clientFetch(`${custom.baseUrl}${RESOURCE_METADATA_PATH}/mcp`);
			expect(await metadata.json()).toMatchObject({
				resource: `${publicUrl}/mcp`,
				authorization_servers: [authServer],
			});
			const response = await post(PING, { ...MCP_HEADERS, authorization: '' }, custom.baseUrl);
			expect(response.status).toBe(401);
			expect(response.headers.get('www-authenticate'))
				.toBe(`Bearer resource_metadata="${publicUrl}${RESOURCE_METADATA_PATH}", scope="mcp"`);
		} finally {
			await close(custom.server);
		}
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

	it('lists OAuth security schemes on every hosted tool', async () => {
		const payload = await postRpc(
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' },
			{ ...MCP_HEADERS, 'mcp-protocol-version': '2025-06-18' },
		);
		const result = payload.result as { tools: Tool[] };
		expect(result.tools).toHaveLength(8);
		for (const tool of result.tools) {
			expect(tool._meta?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['mcp'] }]);
		}
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

describe('OAuth access token validation', () => {
	const CREDITS_URL = 'https://api.example.test/api/v1/credits';
	const VIDEO_ID = 'dQw4w9WgXcQ';
	const VIDEO_URL = `https://api.example.test/api/v1/videos/${VIDEO_ID}`;
	const VIDEO_CALL = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
		name: 'get_video_info',
		arguments: { videoId: VIDEO_ID },
	} };
	const apiFetch = vi.fn<typeof fetch>();

	function oauthHeaders(name: string) {
		return { ...MCP_HEADERS, authorization: `bearer unw_at_test-${name}` };
	}

	function invalidToken() {
		return Response.json(
			{ error: { code: 'UNAUTHORIZED', message: INVALID_TOKEN_MESSAGE } },
			{ status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } },
		);
	}

	beforeEach(() => {
		apiFetch.mockReset();
		vi.stubGlobal('fetch', apiFetch);
		vi.stubEnv('UNWATCHED_API_BASE', 'https://api.example.test');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it('returns an HTTP invalid_token challenge before streaming and retries an invalid credential on the next POST', async () => {
		apiFetch.mockImplementation(async () => invalidToken());
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await post(VIDEO_CALL, oauthHeaders('invalid'));
			expect(response.status).toBe(401);
			expect(response.headers.get('www-authenticate')).toBe(INVALID_TOKEN_CHALLENGE);
			expect(response.headers.get('content-type')).toContain('application/json');
			expect(await response.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: INVALID_TOKEN_MESSAGE } });
		}
		expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([CREDITS_URL, CREDITS_URL]);
	});

	it('forwards the OAuth credential and reuses successful validation only for that token and within the TTL', async () => {
		const clock = vi.spyOn(Date, 'now');
		const video = { videoId: VIDEO_ID, title: 'Example video' };
		apiFetch.mockImplementation(async (url) => Response.json(url === VIDEO_URL ? { video } : {}));
		const headers = oauthHeaders('valid');
		const tool = await postRpc(VIDEO_CALL, headers);
		expect(tool.result).toMatchObject({ content: [{ type: 'text', text: expect.stringContaining(video.title) }] });
		await postRpc(PING, headers);
		await postRpc(PING, oauthHeaders('different'));
		const apiRequests = apiFetch.mock.calls.map(([url, init]) => ({
			url, method: init?.method, authorization: new Headers(init?.headers).get('authorization'),
		}));
		expect(apiRequests).toEqual([
			{ url: CREDITS_URL, method: 'GET', authorization: 'Bearer unw_at_test-valid' },
			{ url: VIDEO_URL, method: 'GET', authorization: 'Bearer unw_at_test-valid' },
			{ url: CREDITS_URL, method: 'GET', authorization: 'Bearer unw_at_test-different' },
		]);
		clock.mockReturnValue(Date.now() + 15_001);
		apiFetch.mockResolvedValueOnce(invalidToken());
		const expired = await post(PING, headers);
		expect(expired.status).toBe(401);
		expect(expired.headers.get('www-authenticate')).toBe(INVALID_TOKEN_CHALLENGE);
		expect(apiFetch).toHaveBeenCalledTimes(4);
	});

	it('bounds the cache and revalidates the oldest credential after eviction', async () => {
		apiFetch.mockImplementation(async () => Response.json({}));
		const notification = { jsonrpc: '2.0', method: 'notifications/initialized' };
		const firstHeaders = oauthHeaders('oldest');
		expect((await post(notification, firstHeaders)).status).toBe(202);
		for (let offset = 0; offset < 256; offset += 16) {
			const responses = await Promise.all(Array.from({ length: 16 }, (_, index) =>
				post(notification, oauthHeaders(`cache-${offset + index}`))));
			expect(responses.every((response) => response.status === 202)).toBe(true);
		}
		expect((await post(notification, firstHeaders)).status).toBe(202);
		expect(apiFetch).toHaveBeenCalledTimes(258);
	});

	it('does not challenge or cache a temporary API failure', async () => {
		const headers = oauthHeaders('rate-limited');
		apiFetch.mockResolvedValueOnce(Response.json({}, { status: 429, headers: { 'Retry-After': '7' } }));
		const response = await post(PING, headers);
		expect(response.status).toBe(503);
		expect(response.headers.get('www-authenticate')).toBeNull();
		expect(response.headers.get('retry-after')).toBe('7');
		apiFetch.mockResolvedValueOnce(Response.json({}));
		await postRpc(PING, headers);
		expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([CREDITS_URL, CREDITS_URL]);
	});

	it('adds a tool-level challenge and evicts a token rejected after SSE starts', async () => {
		const headers = oauthHeaders('expired-during-call');
		apiFetch.mockResolvedValueOnce(Response.json({}))
			.mockImplementation(async () => invalidToken());
		const payload = await postRpc(VIDEO_CALL, headers);
		expect(payload.result).toMatchObject({
			isError: true,
			content: [{ type: 'text', text: expect.stringContaining('Sign in again') }],
			_meta: {
				'mcp/www_authenticate': `${INVALID_TOKEN_CHALLENGE}, error_description="${INVALID_TOKEN_MESSAGE}"`,
			},
		});
		const response = await post(PING, headers);
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toBe(INVALID_TOKEN_CHALLENGE);
		expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([CREDITS_URL, VIDEO_URL, CREDITS_URL]);
	});

	it('keeps API key failures as tool errors without an extra API request', async () => {
		apiFetch.mockResolvedValueOnce(Response.json(
			{ error: { code: 'INVALID_API_KEY', message: 'API key is not valid.' } },
			{ status: 401 },
		));
		const { result } = await postRpc(VIDEO_CALL);
		expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('API key') }] });
		expect(result).not.toHaveProperty('_meta');
		expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([VIDEO_URL]);
	});
});
