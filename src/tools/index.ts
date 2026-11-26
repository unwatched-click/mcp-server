import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
export function registerAllTools(server: McpServer, api: UnwatchedApi): void {
	registerGetVideoSubtitlesTool(server, api);
	registerListSubtitleTracksTool(server, api);
	registerGetVideoInfoTool(server, api);
	registerGetVideoFrameTool(server, api);
	registerTranslateTranscriptTool(server, api);
	registerSummarizeVideoTool(server, api);
	registerSearchArticlesTool(server, api);
	registerGetCreditBalanceTool(server, api);
}
