/**
 * Chat page — Joey AI trading assistant.
 *
 * Full-page chat experience with conversation sidebar,
 * streaming AI responses, and tool calling.
 */

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnresolvedIssueCount } from '@/lib/services/issue-resolution';
import { ChatClient } from '@/components/chat/chat-client';
import { AppHeader } from '@/components/layout/app-header';

export const metadata: Metadata = {
  title: 'Chat with Joey',
  description: 'AI-powered trading assistant — ask about your portfolio, positions, and trades.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function ChatPage() {
  const user = await requireAuth('/chat');
  const issueCount = await getUnresolvedIssueCount(prisma, user.id);

  return (
    <main className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      <AppHeader user={user} issueCount={issueCount} />
      <ChatClient />
    </main>
  );
}
