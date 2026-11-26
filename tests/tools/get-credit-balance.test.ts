import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import { getCreditBalanceHandler } from '../../src/tools/get-credit-balance/handler.js';
import { createFakeApi } from './fake-api.js';

const CREDITS_JSON = `{
  "accessTier": "FREE",
  "isUnlimited": false,
  "unitsPerCredit": 10,
  "dailyUnits": 130,
  "purchasedUnits": 0,
  "totalUnits": 130,
  "lifetimePurchasedUnits": 0,
  "nextDailyResetAt": "2026-12-01T00:00:00.000Z",
  "progress": {
    "earnedTier": "FREE",
    "nextTier": "PREMIUM",
    "currentThresholdUnits": 0,
    "nextThresholdUnits": 5000,
    "unitsToNextTier": 4870,
    "percent": 3
  }
}`;

describe('get_credit_balance handler', () => {
	it('calls getCredits with no input and returns the snapshot JSON', async () => {
		const api = createFakeApi();
		api.getCredits.mockResolvedValue({
			accessTier: 'FREE',
			isUnlimited: false,
			unitsPerCredit: 10,
			dailyUnits: 130,
			purchasedUnits: 0,
			totalUnits: 130,
			lifetimePurchasedUnits: 0,
			nextDailyResetAt: '2026-12-01T00:00:00.000Z',
			progress: {
				earnedTier: 'FREE',
				nextTier: 'PREMIUM',
				currentThresholdUnits: 0,
				nextThresholdUnits: 5000,
				unitsToNextTier: 4870,
				percent: 3,
			},
		});

		const result = await getCreditBalanceHandler({}, api);

		expect(api.getCredits).toHaveBeenCalledTimes(1);
		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: 'text', text: CREDITS_JSON }]);
	});

	it('maps MISSING_API_KEY to API-key guidance', async () => {
		const api = createFakeApi();
		api.getCredits.mockRejectedValue(new ApiError('MISSING_API_KEY', 'UNWATCHED_API_KEY is not set', 0));

		const result = await getCreditBalanceHandler({}, api);

		expect(result).toEqual({
			content: [{
				type: 'text',
				text: 'The Unwatched API key is missing or invalid. Set the UNWATCHED_API_KEY environment variable to a valid key (or reconnect the hosted server with a valid key). Get a key at https://unwatched.click/en/developer/keys',
			}],
			isError: true,
		});
	});

	it('maps TIMEOUT to a transient-failure hint', async () => {
		const api = createFakeApi();
		api.getCredits.mockRejectedValue(new ApiError('TIMEOUT', 'Request timed out after 30000ms', 0));

		const result = await getCreditBalanceHandler({}, api);

		expect(result).toEqual({
			content: [{ type: 'text', text: 'The request to the Unwatched API timed out. This is usually transient — retry later.' }],
			isError: true,
		});
	});
});
