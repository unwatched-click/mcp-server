import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Segment } from '../../api/types.js';

/**
 * Transcripts of long videos can be hundreds of KB. Agents burn their whole
 * context on that, so text output is capped and the cut is announced rather
 * than silently losing the tail.
 */
export const MAX_TRANSCRIPT_CHARS = 60_000;

/** Seconds → `[h:]mm:ss`, the format YouTube itself uses for transcript lines. */
export function stamp(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface RenderedSegments {
	text: string;
	truncated: boolean;
	included: number;
}

/** Renders segments as `[mm:ss] text` lines, stopping at the context cap. */
export function renderSegments(segments: Segment[]): RenderedSegments {
	const lines: string[] = [];
	let chars = 0;
	for (const seg of segments) {
		const line = `[${stamp(seg.start)}] ${seg.text}`;
		if (chars + line.length > MAX_TRANSCRIPT_CHARS) {
			return { text: lines.join('\n'), truncated: true, included: lines.length };
		}
		lines.push(line);
		chars += line.length + 1;
	}
	return { text: lines.join('\n'), truncated: false, included: lines.length };
}

/** Content blocks a tool may return; `content` on `CallToolResult` is optional. */
export type ToolContent = NonNullable<CallToolResult['content']>;

/** Text-only success result. */
export function ok(text: string): CallToolResult {
	return { content: [{ type: 'text', text }] };
}

/** Success result carrying pretty-printed JSON. */
export function json(value: unknown): CallToolResult {
	return ok(JSON.stringify(value, null, 2));
}
