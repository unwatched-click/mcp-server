import { z } from 'zod';

/** No parameters: the balance is account-wide, not per video. */
export const getCreditBalanceInputSchema = z.object({});

export type GetCreditBalanceInput = z.infer<typeof getCreditBalanceInputSchema>;
