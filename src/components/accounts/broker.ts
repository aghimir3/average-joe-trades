import {
  SUPPORTED_BROKERS,
  type BrokerConfig,
  type BrokerKey,
} from '@/lib/constants/brokers';

type SyncBrokerKey = 'robinhood' | 'schwab' | 'fidelity' | 'interactive_brokers';

const syncBrokers = new Set<SyncBrokerKey>([
  'robinhood',
  'schwab',
  'fidelity',
  'interactive_brokers',
]);

const fallbackBrokerInfo: BrokerConfig = {
  id: 'unknown',
  name: 'Unknown Broker',
  value: 'unknown',
  label: 'Unknown Broker',
  color: 'bg-zinc-500',
  textColor: 'text-zinc-600',
  bgColor: 'bg-zinc-50',
  borderColor: 'border-zinc-200',
  ringColor: 'ring-zinc-500',
  supportsSync: false,
  supportsFileImport: false,
  supportsManualEntry: true,
  fileType: null,
  fileExtension: null,
  description: '',
  instructions: [],
  helpUrl: null,
};

export function toSyncBroker(broker: BrokerKey | null): SyncBrokerKey | undefined {
  if (!broker) return undefined;
  return syncBrokers.has(broker as SyncBrokerKey)
    ? (broker as SyncBrokerKey)
    : undefined;
}

export function getBrokerInfo(broker: string): BrokerConfig {
  return SUPPORTED_BROKERS[broker as BrokerKey] || {
    ...fallbackBrokerInfo,
    id: broker,
    name: broker,
    value: broker,
    label: broker,
  };
}
