/**
 * Vitest setup file.
 *
 * Runs before each test file to set up the testing environment.
 */

import { vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';

// Mock environment variables
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'silent';
}

// Mock crypto.randomUUID for correlation IDs
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => 'test-uuid-1234',
  } as Crypto;
}

// Mock fetch for API tests
global.fetch = vi.fn();

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const iconCache = new Map<string, React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement> & { size?: number | string } & React.RefAttributes<SVGSVGElement>>>();

  const createIconMock = (name: string) => {
    const cached = iconCache.get(name);
    if (cached) return cached;

    const Component = React.forwardRef<
      SVGSVGElement,
      React.SVGProps<SVGSVGElement> & { size?: number | string }
    >((props, ref) =>
      React.createElement('svg', {
        ref,
        'data-testid': `${name}-icon`,
        'aria-hidden': 'true',
        ...props,
      })
    );
    Component.displayName = name;
    iconCache.set(name, Component);
    return Component;
  };

  const baseExports = {
    // Dashboard and navigation
    Trophy: createIconMock('Trophy'),
    Frown: createIconMock('Frown'),
    TrendingUp: createIconMock('TrendingUp'),
    TrendingDown: createIconMock('TrendingDown'),
    Calendar: createIconMock('Calendar'),
    LayoutDashboard: createIconMock('LayoutDashboard'),
    Sparkles: createIconMock('Sparkles'),
    Wallet: createIconMock('Wallet'),
    PieChart: createIconMock('PieChart'),
    Zap: createIconMock('Zap'),

    // Navigation arrows
    ChevronLeft: createIconMock('ChevronLeft'),
    ChevronRight: createIconMock('ChevronRight'),
    ChevronDown: createIconMock('ChevronDown'),
    ChevronUp: createIconMock('ChevronUp'),
    ArrowLeft: createIconMock('ArrowLeft'),
    ArrowUpRight: createIconMock('ArrowUpRight'),
    ArrowDownRight: createIconMock('ArrowDownRight'),

    // Import and file operations
    Upload: createIconMock('Upload'),
    FileText: createIconMock('FileText'),
    FileSpreadsheet: createIconMock('FileSpreadsheet'),
    FileJson: createIconMock('FileJson'),
    Archive: createIconMock('Archive'),
    ArchiveRestore: createIconMock('ArchiveRestore'),

    // Status and alerts
    AlertCircle: createIconMock('AlertCircle'),
    AlertTriangle: createIconMock('AlertTriangle'),
    CheckCircle2: createIconMock('CheckCircle2'),
    Clock: createIconMock('Clock'),
    Info: createIconMock('Info'),
    Check: createIconMock('Check'),

    // UI elements
    Package: createIconMock('Package'),
    DollarSign: createIconMock('DollarSign'),
    Plus: createIconMock('Plus'),
    Loader2: createIconMock('Loader2'),
    X: createIconMock('X'),
    Search: createIconMock('Search'),
    Filter: createIconMock('Filter'),
    Pencil: createIconMock('Pencil'),
    Edit2: createIconMock('Edit2'),
    Trash2: createIconMock('Trash2'),
    LogOut: createIconMock('LogOut'),
    Eye: createIconMock('Eye'),
    EyeOff: createIconMock('EyeOff'),
    RefreshCw: createIconMock('RefreshCw'),
    HelpCircle: createIconMock('HelpCircle'),
    ExternalLink: createIconMock('ExternalLink'),

    // Stats and charts
    BarChart3: createIconMock('BarChart3'),
    Target: createIconMock('Target'),
    Activity: createIconMock('Activity'),
    createLucideIcon: (name: string) => createIconMock(name),
  };

  return new Proxy(baseExports, {
    get(target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) {
        return target[prop as keyof typeof target];
      }
      return createIconMock(prop);
    },
  });
});

// Mock ResizeObserver (required for some Radix components and floating-ui)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver;

// Mock PointerEvent capabilities for Radix UI components
if (typeof window !== 'undefined') {
  // Mock hasPointerCapture
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();

  // Mock scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
}

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
