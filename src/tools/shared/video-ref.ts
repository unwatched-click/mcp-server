import { ApiError } from '../../api/errors.js';
import type { VideoRef } from '../../api/types.js';

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Enforces the API rule "either url or videoId is required" before any call. */
export function requireVideoRef(input: VideoRef): void {
	if (!input.url && !input.videoId) {
		throw new ApiError('INVALID_REQUEST', 'url or videoId is required', 400);
	}
}

/**
 * Resolves a bare video id for the GET endpoints, which take the id in their
 * path. Mirrors the backend's `resolveVideoId`/`extractVideoId` rules and
 * messages, so agents see the same validation errors as the REST API.
 */
export function resolveVideoId(input: VideoRef): string {
	if (input.videoId) {
		if (!VIDEO_ID_PATTERN.test(input.videoId)) {
			throw new ApiError('INVALID_REQUEST', 'videoId must be an 11-character YouTube id', 400);
		}
		return input.videoId;
	}
	if (!input.url) {
		throw new ApiError('INVALID_REQUEST', 'url or videoId is required', 400);
	}
	return extractVideoId(input.url);
}

function extractVideoId(url: string): string {
	const truncate = (id: string) => id.replace(/[^A-Za-z0-9_-].*$/, '');
	const validate = (id: string) => {
		if (!VIDEO_ID_PATTERN.test(id)) {
			throw new ApiError('INVALID_REQUEST', 'Invalid YouTube video ID (must be 11 characters)', 400);
		}
		return id;
	};

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		// Not a URL: accept a bare 11-character id.
		if (VIDEO_ID_PATTERN.test(url)) return url;
		throw new ApiError('INVALID_REQUEST', 'Invalid YouTube URL', 400);
	}
	if (parsed.hostname === 'youtu.be') return validate(truncate(parsed.pathname.slice(1)));
	if (parsed.searchParams.has('v')) return validate(truncate(parsed.searchParams.get('v') ?? ''));
	const match = parsed.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
	if (match) return validate(truncate(match[2]));
	throw new ApiError('INVALID_REQUEST', 'Invalid YouTube URL', 400);
}
