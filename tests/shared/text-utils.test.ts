/**
 * Tests for isNoneVariant() and normalizeIssueList()
 * Ensures false-positive blocking issues are filtered while real issues are preserved.
 */

import { describe, it, expect } from 'vitest';
import { isNoneVariant, normalizeIssueList } from '../../src/shared/text-utils.js';

describe('isNoneVariant', () => {
  describe('true positives (should be filtered out)', () => {
    it('should detect exact "none" variants', () => {
      expect(isNoneVariant('None')).toBe(true);
      expect(isNoneVariant('none')).toBe(true);
      expect(isNoneVariant('NONE')).toBe(true);
      expect(isNoneVariant('None.')).toBe(true);
      expect(isNoneVariant('N/A')).toBe(true);
      expect(isNoneVariant('n/a')).toBe(true);
      expect(isNoneVariant('NA')).toBe(true);
      expect(isNoneVariant('Nil')).toBe(true);
      expect(isNoneVariant('Nothing')).toBe(true);
    });

    it('should detect bullet-prefixed none-variants', () => {
      expect(isNoneVariant('- None')).toBe(true);
      expect(isNoneVariant('* N/A')).toBe(true);
      expect(isNoneVariant('+ Nothing')).toBe(true);
      expect(isNoneVariant('1) Nothing')).toBe(true);
      expect(isNoneVariant('1. None')).toBe(true);
    });

    it('should detect "no issues" phrases', () => {
      expect(isNoneVariant('No blocking issues')).toBe(true);
      expect(isNoneVariant('No blocking issues found')).toBe(true);
      expect(isNoneVariant('No issues')).toBe(true);
      expect(isNoneVariant('No issues found')).toBe(true);
      expect(isNoneVariant('No critical issues')).toBe(true);
      expect(isNoneVariant('No blockers')).toBe(true);
      expect(isNoneVariant('No showstoppers')).toBe(true);
      expect(isNoneVariant('No concerns')).toBe(true);
      expect(isNoneVariant('No significant issues')).toBe(true);
      expect(isNoneVariant('No major blocking issues')).toBe(true);
    });

    it('should detect "none identified/found" phrases', () => {
      expect(isNoneVariant('None identified')).toBe(true);
      expect(isNoneVariant('None found')).toBe(true);
      expect(isNoneVariant('None detected')).toBe(true);
      expect(isNoneVariant('None at this time')).toBe(true);
      expect(isNoneVariant('None noted')).toBe(true);
      expect(isNoneVariant('None observed')).toBe(true);
      expect(isNoneVariant('None reported')).toBe(true);
      expect(isNoneVariant('None applicable')).toBe(true);
    });

    it('should detect "there are no" phrases', () => {
      expect(isNoneVariant('There are no blocking issues')).toBe(true);
      expect(isNoneVariant('There are no significant issues')).toBe(true);
      expect(isNoneVariant('There are no major blocking issues')).toBe(true);
      expect(isNoneVariant('There are no critical blockers')).toBe(true);
    });

    it('should handle empty and whitespace strings', () => {
      expect(isNoneVariant('')).toBe(true);
      expect(isNoneVariant('   ')).toBe(true);
      expect(isNoneVariant('\n')).toBe(true);
      expect(isNoneVariant('\t')).toBe(true);
    });

    it('should strip trailing punctuation before matching', () => {
      expect(isNoneVariant('None.')).toBe(true);
      expect(isNoneVariant('N/A.')).toBe(true);
      expect(isNoneVariant('No issues!')).toBe(true);
      expect(isNoneVariant('No blocking issues found.')).toBe(true);
    });
  });

  describe('true negatives (must keep as real issues)', () => {
    it('should keep real blocking issues', () => {
      expect(isNoneVariant('Missing authentication layer')).toBe(false);
      expect(isNoneVariant('SQL injection vulnerability')).toBe(false);
      expect(isNoneVariant('The API has no rate limiting')).toBe(false);
      expect(isNoneVariant('Authentication is not implemented')).toBe(false);
    });

    it('should keep "No rollback plan" (not issues/concerns/problems/blockers)', () => {
      expect(isNoneVariant('No rollback plan defined')).toBe(false);
    });

    it('should keep "None of the..." sentences (classic false positive)', () => {
      expect(isNoneVariant('None of the database migrations handle rollback')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject long plain text (>80 chars) as real issues', () => {
      const longIssue = 'The authentication system does not properly validate JWT tokens which could lead to unauthorized access to protected endpoints';
      expect(longIssue.length).toBeGreaterThan(80);
      expect(isNoneVariant(longIssue)).toBe(false);
    });

    it('should still detect long none-variant phrases', () => {
      // A "no issues" phrase that happens to be long due to qualifiers
      expect(isNoneVariant('No significant blocking issues or critical concerns identified in this review.')).toBe(true);
    });
  });
});

describe('normalizeIssueList', () => {
  it('should filter out all none-variants from a list', () => {
    const input = [
      'None',
      'No blocking issues found',
      'Missing authentication layer',
      'N/A',
      'SQL injection vulnerability',
    ];
    const result = normalizeIssueList(input);
    expect(result).toEqual([
      'Missing authentication layer',
      'SQL injection vulnerability',
    ]);
  });

  it('should handle empty lists', () => {
    expect(normalizeIssueList([])).toEqual([]);
  });

  it('should filter out empty and whitespace-only items', () => {
    const input = ['', '  ', 'Real issue', '\t'];
    const result = normalizeIssueList(input);
    expect(result).toEqual(['Real issue']);
  });

  it('should trim items before checking', () => {
    const input = ['  None  ', '  Missing auth  '];
    const result = normalizeIssueList(input);
    expect(result).toEqual(['Missing auth']);
  });

  it('should preserve order of real issues', () => {
    const input = [
      'None',
      'First real issue',
      'N/A',
      'Second real issue',
      'Third real issue',
    ];
    const result = normalizeIssueList(input);
    expect(result).toEqual([
      'First real issue',
      'Second real issue',
      'Third real issue',
    ]);
  });
});
