// localStorage 는 사생활 보호 모드 등에서 예외를 던질 수 있으므로 항상 감싼다
const PREFIX = 'endless-stairs.';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === undefined) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시 (게임 진행에는 영향 없음)
  }
}

export function loadProfile() {
  const p = read('profile', null);
  if (p && typeof p.studentId === 'string' && typeof p.name === 'string') return p;
  return null;
}

export function saveProfile(profile) {
  write('profile', profile ? { studentId: profile.studentId, name: profile.name } : undefined);
}

export function loadColorIndex() {
  const v = read('color', 0);
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

export function saveColorIndex(index) {
  write('color', index);
}

export function loadMuted() {
  return read('muted', false) === true;
}

export function saveMuted(muted) {
  write('muted', Boolean(muted));
}

export function loadLocalBest(studentId) {
  const v = read(`best.${studentId}`, 0);
  return Number.isInteger(v) && v > 0 ? v : 0;
}

export function saveLocalBest(studentId, score) {
  if (score > loadLocalBest(studentId)) write(`best.${studentId}`, score);
}

// 코인: 계단을 오를 때마다 모으고, 엘리베이터를 탈 때 쓴다 (학생별 지갑)
export function loadCoins(studentId) {
  const v = read(`coins.${studentId}`, 0);
  return Number.isInteger(v) && v > 0 ? v : 0;
}

export function saveCoins(studentId, coins) {
  write(`coins.${studentId}`, Math.max(0, Math.floor(coins)));
}

// 코인을 더하거나(양수) 쓰고(음수) 남은 코인을 반환. 음수로 내려가지 않는다.
export function changeCoins(studentId, delta) {
  const next = Math.max(0, loadCoins(studentId) + Math.floor(delta));
  saveCoins(studentId, next);
  return next;
}
