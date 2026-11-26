import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiClient } from '../http/client.js';
import { createServer } from '../server.js';
import { version } from '../utils/version.js';

const KEYS_URL = 'https://unwatched.click/en/developer/keys';

/** `Authorization: Bearer <key>` (what MCP clients can set) or `x-api-key` (friendlier for curl). */
function readApiKey(req: Request): string | null {
	const authorization = req.headers.authorization;
	if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
		const key = authorization.slice('Bearer '.length).trim();
		if (key) return key;
	}
	const alt = req.headers['x-api-key'];
	if (typeof alt === 'string' && alt.trim()) return alt.trim();
	return null;
}

/** A fresh server + transport per request: no session state, no GET/SSE stream to buffer. */
async function handleMcpRequest(req: Request, res: Response, apiKey: string): Promise<void> {
	const server = createServer(new ApiClient(apiKey));
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
	res.status(405).json({
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
export function createHttpApp(): Express {
	const app = express();
	app.set('trust proxy', 1);
	app.use(express.json({ limit: '1mb' }));

	app.get('/health', (_req: Request, res: Response) => {
		res.json({ status: 'ok', version });
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

	app.post('/mcp', async (req: Request, res: Response) => {
		const apiKey = readApiKey(req);
		if (!apiKey) {
			res.set('WWW-Authenticate', 'Bearer realm="unwatched"');
			res.status(401).json({
				error: {
					code: 'UNAUTHORIZED',
					message: `API key required. Send it as "Authorization: Bearer <key>" or "x-api-key". Get one at ${KEYS_URL}.`,
				},
			});
			return;
		}
		await handleMcpRequest(req, res, apiKey);
	});

	// Stateless mode has no server-initiated stream to attach to and no
	// session to terminate; say so explicitly instead of a confusing 404.
	app.all('/mcp', (_req: Request, res: Response) => {
		notAllowed(res);
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

export async function runHttp(): Promise<void> {
	const app = createHttpApp();
	const port = Number(process.env.PORT ?? 3002);
	const server = app.listen(port, () => {
		console.error(`unwatched-click-mcp HTTP server listening on :${port}`);
	});
	// Runs behind a reverse proxy: keep idle keep-alive sockets open longer than
	// the proxy does, so it never reuses a socket Node has already closed.
	server.keepAliveTimeout = 75_000;
	server.headersTimeout = 76_000;
}
