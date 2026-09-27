import { describe, expect, it } from 'vitest';
import {
  classFromStudentId,
  displayName,
  isPlausibleScore,
  validateName,
  validateStudentId,
} from './validate.js';

describe('validateStudentId', () => {
  it.each(['10101', '10305', '11540', '10940', '11001'])('%s 는 통과', (id) => {
    expect(validateStudentId(id).ok).toBe(true);
  });

  it.each([
    ['', '5자리'],
    ['1030', '5자리'],
    ['103050', '5자리'],
    ['1030a', '5자리'],
    ['20305', '첫 자리'],
    ['10005', '반'],
    ['11605', '반'],
    ['10300', '번호'],
    ['10341', '번호'],
  ])('%s 는 실패 (%s)', (id, hint) => {
    const r = validateStudentId(id);
    expect(r.ok).toBe(false);
    expect(r.message).toContain(hint);
  });

  it('앞뒤 공백은 무시', () => {
    expect(validateStudentId(' 10305 ')).toEqual({ ok: true, value: '10305' });
  });
});

describe('validateName', () => {
  it.each(['홍길동', '이산', '남궁민수', '가나다라마'])('%s 는 통과', (n) => {
    expect(validateName(n).ok).toBe(true);
  });
  it.each(['홍', '가나다라마바', 'Kim', '홍길1', '홍 길동', 'ㄱㄴㄷ'])('%s 는 실패', (n) => {
    expect(validateName(n).ok).toBe(false);
  });
});

describe('학번 파생 값', () => {
  it('반 추출', () => {
    expect(classFromStudentId('10305')).toBe(3);
    expect(classFromStudentId('11522')).toBe(15);
  });
  it('표시 이름', () => {
    expect(displayName('10305', '홍길동')).toBe('103 홍길동');
  });
});

describe('isPlausibleScore', () => {
  it('초당 12칸 이하면 통과', () => {
    expect(isPlausibleScore(120, 10_000)).toBe(true);
    expect(isPlausibleScore(0, 0)).toBe(true);
    expect(isPlausibleScore(2, 50)).toBe(true);
  });
  it('초당 12칸을 크게 넘으면 거부', () => {
    expect(isPlausibleScore(200, 10_000)).toBe(false);
    expect(isPlausibleScore(3000, 1_000)).toBe(false);
  });
  it('잘못된 값은 거부', () => {
    expect(isPlausibleScore(-1, 1000)).toBe(false);
    expect(isPlausibleScore(1.5, 1000)).toBe(false);
    expect(isPlausibleScore(1, NaN)).toBe(false);
  });
});
