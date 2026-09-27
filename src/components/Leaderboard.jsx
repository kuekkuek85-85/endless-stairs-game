import { useEffect, useMemo, useState } from 'react';
import {
  fetchMyRecord,
  fetchRanks,
  isFirebaseConfigured,
  subscribeLeaderboard,
  withRanks,
} from '../firebase/scores.js';
import { classFromStudentId, displayName } from '../utils/validate.js';

const CLASSES = Array.from({ length: 15 }, (_, i) => i + 1);
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function RankRow({ row, myId }) {
  return (
    <li className={`rank-row${row.studentId === myId ? ' me' : ''}`}>
      <span className="rank">{MEDALS[row.rank] ?? row.rank}</span>
      <span className="name">{displayName(row.studentId, row.name)}</span>
      <span className="score">{row.bestScore}칸</span>
      <span className="plays">{row.playCount}회</span>
    </li>
  );
}

export default function Leaderboard({ profile, onBack }) {
  const [tab, setTab] = useState('all');
  const [classNumber, setClassNumber] = useState(profile ? classFromStudentId(profile.studentId) : 1);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'offline');
  const [projector, setProjector] = useState(false);
  const [queryText, setQueryText] = useState('');
  // 목록에 없는 학번을 직접 조회한 결과: { status: 'loading'|'found'|'none'|'error', row? }
  const [lookup, setLookup] = useState(null);

  const query = queryText.trim();

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

  // 로드된 목록에서 학번·이름으로 즉시 거르기
  const filtered = useMemo(() => {
    if (!query) return rows;
    const lower = query.toLowerCase();
    return rows.filter((r) => r.studentId.includes(query) || r.name.toLowerCase().includes(lower));
  }, [rows, query]);

  // 상위권 밖의 학생도 찾을 수 있도록, 5자리 학번은 실제 DB에서 직접 조회해 전체 순위를 보여준다
  useEffect(() => {
    setLookup(null);
    if (!isFirebaseConfigured) return undefined;
    if (!/^\d{5}$/.test(query)) return undefined;
    if (rows.some((r) => r.studentId === query)) return undefined; // 이미 목록에 있음
    let cancelled = false;
    setLookup({ status: 'loading' });
    (async () => {
      try {
        const rec = await fetchMyRecord(query);
        if (cancelled) return;
        if (!rec) {
          setLookup({ status: 'none' });
          return;
        }
        const ranks = await fetchRanks({ studentId: query, bestScore: rec.bestScore });
        if (cancelled) return;
        setLookup({ status: 'found', row: { ...rec, rank: ranks.overall } });
      } catch (err) {
        console.error(err);
        if (!cancelled) setLookup({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, rows]);

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
  const showLookup = lookup && lookup.status === 'found';

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

      {!projector && isFirebaseConfigured && (
        <div className="search-box">
          <input
            className="search-input"
            type="search"
            inputMode="text"
            placeholder="🔍 학번 또는 이름으로 찾기"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            aria-label="학번 또는 이름 검색"
          />
          {query && (
            <button type="button" className="link-btn" onClick={() => setQueryText('')}>
              지우기
            </button>
          )}
        </div>
      )}

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
        {status === 'ready' && rows.length === 0 && (
          <p className="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</p>
        )}

        {status === 'ready' && rows.length > 0 && (
          <>
            {filtered.length > 0 && (
              <ol className="rank-list">
                {filtered.map((r) => (
                  <RankRow key={r.studentId} row={r} myId={myId} />
                ))}
              </ol>
            )}

            {/* 목록(TOP 30/10) 밖의 학생을 학번으로 직접 찾은 결과 */}
            {query && showLookup && (
              <div className="lookup-result">
                <div className="lookup-label">검색 결과 · 전체 {lookup.row.rank}위</div>
                <ol className="rank-list">
                  <RankRow row={lookup.row} myId={myId} />
                </ol>
              </div>
            )}

            {query && filtered.length === 0 && !showLookup && (
              <p className="empty">
                {lookup && lookup.status === 'loading'
                  ? '찾는 중…'
                  : /^\d{5}$/.test(query)
                    ? '그 학번의 기록이 아직 없어요'
                    : '검색 결과가 없어요. 5자리 학번으로 찾으면 순위권 밖도 볼 수 있어요.'}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
