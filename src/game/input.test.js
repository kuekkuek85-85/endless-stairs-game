import { describe, expect, it } from 'vitest';
import { keyAction, pressAccepted } from './input.js';

const key = (code, extra = {}) => ({ code, repeat: false, ...extra });

describe('pressAccepted (동시 다중 터치 1회로 합치기)', () => {
  it('첫 입력은 항상 인정', () => {
    expect(pressAccepted(null, 0)).toBe(true);
  });
  it('70ms 이내의 중복 입력은 무시(두 손가락 동시 터치)', () => {
    expect(pressAccepted(1000, 1000)).toBe(false); // 동시
    expect(pressAccepted(1000, 1030)).toBe(false); // 30ms 뒤
    expect(pressAccepted(1000, 1069)).toBe(false);
  });
  it('70ms 이상 지난 입력은 인정(사람 연타 ≈83ms 간격)', () => {
    expect(pressAccepted(1000, 1070)).toBe(true);
    expect(pressAccepted(1000, 1083)).toBe(true);
    expect(pressAccepted(1000, 1200)).toBe(true);
  });
});

describe('keyAction', () => {
  it('F/← = 방향 전환, J/→ = 오르기, Space = 일시정지', () => {
    expect(keyAction(key('KeyF'))).toBe('turn');
    expect(keyAction(key('ArrowLeft'))).toBe('turn');
    expect(keyAction(key('KeyJ'))).toBe('climb');
    expect(keyAction(key('ArrowRight'))).toBe('climb');
    expect(keyAction(key('Space'))).toBe('pause');
  });

  it('누르고 있을 때의 자동 반복 입력은 무시', () => {
    expect(keyAction(key('KeyJ', { repeat: true }))).toBeNull();
    expect(keyAction(key('ArrowLeft', { repeat: true }))).toBeNull();
  });

  it('다른 키와 조합 키는 무시', () => {
    expect(keyAction(key('KeyA'))).toBeNull();
    expect(keyAction(key('KeyJ', { ctrlKey: true }))).toBeNull();
  });
});
