/**
 * Chat Types
 *
 * Shared TypeScript types for the Joey chat feature.
 */

/** Conversation summary (list view) */
export interface ConversationSummary {
  id: string;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: string;
    createdAt: string;
  } | null;
}

/** Full conversation with messages */
export interface ConversationDetail {
  id: string;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageData[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/** Single chat message */
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string | null;
  toolName?: string | null;
  createdAt: string;
}

/** Paginated list response */
export interface ConversationListResponse {
  conversations: ConversationSummary[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
