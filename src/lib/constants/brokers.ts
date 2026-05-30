/**
 * Shared broker configuration for the application.
 *
 * This file defines all supported brokers and their capabilities.
 * Used by welcome-modal.tsx, accounts-client.tsx, and import-client.tsx.
 */

export interface BrokerConfig {
  // Primary identifiers
  id: string;
  name: string;
  // Aliases for backward compatibility
  value: string;    // Same as id
  label: string;    // Same as name
  // Styling
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
  // Capabilities
  supportsSync: boolean;
  supportsFileImport: boolean;
  supportsManualEntry: boolean;
  // File import settings
  fileType: 'CSV' | 'JSON' | null;
  fileExtension: '.csv' | '.json' | null;
  // Display
  description: string;
  instructions: string[];
  helpUrl: string | null;
}

/**
 * All supported brokers with their full configuration.
 */
export const SUPPORTED_BROKERS: Record<string, BrokerConfig> = {
  robinhood: {
    id: 'robinhood',
    name: 'Robinhood',
    value: 'robinhood',
    label: 'Robinhood',
    color: 'bg-green-500',
    textColor: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    ringColor: 'ring-green-500',
    supportsSync: true,
    supportsFileImport: true,
    supportsManualEntry: false,
    fileType: 'CSV',
    fileExtension: '.csv',
    description: 'Connect via SnapTrade or import CSV',
    instructions: [
      'Log in to Robinhood on the web at robinhood.com',
      'Go to Account → Statements & History',
      'Click "Generate New" under Reports',
      'Select your date range and download CSV',
    ],
    helpUrl: 'https://robinhood.com/account/history',
  },
  schwab: {
    id: 'schwab',
    name: 'Charles Schwab',
    value: 'schwab',
    label: 'Charles Schwab',
    color: 'bg-blue-600',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    ringColor: 'ring-blue-500',
    supportsSync: true,
    supportsFileImport: true,
    supportsManualEntry: false,
    fileType: 'JSON',
    fileExtension: '.json',
    description: 'Connect via SnapTrade or import JSON',
    instructions: [
      'Log in to Schwab.com',
      'Go to Accounts → History',
      'Set your date range and click Search',
      'Click Export and select JSON format',
    ],
    helpUrl: 'https://www.schwab.com/',
  },
  fidelity: {
    id: 'fidelity',
    name: 'Fidelity',
    value: 'fidelity',
    label: 'Fidelity',
    color: 'bg-emerald-600',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    ringColor: 'ring-emerald-500',
    supportsSync: true,
    supportsFileImport: false,
    supportsManualEntry: false,
    fileType: null,
    fileExtension: null,
    description: 'Connect via SnapTrade for real-time sync',
    instructions: [],
    helpUrl: 'https://www.fidelity.com/',
  },
  interactive_brokers: {
    id: 'interactive_brokers',
    name: 'Interactive Brokers',
    value: 'interactive_brokers',
    label: 'Interactive Brokers',
    color: 'bg-red-600',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    ringColor: 'ring-red-500',
    supportsSync: true,
    supportsFileImport: false,
    supportsManualEntry: false,
    fileType: null,
    fileExtension: null,
    description: 'Connect via IBKR Third-Party Reports (24-48hr initial sync)',
    instructions: [
      'Log in to IBKR Client Portal',
      'Go to Performance & Reports → Third-Party Reports',
      'Click the gear icon to configure Third-Party Services',
      'Enable "SnapTrade" from the list and click Save',
      'Copy the Token and Query ID shown, then use them to connect',
    ],
    helpUrl: 'https://www.interactivebrokers.com/',
  },
  manual: {
    id: 'manual',
    name: 'Manual Entry',
    value: 'manual',
    label: 'Manual Entry',
    color: 'bg-zinc-500',
    textColor: 'text-zinc-600 dark:text-zinc-400',
    bgColor: 'bg-zinc-50 dark:bg-zinc-950/30',
    borderColor: 'border-zinc-200 dark:border-zinc-800',
    ringColor: 'ring-zinc-500',
    supportsSync: false,
    supportsFileImport: false,
    supportsManualEntry: true,
    fileType: null,
    fileExtension: null,
    description: 'Enter trades manually for any broker',
    instructions: [],
    helpUrl: null,
  },
} as const;

/**
 * Array of broker configs for iteration (e.g., rendering broker selection lists).
 */
export const BROKER_LIST = Object.values(SUPPORTED_BROKERS);

/**
 * Type for broker keys.
 */
export type BrokerKey = keyof typeof SUPPORTED_BROKERS;

/**
 * Get broker config by ID.
 */
export function getBrokerConfig(brokerId: string): BrokerConfig | undefined {
  return SUPPORTED_BROKERS[brokerId];
}

/**
 * Get broker display name.
 */
export function getBrokerName(brokerId: string): string {
  return SUPPORTED_BROKERS[brokerId]?.name || brokerId;
}

/**
 * Get broker color class.
 */
export function getBrokerColor(brokerId: string): string {
  return SUPPORTED_BROKERS[brokerId]?.color || 'bg-zinc-500';
}
