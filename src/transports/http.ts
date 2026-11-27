import { createHash } from 'node:crypto';
import { createServer as createNodeServer } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiError } from '../api/errors.js';
import { ApiClient } from '../http/client.js';
import { createServer } from '../server.js';
import { version } from '../utils/version.js';

const KEYS_URL = 'https://unwatched.click/en/developer/keys';
const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
const MCP_SCOPE = 'mcp';
const OAUTH_TOOL_META = { securitySchemes: [{ type: 'oauth2', scopes: [MCP_SCOPE] }] };
const OAUTH_VALIDATION_TIMEOUT_MS = 5_000;
const OAUTH_CACHE_TTL_MS = 15_000;
const OAUTH_CACHE_MAX_SIZE = 256;
const POLL_GRACE_MS = 5_000;
const HTTP_DRAIN_TIMEOUT_MS = 10_000;
const MCP_ALLOWED_METHODS = 'POST, OPTIONS';

/** Prefer the Bearer credential and retain the legacy API key header as a fallback. */
function readCredential(req: Request): string | null {
	const bearer = /^Bearer[ \t]+(.+)$/i.exec(req.headers.authorization ?? '')?.[1].trim();
	if (bearer) return bearer;
	const alt = req.headers['x-api-key'];
	if (typeof alt === 'string' && alt.trim()) return alt.trim();
	return null;
}

function unauthorized(res: Response, challenge: string, message: string): void {
	res.set({ 'WWW-Authenticate': challenge, 'Cache-Control': 'no-store' });
	res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
}

function createOAuthAuthenticator(invalidTokenChallenge: string) {
	const cache = new Map<string, { expiresAt: number }>();

	return async (token: string, res: Response): Promise<ApiClient | undefined> => {
		const digest = createHash('sha256').update(token).digest('hex');
		let entry = cache.get(digest);
		if (!entry) {
			if (cache.size >= OAUTH_CACHE_MAX_SIZE) {
				const oldest = cache.keys().next();
				if (!oldest.done) cache.delete(oldest.value);
			}
			entry = { expiresAt: 0 };
			cache.set(digest, entry);
		}

		const api = new ApiClient(token, {
			oauth: { invalidTokenChallenge, invalidate: () => cache.delete(digest) },
		});
		if (entry.expiresAt > Date.now()) return api;

		const disconnected = new AbortController();
		const onClose = () => disconnected.abort();
		res.once('close', onClose);
		try {
			await api.getCredits({
				signal: AbortSignal.any([disconnected.signal, AbortSignal.timeout(OAUTH_VALIDATION_TIMEOUT_MS)]),
			});
			// Update the entry in place so a late success cannot reinsert an invalidated entry.
			entry.expiresAt = Date.now() + OAUTH_CACHE_TTL_MS;
			return api;
		} catch (error) {
			if (res.destroyed) return;
			if (error instanceof ApiError && error.authChallenge) {
				unauthorized(res, error.authChallenge, 'Invalid or expired OAuth access token.');
				return;
			}
			if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
				res.set('Retry-After', String(error.retryAfterSeconds));
			}
			res.status(503).json({
				error: { code: 'SERVICE_UNAVAILABLE', message: 'Could not verify the Unwatched sign-in. Retry later.' },
			});
		} finally {
			res.off('close', onClose);
		}
	};
}

/** A fresh server + transport per request: no session state, no GET/SSE stream to buffer. */
async function handleMcpRequest(
	req: Request,
	res: Response,
	api: ApiClient,
	pollShutdownSignal?: AbortSignal,
): Promise<void> {
	const server = createServer(api, pollShutdownSignal, OAUTH_TOOL_META);
	const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

	// Tear both down when the client disconnects, so an aborted request
	// cannot leak a transport per call.
	res.on('close', () => {
		transport.close().catch(() => {});
		server.close().catch(() => {});
	});

	await server.connect(transport);
	await transport.handleRequest(req, res, req.body);
}

function notAllowed(res: Response): void {
	res.set('Allow', MCP_ALLOWED_METHODS).status(405).json({
		error: {
			code: 'METHOD_NOT_ALLOWED',
			message: 'This MCP endpoint is stateless: use POST for JSON-RPC requests.',
		},
	});
}

function notConfigured(res: Response): void {
	res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not configured on this server.' } });
}

/** Body-parser and handler failures use the same status the error carries. */
function errorStatus(error: unknown): number {
	if (error && typeof error === 'object') {
		for (const key of ['status', 'statusCode'] as const) {
			const status = (error as Record<string, unknown>)[key];
			if (typeof status === 'number' && status >= 400 && status < 600) return status;
		}
	}
	return 500;
}

/**
 * Streamable HTTP app factory, so tests can mount it without listening.
 * Responses stream (SSE), not a single JSON body, so long tool calls can
 * push progress notifications over the same response.
 */
