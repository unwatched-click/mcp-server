import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { UnwatchedApi } from '../api/contract.js';
import { registerGetVideoSubtitlesTool } from './get-video-subtitles/index.js';
import { registerListSubtitleTracksTool } from './list-subtitle-tracks/index.js';
import { registerGetVideoInfoTool } from './get-video-info/index.js';
import { registerGetVideoFrameTool } from './get-video-frame/index.js';
import { registerTranslateTranscriptTool } from './translate-transcript/index.js';
import { registerSummarizeVideoTool } from './summarize-video/index.js';
import { registerSearchArticlesTool } from './search-articles/index.js';
import { registerGetCreditBalanceTool } from './get-credit-balance/index.js';

/** Registers every Unwatched tool on `server`. */
export function registerAllTools(
	server: McpServer,
	api: UnwatchedApi,
	pollShutdownSignal?: AbortSignal,
	toolMeta?: Tool['_meta'],
): void {
	registerGetVideoSubtitlesTool(server, api, toolMeta);
	registerListSubtitleTracksTool(server, api, toolMeta);
	registerGetVideoInfoTool(server, api, toolMeta);
	registerGetVideoFrameTool(server, api, toolMeta);
	registerTranslateTranscriptTool(server, api, pollShutdownSignal, toolMeta);
	registerSummarizeVideoTool(server, api, pollShutdownSignal, toolMeta);
	registerSearchArticlesTool(server, api, toolMeta);
	registerGetCreditBalanceTool(server, api, toolMeta);
}
