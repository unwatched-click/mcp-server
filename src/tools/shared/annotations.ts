export const READ_EXTERNAL = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
export const READ_OWN = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
/** Spent credits are not refunded, so OpenAI counts the call as an irreversible transaction. */
export const SPENDS_CREDITS = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
