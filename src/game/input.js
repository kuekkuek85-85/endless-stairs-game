// 입력 처리 (터치·마우스·키보드). 반응 속도를 위해 click 대신 누르는 즉시 처리한다.

const PRESS_FEEDBACK_MS = 90;
// 같은 버튼에 아주 짧은 간격(이 시간 이내)으로 들어온 중복 입력은 1회로 합친다.
// 두 손가락 동시 터치·엄지가 두 점으로 인식되는 경우(2칸씩 오르던 버그)를 막는다.
// 사람의 최대 연타는 초당 약 12회(≈83ms 간격)이므로, 그보다 짧은 70ms 는 안전하게 무시된다.
const PRESS_DEDUP_MS = 70;

// prev(마지막으로 인정된 시각) 대비 now 를 새 입력으로 인정할지. (단위 테스트용 순수 함수)
export function pressAccepted(prev, now, window = PRESS_DEDUP_MS) {
  return prev == null || now - prev >= window;
}

const nowMs = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

// 요소를 누르는 즉시 handler 호출. 같은 버튼의 동시 다중 터치는 1회로 합친다.
export function bindPress(el, handler) {
  let timer = 0;
  let lastFire = null;
  const feedback = () => {
    el.classList.add('pressed');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('pressed'), PRESS_FEEDBACK_MS);
  };
  // 중복이 아니면 한 번 처리
  const fire = () => {
    const now = nowMs();
    if (!pressAccepted(lastFire, now)) return;
    lastFire = now;
    feedback();
    handler();
  };

  if (typeof window !== 'undefined' && window.PointerEvent) {
    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 길게 누르기 메뉴, 텍스트 선택, 합성 click/mouse 이벤트 방지
      e.preventDefault();
      fire();
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

  // Pointer Events 미지원 구형 브라우저: 한 번의 touchstart(손가락 몇 개든)당 1회
  const onTouchStart = (e) => {
    e.preventDefault();
    fire();
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    fire();
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
