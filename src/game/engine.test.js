import { describe, expect, it } from 'vitest';
import {
  FALL_DURATION,
  GAUGE_MAX,
  GAUGE_RECOVER,
  KEEP_BEHIND,
  LEFT,
  MAX_FRAME_DT,
  MAX_RUN,
  MIN_AHEAD,
  RIGHT,
  WARMUP_STEPS,
  act,
  createGame,
  drainRate,
  getStair,
  lastIndex,
  setPaused,
  speedLevel,
  update,
} from './engine.js';

// 결정적 난수 (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 항상 올바른 버튼을 누르는 입력
function correctTurn(game) {
  return getStair(game, game.pos + 1).dir !== game.facing;
}

function climbPerfectly(game, steps) {
  for (let i = 0; i < steps; i++) act(game, correctTurn(game));
}

describe('계단 생성', () => {
  it('각 계단은 이전 계단의 왼쪽 위 또는 오른쪽 위', () => {
    const game = createGame({ rng: seeded(1) });
    for (let i = 1; i < game.stairs.length; i++) {
      const [a, b] = [game.stairs[i - 1], game.stairs[i]];
      expect(b.y).toBe(a.y + 1);
      expect(Math.abs(b.x - a.x)).toBe(1);
      expect(b.dir).toBe(b.x - a.x);
    }
  });

  it('첫 계단은 시작 방향(오른쪽)', () => {
    for (let s = 0; s < 20; s++) {
      expect(getStair(createGame({ rng: seeded(s) }), 1).dir).toBe(RIGHT);
    }
  });

  it(`같은 방향은 ${MAX_RUN}칸을 넘겨 연속되지 않음`, () => {
    // 항상 같은 방향을 고르게 하는 최악의 난수
    const game = createGame({ rng: () => 0.99 });
    climbPerfectly(game, 500);
    let run = 0;
    let prev = 0;
    for (let i = game.base + 1; i <= lastIndex(game); i++) {
      const d = getStair(game, i).dir;
      run = d === prev ? run + 1 : 1;
      prev = d;
      expect(run).toBeLessThanOrEqual(MAX_RUN);
    }
  });

  it('워밍업 구간은 방향 전환이 적음', () => {
    let warmTurns = 0;
    let laterTurns = 0;
    const trials = 300;
    for (let s = 0; s < trials; s++) {
      const game = createGame({ rng: seeded(s + 100) });
      for (let i = 2; i <= WARMUP_STEPS; i++) {
        if (getStair(game, i).dir !== getStair(game, i - 1).dir) warmTurns++;
      }
      for (let i = WARMUP_STEPS + 2; i <= WARMUP_STEPS * 2; i++) {
        if (getStair(game, i).dir !== getStair(game, i - 1).dir) laterTurns++;
      }
    }
    expect(warmTurns / trials).toBeLessThan(laterTurns / trials / 2);
  });

  it(`앞쪽 계단은 항상 ${MIN_AHEAD}칸 이상, 지나간 계단은 제거`, () => {
    const game = createGame({ rng: seeded(7) });
    climbPerfectly(game, 1000);
    expect(game.score).toBe(1000);
    expect(lastIndex(game) - game.pos).toBeGreaterThanOrEqual(MIN_AHEAD);
    expect(game.pos - game.base).toBeLessThanOrEqual(KEEP_BEHIND);
    expect(game.stairs.length).toBeLessThanOrEqual(KEEP_BEHIND + MIN_AHEAD + 2);
  });
});

