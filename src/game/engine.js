// 게임 로직 (계단 생성·판정·게이지). 렌더링/DOM 과 분리된 순수 모듈.
//
// 좌표: 계단 i 는 y = i, x 는 이전 계단에서 왼쪽(-1) 또는 오른쪽(+1)으로 한 칸.
// 캐릭터는 항상 어떤 계단 위(pos)에 서 있다.

export const LEFT = -1;
export const RIGHT = 1;

export const MAX_RUN = 6; // 같은 방향 최대 연속 칸 수
export const WARMUP_STEPS = 10; // 워밍업 구간
const WARMUP_TURN_CHANCE = 0.12;
const NORMAL_TURN_CHANCE = 0.45;

export const MIN_AHEAD = 30; // 캐릭터 위로 미리 만들어 둘 계단 수 (화면에는 최소 12칸 보임)
export const KEEP_BEHIND = 12; // 지나간 계단은 이만큼만 남기고 메모리에서 제거

// 시간 게이지 (0~1)
export const GAUGE_MAX = 1;
export const GAUGE_RECOVER = 0.075; // 한 칸 오를 때 회복량
export const SPEED_THRESHOLDS = [50, 100, 200, 300]; // 이 칸 수마다 한 단계씩 빨라짐
export const DRAIN_PER_SECOND = [0.12, 0.17, 0.22, 0.28, 0.34]; // 단계별 초당 감소량
export const GAUGE_WARNING = 0.3;

export const MILESTONE_EVERY = 50;
export const FALL_DURATION = 1.1; // 떨어지는 연출 시간(초) 후 게임 오버

const MAX_DT = 0.1; // 한 번에 계산하는 최대 시간 단위
// 한 프레임에서 반영할 최대 시간. 느린 기기의 프레임 지연은 모두 반영하고,
// 절전·백그라운드 복귀처럼 비정상적으로 긴 공백만 잘라낸다(보통은 자동 일시정지가 먼저 걸림).
export const MAX_FRAME_DT = 1;

export function speedLevel(score) {
  let level = 0;
  for (const t of SPEED_THRESHOLDS) if (score >= t) level += 1;
  return level;
}

export function drainRate(score) {
  return DRAIN_PER_SECOND[speedLevel(score)];
}

// 다음 계단 방향 결정 (연속 제한 + 워밍업)
export function nextDirection(prevDir, runLength, index, rng) {
  if (runLength >= MAX_RUN) return -prevDir;
  const chance = index <= WARMUP_STEPS ? WARMUP_TURN_CHANCE : NORMAL_TURN_CHANCE;
  return rng() < chance ? -prevDir : prevDir;
}

export function createGame({ rng = Math.random } = {}) {
  const state = {
    rng,
    // stairs[k] 는 계단 번호 base + k
    base: 0,
    stairs: [{ x: 0, y: 0, dir: 0 }],
    lastDir: RIGHT,
    runLength: 0,
    pos: 0,
    facing: RIGHT,
    score: 0,
    gauge: GAUGE_MAX,
    status: 'ready', // ready → playing → falling → over
    overReason: null, // 'fall' | 'timeout'
    paused: false,
    elapsed: 0, // 첫 입력 이후 경과(초), 일시정지 제외
    fallTime: 0,
    fallDir: 0,
    lastMilestone: 0,
  };
  // 첫 칸은 시작 방향(오른쪽)과 같게 두어 첫 [오르기]가 항상 성공
  appendStair(state, RIGHT);
  fillAhead(state);
  return state;
}

function appendStair(state, dir) {
  const last = state.stairs[state.stairs.length - 1];
  state.stairs.push({ x: last.x + dir, y: last.y + 1, dir });
  state.runLength = dir === state.lastDir ? state.runLength + 1 : 1;
  state.lastDir = dir;
}

function fillAhead(state) {
  while (lastIndex(state) - state.pos < MIN_AHEAD) {
    const index = lastIndex(state) + 1;
    appendStair(state, nextDirection(state.lastDir, state.runLength, index, state.rng));
  }
}

function prune(state) {
  const drop = state.pos - KEEP_BEHIND - state.base;
  if (drop > 0) {
    state.stairs.splice(0, drop);
    state.base += drop;
  }
}

export function lastIndex(state) {
  return state.base + state.stairs.length - 1;
}

export function getStair(state, index) {
  return state.stairs[index - state.base];
}

export function isActive(state) {
  return (state.status === 'ready' || state.status === 'playing') && !state.paused;
}

// 플레이어 입력. turn=true 이면 [방향 전환], 아니면 [오르기].
// 발생한 이벤트 목록을 반환: 'climb' | 'turn' | 'milestone' | 'fall'
export function act(state, turn) {
  if (!isActive(state)) return [];
  if (state.status === 'ready') state.status = 'playing';

  const events = [];
  if (turn) {
    state.facing = -state.facing;
    events.push('turn');
  }

  const next = getStair(state, state.pos + 1);
  if (next.dir !== state.facing) {
    state.status = 'falling';
    state.overReason = 'fall';
    state.fallDir = state.facing;
    state.fallTime = 0;
    events.push('fall');
    return events;
  }

  state.pos += 1;
  state.score += 1;
  state.gauge = Math.min(GAUGE_MAX, state.gauge + GAUGE_RECOVER);
  if (!turn) events.push('climb');

  if (state.score % MILESTONE_EVERY === 0 && state.score > state.lastMilestone) {
    state.lastMilestone = state.score;
    events.push('milestone');
  }

  fillAhead(state);
  prune(state);
  return events;
}

// 매 프레임 호출. dt 는 초 단위. 발생한 이벤트 목록 반환: 'timeout' | 'over'
// 프레임이 늦어져도 실제 경과 시간을 모두 반영하되(게이지·부정 기록 검사의 기준),
// 작은 단계로 나눠 계산해 시간 초과 순간을 정확히 판정한다.
export function update(state, dt) {
  if (state.paused) return [];
  const events = [];
  let remaining = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
  while (remaining > 0 && state.status !== 'over') {
    const step = Math.min(remaining, MAX_DT);
    remaining -= step;
    stepOnce(state, step, events);
  }
  return events;
}

function stepOnce(state, step, events) {
  if (state.status === 'playing') {
    state.elapsed += step;
    state.gauge = Math.max(0, state.gauge - drainRate(state.score) * step);
    if (state.gauge <= 0) {
      state.status = 'falling';
      state.overReason = 'timeout';
      state.fallDir = state.facing;
      state.fallTime = 0;
      events.push('timeout');
    }
  } else if (state.status === 'falling') {
    state.fallTime += step;
    if (state.fallTime >= FALL_DURATION) {
      state.status = 'over';
      events.push('over');
    }
  }
}

export function setPaused(state, paused) {
  // 끝난 게임은 일시정지할 필요 없음
  if (state.status === 'over') return;
  state.paused = paused;
}
