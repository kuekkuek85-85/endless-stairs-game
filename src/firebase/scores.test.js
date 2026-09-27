import { describe, expect, it } from 'vitest';
import { withRanks } from './scores.js';

describe('withRanks', () => {
  it('동점은 같은 순위, 다음 순위는 건너뜀', () => {
    const rows = [{ bestScore: 50 }, { bestScore: 40 }, { bestScore: 40 }, { bestScore: 10 }];
    expect(withRanks(rows).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
  it('빈 목록', () => {
    expect(withRanks([])).toEqual([]);
  });
});
