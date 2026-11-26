import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import { MAX_TRANSCRIPT_CHARS, json, ok, renderSegments, stamp } from '../../src/tools/shared/format.js';
import { requireVideoRef, resolveVideoId } from '../../src/tools/shared/video-ref.js';

describe('stamp', () => {
	it('formats seconds the way YouTube transcripts do', () => {
		expect(stamp(0)).toBe('00:00');
		expect(stamp(59.9)).toBe('00:59');
		expect(stamp(61.2)).toBe('01:01');
		expect(stamp(213)).toBe('03:33');
		expect(stamp(3600)).toBe('1:00:00');
		expect(stamp(3661.7)).toBe('1:01:01');
	});

	it('clamps negative values to zero', () => {
		expect(stamp(-5)).toBe('00:00');
	});
});

describe('renderSegments', () => {
	it('returns nothing for an empty transcript', () => {
		expect(renderSegments([])).toEqual({ text: '', truncated: false, included: 0 });
	});

	it('keeps a line that exactly fills the cap, then announces the cut', () => {
		const filler = 'x'.repeat(MAX_TRANSCRIPT_CHARS - 8); // '[00:00] ' is 8 chars
		const rendered = renderSegments([
			{ start: 0, end: 1, text: filler },
			{ start: 2, end: 3, text: 'one line too many' },
		]);
		expect(rendered).toEqual({ text: `[00:00] ${filler}`, truncated: true, included: 1 });
	});
});

describe('result helpers', () => {
	it('ok wraps text, json pretty-prints', () => {
		expect(ok('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] });
		expect(json({ a: 1 })).toEqual({ content: [{ type: 'text', text: '{\n  "a": 1\n}' }] });
	});
});

describe('requireVideoRef', () => {
	it('accepts either form and rejects neither', () => {
		expect(() => requireVideoRef({ url: 'https://youtu.be/dQw4w9WgXcQ' })).not.toThrow();
		expect(() => requireVideoRef({ videoId: 'dQw4w9WgXcQ' })).not.toThrow();
		expect(() => requireVideoRef({})).toThrow(ApiError);
		expect(() => requireVideoRef({})).toThrow('url or videoId is required');
	});
});

describe('resolveVideoId', () => {
	it('extracts ids from every supported URL shape', () => {
		expect(resolveVideoId({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123' })).toBe('dQw4w9WgXcQ');
		expect(resolveVideoId({ url: 'https://youtu.be/dQw4w9WgXcQ?t=30' })).toBe('dQw4w9WgXcQ');
		expect(resolveVideoId({ url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' })).toBe('dQw4w9WgXcQ');
		expect(resolveVideoId({ url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' })).toBe('dQw4w9WgXcQ');
		expect(resolveVideoId({ url: 'dQw4w9WgXcQ' })).toBe('dQw4w9WgXcQ');
	});

	it('truncates junk after the id in youtu.be paths', () => {
		expect(resolveVideoId({ url: 'https://youtu.be/dQw4w9WgXcQ%20junk' })).toBe('dQw4w9WgXcQ');
	});

	it('keeps the backend validation messages', () => {
		expect(() => resolveVideoId({ videoId: 'short' })).toThrow('videoId must be an 11-character YouTube id');
		expect(() => resolveVideoId({ url: 'https://example.com/no-id' })).toThrow('Invalid YouTube URL');
		expect(() => resolveVideoId({ url: 'https://youtu.be/' })).toThrow('Invalid YouTube video ID (must be 11 characters)');
	});
});
