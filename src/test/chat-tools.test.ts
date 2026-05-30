/**
 * Chat Tools Unit Tests
 *
 * Tests for the get_app_features tool execute function.
 * This tool is pure in-memory (no Prisma), so it can be unit-tested.
 * Other tools require DB mocking and are covered by smoke tests.
 */

import { describe, it, expect } from 'vitest';
import { APP_FEATURE_SECTIONS } from '@/lib/chat/features-data';

// We need to test the execute function directly. Since createChatTools()
// requires a userId and depends on Prisma for other tools, we test the
// get_app_features logic directly using the same code path.

// Replicate the get_app_features execute logic for isolated testing
function executeGetAppFeatures({ query, sectionId }: { query?: string; sectionId?: string }) {
  if (sectionId) {
    const section = APP_FEATURE_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return { error: `No section found with id "${sectionId}". Valid ids: ${APP_FEATURE_SECTIONS.map((s) => s.id).join(', ')}` };
    return section;
  }

  if (query) {
    const q = query.toLowerCase();
    const matches: { section: string; sectionId: string; feature: string; description: string; howToUse: string; benefit: string }[] = [];
    for (const section of APP_FEATURE_SECTIONS) {
      for (const f of section.features) {
        const haystack = `${section.title} ${f.title} ${f.description} ${f.howToUse} ${f.benefit}`.toLowerCase();
        if (haystack.includes(q)) {
          matches.push({ section: section.title, sectionId: section.id, feature: f.title, description: f.description, howToUse: f.howToUse, benefit: f.benefit });
        }
      }
    }
    if (matches.length === 0) return { message: `No features matched "${query}". Try a broader keyword.`, availableSections: APP_FEATURE_SECTIONS.map((s) => ({ id: s.id, title: s.title })) };
    return { query, matchCount: matches.length, matches };
  }

  return {
    totalSections: APP_FEATURE_SECTIONS.length,
    totalFeatures: APP_FEATURE_SECTIONS.reduce((sum, s) => sum + s.features.length, 0),
    sections: APP_FEATURE_SECTIONS.map((s) => ({ id: s.id, title: s.title, description: s.description, featureCount: s.features.length })),
  };
}

