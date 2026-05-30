/**
 * Common account scoping helper used by API and ML queries.
 *
 * If an account ID is provided, scope to that account only.
 * Otherwise scope to active accounts to avoid aggregating inactive/deleted accounts.
 */
export function buildAccountScope(accountId?: string | null) {
  return accountId
    ? { brokerageAccountId: accountId }
    : { brokerageAccount: { isActive: true } };
}
