/**
 * SnapTrade Sync Constants
 *
 * Broker-specific information for sync status messaging, wait times,
 * and multi-account guidance. Used to provide intuitive UX during
 * the SnapTrade connection and sync flow.
 */

/**
 * Sync status types from SnapTrade
 */
export type SnapTradeSyncStatus = 'ready' | 'syncing' | 'limited';

/**
 * Broker-specific sync information
 */
export interface BrokerSyncInfo {
  /** Display name */
  name: string;
  /** Typical initial sync time */
  typicalSyncTime: string;
  /** Minimum wait time before warning */
  minWaitMinutes: number;
  /** Maximum expected wait time */
  maxWaitHours: number;
  /** Whether this broker often has delayed syncs */
  hasDelayedSync: boolean;
  /** User-friendly description of sync behavior */
  syncDescription: string;
  /** Tips for users waiting for sync */
  waitingTips: string[];
  /** Multi-account guidance */
  multiAccountTip: string | null;
}

/**
 * Broker-specific sync information
 * Based on real-world SnapTrade behavior patterns
 */
export const BROKER_SYNC_INFO: Record<string, BrokerSyncInfo> = {
  robinhood: {
    name: 'Robinhood',
    typicalSyncTime: '2-5 minutes',
    minWaitMinutes: 5,
    maxWaitHours: 1,
    hasDelayedSync: false,
    syncDescription: 'Robinhood typically syncs quickly via SnapTrade.',
    waitingTips: [
      'Most accounts sync within 5 minutes',
      'Real-time positions are available immediately',
      'Transaction history may take a few extra minutes',
    ],
    multiAccountTip: 'If you have multiple Robinhood accounts (e.g., Individual + IRA), they will appear separately after connecting.',
  },
  schwab: {
    name: 'Schwab',
    typicalSyncTime: '5-15 minutes',
    minWaitMinutes: 10,
    maxWaitHours: 2,
    hasDelayedSync: false,
    syncDescription: 'Schwab accounts usually sync within 15 minutes.',
    waitingTips: [
      'First sync typically takes 10-15 minutes',
      'Subsequent syncs are much faster',
      'You can view positions while waiting for full history',
    ],
    multiAccountTip: 'All linked Schwab accounts (Brokerage, IRA, etc.) will be available for sync.',
  },
  fidelity: {
    name: 'Fidelity',
    typicalSyncTime: '5-15 minutes',
    minWaitMinutes: 10,
    maxWaitHours: 2,
    hasDelayedSync: false,
    syncDescription: 'Fidelity accounts typically sync within 15 minutes.',
    waitingTips: [
      'Initial sync may take 10-15 minutes',
      'Options data may take slightly longer',
      'Check back if not ready in 30 minutes',
    ],
    multiAccountTip: 'All your Fidelity accounts will appear after connecting your login.',
  },
  interactive_brokers: {
    name: 'Interactive Brokers',
    typicalSyncTime: '24-48 hours',
    minWaitMinutes: 60,
    maxWaitHours: 48,
    hasDelayedSync: true,
    syncDescription: 'IBKR uses Third-Party Reports which require 24-48 hours for initial setup.',
    waitingTips: [
      'First-time connections take 24-48 hours to fully sync',
      'This is normal IBKR behavior, not an error',
      'Positions become available before full transaction history',
      'Subsequent syncs will be much faster',
    ],
    multiAccountTip: 'You\'ll need to authorize each IBKR account separately through Flex Query setup.',
  },
  td_ameritrade: {
    name: 'TD Ameritrade',
    typicalSyncTime: '5-15 minutes',
    minWaitMinutes: 10,
    maxWaitHours: 2,
    hasDelayedSync: false,
    syncDescription: 'TD Ameritrade accounts usually sync within 15 minutes.',
    waitingTips: [
      'First sync typically takes 10-15 minutes',
      'You can import CSV files while waiting if needed',
    ],
    multiAccountTip: 'All TD Ameritrade accounts linked to your login will be available.',
  },
  etrade: {
    name: 'E*TRADE',
    typicalSyncTime: '5-15 minutes',
    minWaitMinutes: 10,
    maxWaitHours: 2,
    hasDelayedSync: false,
    syncDescription: 'E*TRADE accounts typically sync within 15 minutes.',
    waitingTips: [
      'Initial sync may take 10-15 minutes',
      'Transaction history loads after positions',
    ],
    multiAccountTip: 'All E*TRADE accounts will appear after connecting.',
  },
};

/**
 * Default sync info for unknown brokers
 */