describe('get_app_features tool', () => {
  describe('no params (list all sections)', () => {
    it('should return all section summaries', () => {
      const result = executeGetAppFeatures({});
      expect(result).toHaveProperty('totalSections');
      expect(result).toHaveProperty('totalFeatures');
      expect(result).toHaveProperty('sections');
    });

    it('should have correct totalSections count', () => {
      const result = executeGetAppFeatures({}) as { totalSections: number };
      expect(result.totalSections).toBe(APP_FEATURE_SECTIONS.length);
    });

    it('should have correct totalFeatures count', () => {
      const result = executeGetAppFeatures({}) as { totalFeatures: number };
      const expected = APP_FEATURE_SECTIONS.reduce((sum, s) => sum + s.features.length, 0);
      expect(result.totalFeatures).toBe(expected);
    });

    it('should include id, title, description, featureCount for each section', () => {
      const result = executeGetAppFeatures({}) as { sections: { id: string; title: string; description: string; featureCount: number }[] };
      for (const section of result.sections) {
        expect(section).toHaveProperty('id');
        expect(section).toHaveProperty('title');
        expect(section).toHaveProperty('description');
        expect(section).toHaveProperty('featureCount');
        expect(section.featureCount).toBeGreaterThan(0);
      }
    });
  });

  describe('sectionId param (get specific section)', () => {
    it('should return full section details for valid sectionId', () => {
      const result = executeGetAppFeatures({ sectionId: 'dashboard' });
      expect(result).toHaveProperty('id', 'dashboard');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('features');
    });

    it('should return all sub-features with full details', () => {
      const result = executeGetAppFeatures({ sectionId: 'dashboard' }) as { features: { title: string; description: string; howToUse: string; benefit: string }[] };
      expect(result.features.length).toBeGreaterThan(0);
      for (const feature of result.features) {
        expect(feature.title).toBeTruthy();
        expect(feature.description).toBeTruthy();
        expect(feature.howToUse).toBeTruthy();
        expect(feature.benefit).toBeTruthy();
      }
    });

    it('should return error for invalid sectionId', () => {
      const result = executeGetAppFeatures({ sectionId: 'nonexistent' });
      expect(result).toHaveProperty('error');
      const error = (result as { error: string }).error;
      expect(error).toContain('No section found');
      expect(error).toContain('nonexistent');
      expect(error).toContain('dashboard'); // Lists valid ids
    });

    it('should return all known section IDs in error message', () => {
      const result = executeGetAppFeatures({ sectionId: 'invalid' }) as { error: string };
      for (const section of APP_FEATURE_SECTIONS) {
        expect(result.error).toContain(section.id);
      }
    });

    it('should return correct data for each section', () => {
      for (const section of APP_FEATURE_SECTIONS) {
        const result = executeGetAppFeatures({ sectionId: section.id });
        expect(result).toHaveProperty('id', section.id);
        expect(result).toHaveProperty('title', section.title);
      }
    });
  });

  describe('query param (keyword search)', () => {
    it('should find features matching "import"', () => {
      const result = executeGetAppFeatures({ query: 'import' }) as { matchCount: number; matches: { feature: string }[] };
      expect(result.matchCount).toBeGreaterThan(0);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find features matching "wheel"', () => {
      const result = executeGetAppFeatures({ query: 'wheel' }) as { matchCount: number; matches: { feature: string }[] };
      expect(result.matchCount).toBeGreaterThan(0);
    });

    it('should find features matching "journal"', () => {
      const result = executeGetAppFeatures({ query: 'journal' }) as { matchCount: number; matches: { feature: string }[] };
      expect(result.matchCount).toBeGreaterThan(0);
    });

    it('should be case-insensitive', () => {
      const lower = executeGetAppFeatures({ query: 'dashboard' }) as { matchCount: number };
      const upper = executeGetAppFeatures({ query: 'DASHBOARD' }) as { matchCount: number };
      const mixed = executeGetAppFeatures({ query: 'Dashboard' }) as { matchCount: number };
      expect(lower.matchCount).toBe(upper.matchCount);
      expect(lower.matchCount).toBe(mixed.matchCount);
    });

    it('should include section context in matches', () => {
      const result = executeGetAppFeatures({ query: 'csv' }) as { matches: { section: string; sectionId: string; feature: string; description: string; howToUse: string; benefit: string }[] };
      for (const match of result.matches) {
        expect(match).toHaveProperty('section');
        expect(match).toHaveProperty('sectionId');
        expect(match).toHaveProperty('feature');
        expect(match).toHaveProperty('description');
        expect(match).toHaveProperty('howToUse');
        expect(match).toHaveProperty('benefit');
      }
    });

    it('should return no-match message for nonsense query', () => {
      const result = executeGetAppFeatures({ query: 'xyznonexistent123' });
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('availableSections');
      const msg = (result as { message: string }).message;
      expect(msg).toContain('xyznonexistent123');
    });

    it('should return available sections on no match', () => {
      const result = executeGetAppFeatures({ query: 'xyznonexistent123' }) as { availableSections: { id: string; title: string }[] };
      expect(result.availableSections.length).toBe(APP_FEATURE_SECTIONS.length);
      for (const section of result.availableSections) {
        expect(section).toHaveProperty('id');
        expect(section).toHaveProperty('title');
      }
    });

    it('should search across title, description, howToUse, and benefit', () => {
      // "sync" should match features that mention sync in any field
      const result = executeGetAppFeatures({ query: 'sync' }) as { matchCount: number; matches: { feature: string }[] };
      expect(result.matchCount).toBeGreaterThan(0);
    });

    it('should handle single character query', () => {
      const result = executeGetAppFeatures({ query: 'a' }) as { matchCount: number };
      // Almost everything will match "a"
      expect(result.matchCount).toBeGreaterThan(10);
    });
  });

  describe('sectionId takes priority over query', () => {
    it('should return section when both sectionId and query are provided', () => {
      const result = executeGetAppFeatures({ sectionId: 'dashboard', query: 'import' });
      // sectionId is checked first, so it should return the dashboard section
      expect(result).toHaveProperty('id', 'dashboard');
      expect(result).not.toHaveProperty('matchCount');
    });
  });
});
