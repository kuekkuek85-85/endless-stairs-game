import { describe, expect, it } from 'vitest';
import { keyAction } from './input.js';

const key = (code, extra = {}) => ({ code, repeat: false, ...extra });

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