export function createHttpApp(options?: {
	isDraining: () => boolean;
	pollShutdownSignal: AbortSignal;
}): Express {
	const publicUrl = (process.env.MCP_PUBLIC_URL ?? 'https://mcp.unwatched.click').replace(/\/+$/, '');
	const authServer = process.env.MCP_AUTH_SERVER ?? 'https://api.unwatched.click';
	const challenge = `Bearer resource_metadata="${publicUrl}${RESOURCE_METADATA_PATH}", scope="${MCP_SCOPE}"`;
	const authenticateOAuth = createOAuthAuthenticator(`${challenge}, error="invalid_token"`);
	const validateBrowserHost = hostHeaderValidation([new URL(publicUrl).hostname, 'localhost', '127.0.0.1', '[::1]']);
	const parseJson = express.json({ limit: '1mb' });

	const app = express();
	app.set('trust proxy', 1);
	app.all('/mcp', (req, res, next) => {
		res.set({
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
		});
		const origin = req.get('Origin');
		if (origin === undefined) {
			next();
			return;
		}
		if (!/^https?:\/\//.test(origin) || !URL.canParse(origin) || new URL(origin).origin !== origin) {
			res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid Origin header.' } });
			return;
		}
		// Allow browser clients on other origins while rejecting requests to rebound hostnames.
		validateBrowserHost(req, res, next);
	}, (req, res, next) => {
		if (req.method === 'OPTIONS' && req.get('Origin') && req.get('Access-Control-Request-Method')) {
			res.set({
				'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID, x-api-key',
			}).status(204).end();
			return;
		}
		next();
	});
	app.use((_req: Request, res: Response, next: NextFunction) => {
		if (options?.isDraining()) {
			res.set({ Connection: 'close', 'Retry-After': '1' }).status(503).end();
			return;
		}
		next();
	});
	app.route('/mcp')
		.all(async (req, res, next) => {
			const credential = readCredential(req);
			if (!credential) {
				unauthorized(res, challenge,
					`Sign in to Unwatched or send an API key as "Authorization: Bearer <key>" or "x-api-key". Get a key at ${KEYS_URL}.`);
				return;
			}
			const api = credential.startsWith('unw_at_')
				? await authenticateOAuth(credential, res)
				: new ApiClient(credential);
			if (!api || res.destroyed) return;
			res.locals.api = api;
			next();
		})
		.post(parseJson, async (req, res: Response<unknown, { api: ApiClient }>) => {
			await handleMcpRequest(req, res, res.locals.api, options?.pollShutdownSignal);
		})
		.options((_req, res) => {
			res.set('Allow', MCP_ALLOWED_METHODS).status(204).end();
		})
		.all((_req, res) => notAllowed(res));

	app.use(parseJson);

	app.get('/health', (_req: Request, res: Response) => {
		res.json({ status: 'ok', version });
	});

	app.get([RESOURCE_METADATA_PATH, `${RESOURCE_METADATA_PATH}/mcp`], (_req: Request, res: Response) => {
		res.set('Access-Control-Allow-Origin', '*').json({
			resource: `${publicUrl}/mcp`,
			authorization_servers: [authServer],
			scopes_supported: [MCP_SCOPE],
			bearer_methods_supported: ['header'],
			resource_name: 'Unwatched',
			resource_documentation: 'https://unwatched.click/en/api-docs',
		});
	});

	// Directory domain proofs, visible only when the operator set the token.
	app.get('/.well-known/glama.json', (_req: Request, res: Response) => {
		const claim = process.env.GLAMA_CLAIM_TOKEN;
		if (!claim) {
			notConfigured(res);
			return;
		}
		res.json({ $schema: 'https://glama.ai/mcp/schemas/connector.json', claim });
	});

	app.get('/.well-known/mcprush.com-claim.txt', (_req: Request, res: Response) => {
		const claim = process.env.MCPRUSH_CLAIM_TOKEN;
		if (!claim) {
			notConfigured(res);
			return;
		}
		res.type('text/plain').send(`${claim}\n`);
	});

	app.get('/.well-known/openai-apps-challenge', (_req: Request, res: Response) => {
		const token = process.env.OPENAI_APPS_CHALLENGE;
		res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
		if (!token) {
			notConfigured(res);
			return;
		}
		res.type('text/plain; charset=utf-8').end(token);
	});

	// Express 5 forwards rejected handler promises here too; keep every
	// failure a JSON envelope, never an HTML error page.
	app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
		if (res.headersSent) {
			next(error);
			return;
		}
		console.error('unwatched-click-mcp request failed:', error);
		const status = errorStatus(error);
		res.status(status).json({
			error: {
				code: status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
				message: status < 500 ? 'Request could not be processed.' : 'Internal server error.',
			},
		});
	});

	return app;
}

export function startHttpServer(port: number) {
	const pollShutdown = new AbortController();
	let closing: Promise<void> | undefined;
	const app = createHttpApp({
		isDraining: () => closing !== undefined,
		pollShutdownSignal: pollShutdown.signal,
	});
	const server = createNodeServer(app);
	// Runs behind a reverse proxy: keep idle keep-alive sockets open longer than
	// the proxy does, so it never reuses a socket Node has already closed.
	server.keepAliveTimeout = 75_000;
	server.headersTimeout = 76_000;
	server.prependListener('request', (_req, res) => {
		res.once('finish', () => {
			// Connections that become idle during the drain can outlive server.close().
			if (closing) setImmediate(() => server.closeIdleConnections());
		});
	});
	server.listen(port, () => {
		console.error(`unwatched-click-mcp HTTP server listening on :${port}`);
	});

	function shutdown(): Promise<void> {
		closing ??= new Promise<void>((resolve, reject) => {
			const pollTimer = setTimeout(() => {
				pollShutdown.abort(new DOMException(
					'The MCP server is restarting. The API job can finish in the background. Retry this tool with the same input to retrieve the result.',
					'AbortError',
				));
			}, POLL_GRACE_MS);
			const drainTimer = setTimeout(() => {
				server.closeAllConnections();
				reject(new Error('MCP HTTP shutdown timed out'));
			}, HTTP_DRAIN_TIMEOUT_MS);

			server.close((error) => {
				clearTimeout(pollTimer);
				clearTimeout(drainTimer);
				if (error) reject(error);
				else resolve();
			});
		});
		return closing;
	}

	return { server, shutdown };
}
