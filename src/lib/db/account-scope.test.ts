import { describe, expect, it } from 'vitest';
import { buildAccountScope } from './account-scope';

describe('buildAccountScope', () => {
  it('returns selected account scope when accountId is provided', () => {
    expect(buildAccountScope('acc-123')).toEqual({ brokerageAccountId: 'acc-123' });
  });

  it('defaults to active-account scope when accountId is missing', () => {
    expect(buildAccountScope()).toEqual({ brokerageAccount: { isActive: true } });
  });
});