export const DEFAULT_BROKER_SYNC_INFO: BrokerSyncInfo = {
  name: 'Brokerage',
  typicalSyncTime: '5-30 minutes',
  minWaitMinutes: 10,
  maxWaitHours: 4,
  hasDelayedSync: false,
  syncDescription: 'Initial sync may take several minutes.',
  waitingTips: [
    'First sync typically takes 10-30 minutes',
    'Positions are usually available first',
    'Transaction history follows shortly after',
  ],
  multiAccountTip: 'All accounts linked to your login should appear after connecting.',
};

/**
 * Get broker sync info by broker key
 */
export function getBrokerSyncInfo(broker: string): BrokerSyncInfo {
  const normalizedBroker = broker.toLowerCase().replace(/[^a-z]/g, '_');
  return BROKER_SYNC_INFO[normalizedBroker] || DEFAULT_BROKER_SYNC_INFO;
}

/**
 * Sync status display information
 */
export interface SyncStatusDisplay {
  /** Status indicator color */
  color: 'emerald' | 'amber' | 'blue' | 'red';
  /** Icon to show */
  icon: 'check' | 'clock' | 'loader' | 'alert';
  /** Short status label */
  label: string;
  /** Longer description */
  description: string;
  /** Whether to show polling indicator */
  showPolling: boolean;
  /** Action button label */
  actionLabel: string | null;
}

/**
 * Get display information for a sync status
 */
export function getSyncStatusDisplay(
  status: SnapTradeSyncStatus,
  broker: string
): SyncStatusDisplay {
  const brokerInfo = getBrokerSyncInfo(broker);

  switch (status) {
    case 'ready':
      return {
        color: 'emerald',
        icon: 'check',
        label: 'Ready to Sync',
        description: `${brokerInfo.name} data is available. Click "Sync" to import your latest transactions.`,
        showPolling: false,
        actionLabel: 'Sync Now',
      };

    case 'syncing':
      return {
        color: 'amber',
        icon: 'loader',
        label: 'Fetching from Broker',
        description: brokerInfo.hasDelayedSync
          ? `${brokerInfo.name} data is being fetched. This typically takes ${brokerInfo.typicalSyncTime}. You can check back later.`
          : `${brokerInfo.name} is syncing your data. This usually takes ${brokerInfo.typicalSyncTime}.`,
        showPolling: true,
        actionLabel: 'Check Status',
      };

    case 'limited':
      return {
        color: 'blue',
        icon: 'alert',
        label: 'Limited Data',
        description: `Transaction history may be limited for this ${brokerInfo.name} account. You can import a CSV file for complete history.`,
        showPolling: false,
        actionLabel: 'Import CSV',
      };

    default:
      return {
        color: 'blue',
        icon: 'clock',
        label: 'Pending',
        description: 'Waiting for broker data...',
        showPolling: true,
        actionLabel: 'Check Status',
      };
  }
}

/**
 * Sync progress steps for UI display
 */
export interface SyncProgressStep {
  id: string;
  label: string;
  description: string;
}

/**
 * Get sync progress steps for display during sync
 */
export const SYNC_PROGRESS_STEPS: SyncProgressStep[] = [
  {
    id: 'connect',
    label: 'Connecting to Broker',
    description: 'Establishing secure connection...',
  },
  {
    id: 'fetch',
    label: 'Fetching Transactions',
    description: 'Downloading your trade history...',
  },
  {
    id: 'process',
    label: 'Processing Data',
    description: 'Normalizing and validating trades...',
  },
  {
    id: 'save',
    label: 'Saving to Database',
    description: 'Writing transactions and detecting duplicates...',
  },
  {
    id: 'derive',
    label: 'Calculating Positions',
    description: 'Computing P&L and position data...',
  },
];

/**
 * Multi-account linking guidance messages
 */
export const MULTI_ACCOUNT_MESSAGES = {
  sameLogin: {
    title: 'Multiple Accounts Available',
    description: 'We found multiple accounts linked to your brokerage login. Select which accounts you want to sync.',
    tip: 'Each account syncs independently and has its own P&L tracking.',
  },
  addAnother: {
    title: 'Add Another Account',
    description: 'Want to link another brokerage account? You can connect multiple accounts from the same broker.',
    tip: 'For example, you can link both your personal and spouse\'s accounts under your profile.',
  },
  differentAuth: {
    title: 'Linking Additional Credentials',
    description: 'To add accounts from a different login (e.g., spouse\'s account), you\'ll need to connect separately.',
    tip: 'Click "Connect Another Account" and sign in with the different credentials.',
  },
};
