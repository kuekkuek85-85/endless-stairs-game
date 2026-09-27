// 입력 처리 (터치·마우스·키보드). 반응 속도를 위해 click 대신 누르는 즉시 처리한다.

const PRESS_FEEDBACK_MS = 90;

// 요소를 누르는 즉시 handler 호출. 멀티터치(여러 손가락 연타)를 모두 인식.
export function bindPress(el, handler) {
  let timer = 0;
  const feedback = () => {
    el.classList.add('pressed');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('pressed'), PRESS_FEEDBACK_MS);
  };

  if (typeof window !== 'undefined' && window.PointerEvent) {
    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 길게 누르기 메뉴, 텍스트 선택, 합성 click/mouse 이벤트 방지
      e.preventDefault();
      feedback();
      handler();
    };
    // 터치 이벤트의 기본 동작(스크롤·확대)도 막는다. pointerdown 은 이미 처리했으므로 여기선 무시.
    const onTouchStart = (e) => e.preventDefault();
    const onContextMenu = (e) => e.preventDefault();
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }

  // Pointer Events 미지원 구형 브라우저: 새로 닿은 손가락마다 한 번씩
  const onTouchStart = (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      feedback();
      handler();
    }
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    feedback();
    handler();
  };
  el.addEventListener('touchstart', onTouchStart, { passive: false });
  el.addEventListener('mousedown', onMouseDown);
  return () => {
    clearTimeout(timer);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('mousedown', onMouseDown);
  };
}

// 키 → 동작. 한글 입력 상태에서도 동작하도록 e.key 대신 물리 키(e.code)를 본다.
export const KEY_ACTIONS = {
  KeyF: 'turn',
  ArrowLeft: 'turn',
  KeyJ: 'climb',
  ArrowRight: 'climb',
  Space: 'pause',
};

export function keyAction(e) {
  if (e.repeat) return null; // 누르고 있을 때의 자동 반복 무시
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return KEY_ACTIONS[e.code] ?? null;
}

export function bindKeyboard({ onTurn, onClimb, onPause }) {
  const onKeyDown = (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const action = KEY_ACTIONS[e.code];
    if (!action) return;
    // 스페이스/화살표로 페이지가 스크롤되거나 포커스된 버튼이 눌리지 않도록
    e.preventDefault();
    const a = keyAction(e);
    if (a === 'turn') onTurn();
    else if (a === 'climb') onClimb();
    else if (a === 'pause') onPause();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

// 탭 전환·화면 꺼짐·창 포커스 이탈 시 자동 일시정지
export function bindAutoPause(onPause) {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') onPause();
  };
  window.addEventListener('blur', onPause);
  window.addEventListener('pagehide', onPause);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('blur', onPause);
    window.removeEventListener('pagehide', onPause);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

// 게임 화면에서 손가락 드래그로 인한 스크롤·당겨서 새로고침 방지
export function preventTouchScroll(el) {
  const prevent = (e) => e.preventDefault();
  el.addEventListener('touchmove', prevent, { passive: false });
  return () => el.removeEventListener('touchmove', prevent);
}
