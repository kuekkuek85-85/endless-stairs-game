import { useEffect } from 'react';

// 게임 오버 화면 (표시 전용). 저장은 App 에서 게임 오버 순간 한 번만 실행한다.
// save.status: saving | saved | error | offline(서버 설정 없음) | rejected(비정상 기록)
export default function GameOver({ result, save, bestBefore, onRetrySave, onRetry, onRanking, onHome }) {
  const { score, reason, coins } = result;
  const { status, serverBest, ranks, isNewBest } = save;
  const best = Math.max(bestBefore, serverBest ?? 0, status === 'rejected' ? 0 : score);
  const earned = Number.isInteger(coins) ? coins : 0;

  // PC: 스페이스바(또는 Enter)로 바로 다시 하기
  useEffect(() => {
    const onKeyDown = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        onRetry();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onRetry]);

  return (
    <main className="screen scroll">
      <p className="result-reason" style={{ marginTop: 24 }}>
        {reason === 'timeout' ? '⏰ 시간 초과!' : '💫 떨어졌어요!'}
      </p>
      <div className="card">
        <div className="result-score">
          <div className="label">이번 기록</div>
          <div className="value">{score}</div>
          {isNewBest && <div className="new-best">NEW BEST!</div>}
          {earned > 0 && <div className="coins-earned">🪙 +{earned} 코인</div>}
        </div>
        <div className="stats">
          <div className="stat">
            <b>{best}</b>
            <span>최고 기록</span>
          </div>
          <div className="stat">
            <b>{ranks ? `${ranks.overall}위` : '-'}</b>
            <span>전체 순위</span>
          </div>
          <div className="stat">
            <b>{ranks ? `${ranks.inClass}위` : '-'}</b>
            <span>{ranks ? `${ranks.classNumber}반 순위` : '반 순위'}</span>
          </div>
        </div>
      </div>

      {status === 'saving' && <div className="notice">기록 저장 중…</div>}
      {status === 'saved' && <div className="notice">✅ 기록이 저장됐어요</div>}
      {status === 'offline' && <div className="notice">랭킹 서버가 설정되지 않아 이 기기에만 기록했어요</div>}
      {status === 'rejected' && (
        <div className="notice error">기록이 너무 빨라서 정상 기록으로 인정되지 않았어요</div>
      )}
      {status === 'error' && (
        <div className="notice error">
          기록 저장에 실패했어요
          <button type="button" className="btn small" onClick={onRetrySave}>
            다시 시도
          </button>
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onRetry}>
          다시 하기
        </button>
        <button type="button" className="btn secondary" onClick={onRanking}>
          🏆 랭킹 보기
        </button>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        스페이스바를 누르면 바로 다시 시작해요
      </p>
      <button type="button" className="link-btn" onClick={onHome}>
        처음 화면으로
      </button>
    </main>
  );
}
