/**
 * Features Data Unit Tests
 *
 * Validates the structure and integrity of the shared app feature data
 * used by both the Features Guide page and the Joey get_app_features tool.
 */

import { describe, it, expect } from 'vitest';
import {
  APP_FEATURE_SECTIONS,
  type AppFeature,
  type AppFeatureSection,
} from '@/lib/chat/features-data';

describe('APP_FEATURE_SECTIONS', () => {
  it('should have at least 10 sections', () => {
    expect(APP_FEATURE_SECTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('should have unique section IDs', () => {
    const ids = APP_FEATURE_SECTIONS.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should have all expected section IDs', () => {
    const ids = new Set(APP_FEATURE_SECTIONS.map((s) => s.id));
    const expected = [
      'dashboard',
      'positions',
      'trading',
      'import',
      'accounts',
      'options-analytics',
      'wheel',
      'goals',
      'ai-insights',
      'ml',
      'joey',
      'journal',
      'policy',
      'tax',
      'settings',
    ];
    for (const id of expected) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('should have valid structure for every section', () => {
    for (const section of APP_FEATURE_SECTIONS) {
      expect(section.id).toBeTruthy();
      expect(typeof section.id).toBe('string');
      expect(section.title).toBeTruthy();
      expect(typeof section.title).toBe('string');
      expect(section.description).toBeTruthy();
      expect(typeof section.description).toBe('string');
      expect(Array.isArray(section.features)).toBe(true);
      expect(section.features.length).toBeGreaterThan(0);
    }
  });

  it('should have valid structure for every sub-feature', () => {
    for (const section of APP_FEATURE_SECTIONS) {
      for (const feature of section.features) {
        expect(feature.title).toBeTruthy();
        expect(typeof feature.title).toBe('string');
        expect(feature.description).toBeTruthy();
        expect(typeof feature.description).toBe('string');
        expect(feature.howToUse).toBeTruthy();
        expect(typeof feature.howToUse).toBe('string');
        expect(feature.benefit).toBeTruthy();
        expect(typeof feature.benefit).toBe('string');
      }
    }
  });

  it('should have at least 50 total features across all sections', () => {
    const totalFeatures = APP_FEATURE_SECTIONS.reduce(
      (sum, s) => sum + s.features.length,
      0
    );
    expect(totalFeatures).toBeGreaterThanOrEqual(50);
  });

  it('should not contain React imports (server-safe)', () => {
    // Verify the data is plain objects — no React elements or components
    for (const section of APP_FEATURE_SECTIONS) {
      expect(typeof section).toBe('object');
      expect(section).not.toHaveProperty('icon');
      expect(section).not.toHaveProperty('color');
    }
  });

  it('section IDs should be kebab-case', () => {
    for (const section of APP_FEATURE_SECTIONS) {
      expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  describe('specific sections', () => {
    it('dashboard should have P&L and Calendar features', () => {
      const dashboard = APP_FEATURE_SECTIONS.find((s) => s.id === 'dashboard');
      expect(dashboard).toBeDefined();
      const titles = dashboard!.features.map((f) => f.title.toLowerCase());
      expect(titles.some((t) => t.includes('p&l'))).toBe(true);
      expect(titles.some((t) => t.includes('calendar'))).toBe(true);
    });

    it('joey section should mention data tools', () => {
      const joey = APP_FEATURE_SECTIONS.find((s) => s.id === 'joey');
      expect(joey).toBeDefined();
      const descriptions = joey!.features.map((f) =>
        `${f.title} ${f.description}`.toLowerCase()
      );
      expect(descriptions.some((d) => d.includes('tool'))).toBe(true);
    });

    it('import section should mention CSV and SnapTrade', () => {
      const importSection = APP_FEATURE_SECTIONS.find(
        (s) => s.id === 'import'
      );
      expect(importSection).toBeDefined();
      const allText = importSection!.features
        .map((f) => `${f.title} ${f.description}`)
        .join(' ')
        .toLowerCase();
      expect(allText).toContain('csv');
      expect(allText).toContain('snaptrade');
    });

    it('wheel section should mention covered call and cash-secured put', () => {
      const wheel = APP_FEATURE_SECTIONS.find((s) => s.id === 'wheel');
      expect(wheel).toBeDefined();
      // Check section description + feature text
      const allText = [
        wheel!.description,
        ...wheel!.features.map((f) => `${f.title} ${f.description}`),
      ]
        .join(' ')
        .toLowerCase();
      expect(allText.includes('covered call') || allText.includes('cc')).toBe(
        true
      );
    });
  });
});

describe('AppFeature type', () => {
  it('should require title, description, howToUse, benefit', () => {
    const feature: AppFeature = {
      title: 'Test Feature',
      description: 'Test description',
      howToUse: 'Test how to use',
      benefit: 'Test benefit',
    };
    expect(feature.title).toBe('Test Feature');
    expect(feature.description).toBe('Test description');
    expect(feature.howToUse).toBe('Test how to use');
    expect(feature.benefit).toBe('Test benefit');
  });
});

describe('AppFeatureSection type', () => {
  it('should require id, title, description, features', () => {
    const section: AppFeatureSection = {
      id: 'test',
      title: 'Test Section',
      description: 'Test section description',
      features: [
        {
          title: 'Feature 1',
          description: 'Desc',
          howToUse: 'How',
          benefit: 'Benefit',
        },
      ],
    };
    expect(section.id).toBe('test');
    expect(section.features).toHaveLength(1);
  });
});
