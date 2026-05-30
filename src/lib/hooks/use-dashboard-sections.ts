/**
 * useDashboardSections Hook
 *
 * Manages the collapsed/expanded state of dashboard sections.
 * Persists state to localStorage for user preference retention.
 */

'use client';

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'dashboardSectionStates';

/**
 * Dashboard section identifiers.
 * These map to the 5 collapsible categories on the dashboard.
 */
export type DashboardSectionId =
  | 'live-portfolio'
  | 'charts-calendar'
  | 'goals-streaks'
  | 'positions-trades'
  | 'performance'
  | 'wheel-strategy'
  | 'options-analytics'
  | 'market-scanner';

type SectionStates = Record<DashboardSectionId, boolean>;

/**
 * Default states for each section.
 * All sections start expanded by default.
 */
const DEFAULT_STATES: SectionStates = {
  'live-portfolio': true,
  'charts-calendar': true,
  'goals-streaks': true,
  'positions-trades': true,
  'performance': true,
  'wheel-strategy': true,
  'options-analytics': true,
  'market-scanner': true,
};

/**
 * Default states for mobile view.
 * Only first two sections expanded on mobile to reduce scrolling.
 */
const MOBILE_DEFAULT_STATES: SectionStates = {
  'live-portfolio': true,
  'charts-calendar': true,
  'goals-streaks': true,
  'positions-trades': false,
  'performance': false,
  'wheel-strategy': false,
  'options-analytics': false,
  'market-scanner': false,
};

// Storage subscription for useSyncExternalStore
let listeners: (() => void)[] = [];

function subscribeToStorage(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

function getStorageSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function setStorageValue(value: SectionStates): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    // Notify all listeners
    listeners.forEach(l => l());
  } catch {
    // localStorage might not be available
  }
}

function parseStates(stored: string | null, isMobile: boolean): SectionStates {
  if (!stored) {
    return isMobile ? MOBILE_DEFAULT_STATES : DEFAULT_STATES;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<SectionStates>;
    // Merge with defaults to handle new sections
    const defaults = isMobile ? MOBILE_DEFAULT_STATES : DEFAULT_STATES;
    return { ...defaults, ...parsed };
  } catch {
    return isMobile ? MOBILE_DEFAULT_STATES : DEFAULT_STATES;
  }
}

interface UseDashboardSectionsReturn {
  /** Get the open state of a section */
  isSectionOpen: (sectionId: DashboardSectionId) => boolean;
  /** Toggle a section's open state */
  toggleSection: (sectionId: DashboardSectionId) => void;
  /** Set a section's open state */
  setSectionOpen: (sectionId: DashboardSectionId, isOpen: boolean) => void;
  /** Expand all sections */
  expandAll: () => void;
  /** Collapse all sections */
  collapseAll: () => void;
}

/**
 * Hook for managing dashboard section collapse states.
 *
 * @param isMobile - Whether the current view is mobile (affects defaults)
 * @returns Methods to manage section states
 */
export function useDashboardSections(isMobile = false): UseDashboardSectionsReturn {
  const storedValue = useSyncExternalStore(
    subscribeToStorage,
    getStorageSnapshot,
    getServerSnapshot
  );

  const states = parseStates(storedValue, isMobile);

  const isSectionOpen = useCallback((sectionId: DashboardSectionId): boolean => {
    return states[sectionId] ?? true;
  }, [states]);

  const toggleSection = useCallback((sectionId: DashboardSectionId): void => {
    const currentStates = parseStates(getStorageSnapshot(), isMobile);
    setStorageValue({
      ...currentStates,
      [sectionId]: !currentStates[sectionId],
    });
  }, [isMobile]);

  const setSectionOpen = useCallback((sectionId: DashboardSectionId, isOpen: boolean): void => {
    const currentStates = parseStates(getStorageSnapshot(), isMobile);
    setStorageValue({
      ...currentStates,
      [sectionId]: isOpen,
    });
  }, [isMobile]);

  const expandAll = useCallback((): void => {
    setStorageValue({
      'live-portfolio': true,
      'charts-calendar': true,
      'goals-streaks': true,
      'positions-trades': true,
      'performance': true,
      'wheel-strategy': true,
      'options-analytics': true,
      'market-scanner': true,
    });
  }, []);

  const collapseAll = useCallback((): void => {
    setStorageValue({
      'live-portfolio': false,
      'charts-calendar': false,
      'goals-streaks': false,
      'positions-trades': false,
      'performance': false,
      'wheel-strategy': false,
      'options-analytics': false,
      'market-scanner': false,
    });
  }, []);

  return {
    isSectionOpen,
    toggleSection,
    setSectionOpen,
    expandAll,
    collapseAll,
  };
}
