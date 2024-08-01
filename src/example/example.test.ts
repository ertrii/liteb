import { describe, expect, test } from '@jest/globals';
import { sum } from './example.utility';

describe('adds 1 + 2 to equal 3', () => {
  test('sfa', () => {
    expect(sum(1, 2)).toBe(3);
  });
});
