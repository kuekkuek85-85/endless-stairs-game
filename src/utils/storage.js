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
