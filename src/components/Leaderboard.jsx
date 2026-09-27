import { useEffect, useState } from 'react';
import { isFirebaseConfigured, subscribeLeaderboard, withRanks } from '../firebase/scores.js';
import { classFromStudentId, displayName } from '../utils/validate.js';

const CLASSES = Array.from({ length: 15 }, (_, i) => i + 1);
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function Leaderboard({ profile, onBack }) {
  const [tab, setTab] = useState('all');
  const [classNumber, setClassNumber] = useState(profile ? classFromStudentId(profile.studentId) : 1);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'offline');
  const [projector, setProjector] = useState(false);

  // 실시간 반영(onSnapshot): 탭·반이 바뀌면 이전 구독을 해제하고 새로 구독
  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    setStatus('loading');
    return subscribeLeaderboard(
      { classNumber: tab === 'class' ? classNumber : null },
      (data) => {
        setRows(withRanks(data));
        setStatus('ready');
      },
      (err) => {
        console.error(err);
        setStatus('error');
      },
    );
  }, [tab, classNumber]);

  // 프로젝터 모드를 끄거나 화면을 떠나면 전체 화면 해제
  useEffect(() => {
    if (!projector) return undefined;
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) setProjector(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [projector]);

  const myId = profile?.studentId;

  return (
    <main className={`screen scroll leaderboard${projector ? ' projector' : ''}${tab === 'all' ? ' all' : ''}`}>
      <div className="row-between">
        <button type="button" className="btn secondary small" onClick={onBack}>
          ← 돌아가기
        </button>
        <button type="button" className="btn secondary small" onClick={() => setProjector((p) => !p)}>
          {projector ? '작은 화면' : '📺 큰 화면 보기'}
        </button>
      </div>
      <h1 className="title">🏆 랭킹</h1>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={`tab${tab === 'all' ? ' active' : ''}`}
          onClick={() => setTab('all')}
        >
          전체 TOP 30
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'class'}
          className={`tab${tab === 'class' ? ' active' : ''}`}
          onClick={() => setTab('class')}
        >
          반별 TOP 10
        </button>
      </div>

      <div className="card">
        {tab === 'class' && (
          <div className="row-between" style={{ marginBottom: 8 }}>
            <b>{classNumber}반</b>
            <select
              className="class-select"
              value={classNumber}
              onChange={(e) => setClassNumber(Number(e.target.value))}
              aria-label="반 선택"
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}반
                </option>
              ))}
            </select>
          </div>
        )}

        {status === 'offline' && <p className="empty">랭킹 서버가 설정되지 않았어요</p>}
        {status === 'loading' && <p className="empty">불러오는 중…</p>}
        {status === 'error' && <p className="empty">랭킹을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
        {status === 'ready' && rows.length === 0 && <p className="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</p>}
        {status === 'ready' && rows.length > 0 && (
          <ol className="rank-list">
            {rows.map((r) => (
              <li key={r.studentId} className={`rank-row${r.studentId === myId ? ' me' : ''}`}>
                <span className="rank">{MEDALS[r.rank] ?? r.rank}</span>
                <span className="name">{displayName(r.studentId, r.name)}</span>
                <span className="score">{r.bestScore}칸</span>
                <span className="plays">{r.playCount}회</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
