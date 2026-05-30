// ---------------------------------------------------------------------------
// Shared TypeScript interfaces
// ---------------------------------------------------------------------------

export interface Classification {
  legitimate: boolean;
  complexity: 'simple' | 'complex';
  reason: string;
}

export interface StructuredIssue {
  area: string;
  description: string;
  steps_to_reproduce?: string;
  broker?: string;
  device?: string;
  motivation?: string;
  scope?: string;
}

export interface IssueStatus {
  state: 'open' | 'closed';
  hasLinkedPR: boolean;
  prDraft: boolean;
  prMerged: boolean;
  prUrl: string | null;
}

export interface DiscordAttachment {
  name: string;
  url: string;
  contentType: string | null;
}

export interface FilteredThreadEntry {
  attempts: number;
  lastAttemptAt: number;
  channelType: 'bug-reports' | 'feature-requests';
}
