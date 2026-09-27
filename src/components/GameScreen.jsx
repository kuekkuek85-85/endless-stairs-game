import { useCallback, useEffect, useRef, useState } from 'react';
import ControlButtons from './ControlButtons.jsx';
import { act, createGame, setPaused, update } from '../game/engine.js';
import { CHARACTER_COLORS, createRenderer } from '../game/renderer.js';
import { bindAutoPause, bindKeyboard, preventTouchScroll } from '../game/input.js';
import { isMuted, playSound, setMuted } from '../utils/sound.js';

// 게임 로직(engine)은 입력 즉시 처리하고, 렌더링(renderer)은 requestAnimationFrame 에서만 한다.
// 매 프레임 바뀌는 값(점수·게이지)은 캔버스에 그려 React 리렌더를 만들지 않는다.
export default function GameScreen({ colorIndex, best, onGameOver, onQuit }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const screenRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  const [paused, setPausedUi] = useState(false);
  const [muted, setMutedUi] = useState(isMuted());

  const latest = useRef({ best, onGameOver });
  latest.current = { best, onGameOver };

  const pause = useCallback((value) => {
    const game = gameRef.current;
    if (!game) return;
    // 아직 시작 전이거나 이미 끝났으면 일시정지할 필요 없음
    if (value && game.status !== 'playing') return;
    setPaused(game, value);
    setPausedUi(game.paused);
  }, []);

  const handleAction = useCallback((turn) => {
    const game = gameRef.current;
    if (!game) return;
    const events = act(game, turn);
    if (!events.length) return;
    rendererRef.current?.onEvents(events, game);
    if (events.includes('fall')) playSound('fall');
    else {
      playSound(events.includes('turn') ? 'turn' : 'climb');
      if (events.includes('milestone')) playSound('milestone');
    }
  }, []);

  useEffect(() => {
    const game = createGame();
    gameRef.current = game;
    if (import.meta.env.DEV) window.__game = game; // 개발 중 디버깅용
    const renderer = createRenderer(canvasRef.current, {
      color: CHARACTER_COLORS[colorIndex] ?? CHARACTER_COLORS[0],
    });
    rendererRef.current = renderer;

    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(wrapRef.current);

    let raf = 0;
    let last = performance.now();
    let finished = false;
    const frame = (now) => {
      // 게임 로직에는 실제 경과 시간을 그대로, 애니메이션 보간에만 상한을 둔다
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      const events = update(game, dt);
      if (events.length) renderer.onEvents(events, game);
      if (events.includes('timeout')) playSound('timeout');
      renderer.render(game, game.paused ? 0 : Math.min(dt, 0.1), { best: latest.current.best });
      if (events.includes('over') && !finished) {
        finished = true;
        latest.current.onGameOver({
          score: game.score,
          elapsedMs: Math.round(game.elapsed * 1000),
          reason: game.overReason,
        });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const unbindKeys = bindKeyboard({
      onTurn: () => handleAction(true),
      onClimb: () => handleAction(false),
      onPause: () => pause(!game.paused),
    });
    const unbindAutoPause = bindAutoPause(() => pause(true));
    const unbindScroll = preventTouchScroll(screenRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unbindKeys();
      unbindAutoPause();
      unbindScroll();
      gameRef.current = null;
      rendererRef.current = null;
    };
  }, [colorIndex, handleAction, pause]);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedUi(!muted);
  };

  return (
    <main ref={screenRef} className="screen game">
      <div ref={wrapRef} className="game-canvas-wrap">
        <canvas ref={canvasRef} />
        <button
          type="button"
          className="icon-btn"
          aria-label="일시정지"
          onPointerDown={(e) => {
            e.preventDefault();
            pause(true);
          }}
        >
          ❚❚
        </button>
      </div>
      <ControlButtons onTurn={() => handleAction(true)} onClimb={() => handleAction(false)} />

      {paused && (
        <div className="overlay">
          <div className="card">
            <h2>일시정지</h2>
            <button type="button" className="btn" onClick={() => pause(false)}>
              계속하기
            </button>
            <button type="button" className="btn secondary" onClick={toggleMute}>
              {muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}
            </button>
            <button type="button" className="btn secondary" onClick={onQuit}>
              그만하기
            </button>
            <p className="hint">스페이스바로도 계속할 수 있어요</p>
          </div>
        </div>
      )}
    </main>
  );
}