describe('판정', () => {
  it('맞는 방향이면 한 칸 오르고 1점', () => {
    const game = createGame({ rng: seeded(3) });
    const ev = act(game, false); // 첫 칸은 오른쪽
    expect(ev).toEqual(['climb']);
    expect(game.score).toBe(1);
    expect(game.pos).toBe(1);
    expect(game.status).toBe('playing');
  });

  it('방향 전환은 몸을 돌리면서 한 칸 오름', () => {
    const game = createGame({ rng: seeded(3) });
    climbPerfectly(game, 1);
    // 다음 계단이 왼쪽이 될 때까지 진행
    while (getStair(game, game.pos + 1).dir === game.facing) act(game, false);
    const before = game.score;
    const ev = act(game, true);
    expect(ev).toContain('turn');
    expect(game.facing).toBe(LEFT);
    expect(game.score).toBe(before + 1);
  });

  it('틀린 방향이면 즉시 떨어지고, 연출 후 게임 오버', () => {
    const game = createGame({ rng: seeded(3) });
    const ev = act(game, true); // 첫 칸은 오른쪽인데 왼쪽으로 전환
    expect(ev).toEqual(['turn', 'fall']);
    expect(game.status).toBe('falling');
    expect(game.overReason).toBe('fall');
    expect(game.score).toBe(0);
    // 떨어지는 중에는 입력 무시
    expect(act(game, false)).toEqual([]);
    let over = false;
    for (let t = 0; t < FALL_DURATION + 0.2; t += 1 / 60) {
      if (update(game, 1 / 60).includes('over')) over = true;
    }
    expect(over).toBe(true);
    expect(game.status).toBe('over');
  });

  it('50칸마다 마일스톤 이벤트', () => {
    const game = createGame({ rng: seeded(9) });
    const milestones = [];
    for (let i = 0; i < 160; i++) {
      if (act(game, correctTurn(game)).includes('milestone')) milestones.push(game.score);
    }
    expect(milestones).toEqual([50, 100, 150]);
  });
});

describe('시간 게이지', () => {
  it('첫 입력 전(ready)에는 줄지 않음', () => {
    const game = createGame();
    update(game, 0.1);
    expect(game.gauge).toBe(GAUGE_MAX);
  });

  it('시간에 따라 줄고, 오르면 회복하되 최대치를 넘지 않음', () => {
    const game = createGame({ rng: seeded(1) });
    act(game, false);
    expect(game.gauge).toBe(GAUGE_MAX);
    for (let i = 0; i < 10; i++) update(game, 0.1);
    const drained = game.gauge;
    expect(drained).toBeCloseTo(GAUGE_MAX - drainRate(1) * 1, 5);
    act(game, correctTurn(game));
    expect(game.gauge).toBeCloseTo(Math.min(GAUGE_MAX, drained + GAUGE_RECOVER), 5);
  });

  it('기록이 오를수록 감소 속도가 빨라짐', () => {
    expect(speedLevel(0)).toBe(0);
    expect(speedLevel(49)).toBe(0);
    expect(speedLevel(50)).toBe(1);
    expect(speedLevel(100)).toBe(2);
    expect(speedLevel(200)).toBe(3);
    expect(speedLevel(300)).toBe(4);
    expect(speedLevel(2000)).toBe(4);
    const rates = [0, 50, 100, 200, 300].map(drainRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });

  it('게이지가 0이 되면 시간 초과로 게임 오버', () => {
    const game = createGame({ rng: seeded(1) });
    act(game, false);
    const events = [];
    for (let i = 0; i < 600 && game.status !== 'over'; i++) events.push(...update(game, 1 / 30));
    expect(events).toContain('timeout');
    expect(events).toContain('over');
    expect(game.overReason).toBe('timeout');
  });

  it('느린 프레임(0.25초)도 실제 경과 시간을 모두 반영', () => {
    const game = createGame({ rng: seeded(1) });
    act(game, false);
    update(game, 0.25);
    expect(game.elapsed).toBeCloseTo(0.25, 5);
    expect(game.gauge).toBeCloseTo(GAUGE_MAX - drainRate(1) * 0.25, 5);
  });

  it(`비정상적으로 긴 공백은 ${MAX_FRAME_DT}초까지만 반영`, () => {
    const game = createGame({ rng: seeded(1) });
    act(game, false);
    update(game, 30);
    expect(game.elapsed).toBeCloseTo(MAX_FRAME_DT, 5);
    expect(game.status).toBe('playing');
  });

  it('긴 프레임 안에서도 시간 초과 순간을 정확히 판정', () => {
    const game = createGame({ rng: seeded(1) });
    act(game, false);
    game.gauge = 0.01;
    const events = update(game, 0.9);
    expect(events).toContain('timeout');
    // 시간 초과 이후 남은 시간은 낙하 연출로 넘어감
    expect(game.elapsed).toBeLessThan(0.2);
  });

  it('일시정지 중에는 게이지·경과 시간·입력이 멈춤', () => {
    const game = createGame({ rng: seeded(1) });
    act(game, false);
    setPaused(game, true);
    const { gauge, elapsed, score } = game;
    update(game, 0.1);
    expect(act(game, false)).toEqual([]);
    expect(game.gauge).toBe(gauge);
    expect(game.elapsed).toBe(elapsed);
    expect(game.score).toBe(score);
    setPaused(game, false);
    update(game, 0.1);
    expect(game.gauge).toBeLessThan(gauge);
  });
});
