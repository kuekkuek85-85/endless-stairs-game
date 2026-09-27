import { useEffect, useRef } from 'react';
import { bindPress } from '../game/input.js';

// 하단 좌우 큰 버튼: 왼쪽 = 방향 전환, 오른쪽 = 오르기
export default function ControlButtons({ onTurn, onClimb }) {
  const turnRef = useRef(null);
  const climbRef = useRef(null);
  const handlers = useRef({ onTurn, onClimb });
  handlers.current = { onTurn, onClimb };

  useEffect(() => {
    const unbindTurn = bindPress(turnRef.current, () => handlers.current.onTurn());
    const unbindClimb = bindPress(climbRef.current, () => handlers.current.onClimb());
    return () => {
      unbindTurn();
      unbindClimb();
    };
  }, []);

  return (
    <div className="controls">
      <button ref={turnRef} type="button" className="control-btn turn" aria-label="방향 전환" tabIndex={-1}>
        <span className="icon">⇄</span>
        <span>방향 전환</span>
        <span className="key">F / ←</span>
      </button>
      <button ref={climbRef} type="button" className="control-btn climb" aria-label="오르기" tabIndex={-1}>
        <span className="icon">▲</span>
        <span>오르기</span>
        <span className="key">J / →</span>
      </button>
    </div>
  );
}
