import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WelcomeModal } from './welcome-modal';

function renderWelcomeModal(onComplete = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <WelcomeModal onComplete={onComplete} />
      </QueryClientProvider>
    ),
    onComplete,
  };
}

describe('WelcomeModal', () => {
  it('moves from welcome to broker/import setup options', async () => {
    const user = userEvent.setup();
    renderWelcomeModal();

    expect(screen.getByText('Set up your trading workspace')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /get started/i }));

    expect(screen.getByText('Choose Your Setup Path')).toBeInTheDocument();
  });

  it('lets users start with manual entry immediately', async () => {
    const user = userEvent.setup();
    renderWelcomeModal();

    await user.click(screen.getByRole('button', { name: /start with manual entry/i }));

    expect(screen.getByText('Create Manual Account')).toBeInTheDocument();
  });

  it('allows skipping onboarding from welcome step', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWelcomeModal(onComplete);

    await user.click(screen.getByRole('button', { name: /explore dashboard first/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
