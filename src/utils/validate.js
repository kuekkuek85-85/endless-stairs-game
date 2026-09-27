// 학번: 1학년(1) + 반(01~15) + 번호(01~40)
const STUDENT_ID_RE = /^1(0[1-9]|1[0-5])(0[1-9]|[1-3][0-9]|40)$/;
const NAME_RE = /^[가-힣]{2,5}$/;

// 사람이 누를 수 있는 최대 속도(초당 계단 수)
export const MAX_STEPS_PER_SECOND = 12;
// 첫 입력 직후처럼 경과 시간이 매우 짧을 때의 여유분
const SCORE_GRACE = 3;

export function validateStudentId(raw) {
  const id = String(raw ?? '').trim();
  if (!/^\d{5}$/.test(id)) {
    return { ok: false, message: '학번은 숫자 5자리로 입력해 주세요. (예: 10305)' };
  }
  if (id[0] !== '1') {
    return { ok: false, message: '학번 첫 자리는 1(1학년)이어야 해요.' };
  }
  const cls = Number(id.slice(1, 3));
  if (cls < 1 || cls > 15) {
    return { ok: false, message: '반은 01~15 사이여야 해요. (학번 2~3번째 자리)' };
  }
  const num = Number(id.slice(3, 5));
  if (num < 1 || num > 40) {
    return { ok: false, message: '번호는 01~40 사이여야 해요. (학번 4~5번째 자리)' };
  }
  // 위 검사를 통과하면 정규식과도 일치해야 한다
  return STUDENT_ID_RE.test(id) ? { ok: true, value: id } : { ok: false, message: '학번 형식이 올바르지 않아요.' };
}

export function validateName(raw) {
  const name = String(raw ?? '').trim();
  if (!NAME_RE.test(name)) {
    return { ok: false, message: '성명은 한글 2~5자로 입력해 주세요.' };
  }
  return { ok: true, value: name };
}

export function classFromStudentId(id) {
  return Number(String(id).slice(1, 3));
}

// 학번 앞 3자리 + 성명 (예: "103 홍길동")
export function displayName(studentId, name) {
  return `${String(studentId).slice(0, 3)} ${name}`;
}

// 한 판의 경과 시간 대비 계단 수가 사람이 누를 수 있는 속도인지 검사
export function isPlausibleScore(score, elapsedMs) {
  if (!Number.isInteger(score) || score < 0) return false;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  const maxScore = Math.floor((elapsedMs / 1000) * MAX_STEPS_PER_SECOND) + SCORE_GRACE;
  return score <= maxScore;
}
