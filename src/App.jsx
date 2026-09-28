import { useCallback, useEffect, useRef, useState } from 'react';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import GameOver from './components/GameOver.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import { MAX_COINS, fetchMyRecord, fetchRanks, isFirebaseConfigured, saveScore } from './firebase/scores.js';
import {
  loadCoins,
  loadColorIndex,
  loadLocalBest,
  loadProfile,
  saveCoins,
  saveColorIndex,
  saveLocalBest,
  saveProfile,
} from './utils/storage.js';
import { clampScore, isPlausibleScore } from './utils/validate.js';
import { elevatorCost } from './game/engine.js';
import { CHARACTER_COLORS } from './game/renderer.js';

const clampCoins = (n) => Math.max(0, Math.min(MAX_COINS, Math.floor(n)));

export default function App() {
  const [screen, setScreen] = useState('start'); // start | game | over | ranking
  const [rankingFrom, setRankingFrom] = useState('start');
  const [profile, setProfile] = useState(loadProfile);
  const [colorIndex, setColorIndex] = useState(() => Math.min(loadColorIndex(), CHARACTER_COLORS.length - 1));
  const [remoteBest, setRemoteBest] = useState(0);
  const [coins, setCoins] = useState(0); // 현재 학생의 코인(로컬 캐시, 서버와 동기화)
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const [bestBefore, setBestBefore] = useState(0);
  const [save, setSave] = useState(null);
  const [startFloor, setStartFloor] = useState(0); // 엘리베이터 시작 층 (다시 하기 때 유지)
  const saveChain = useRef(Promise.resolve());
  const saveToken = useRef(0);
  const lastSettle = useRef(null); // [다시 시도]용 정산 인자

  const best = profile ? Math.max(loadLocalBest(profile.studentId), remoteBest) : 0;

  // 코인을 로컬 캐시와 화면 상태에 함께 반영
  const applyCoins = useCallback((studentId, value) => {
    const v = clampCoins(value);
    saveCoins(studentId, v);
    setCoins(v);
  }, []);

  // 학생이 바뀌면 최고 기록·코인을 서버에서 불러와 이어 쓴다(여러 기기 동기화)
  useEffect(() => {
    const id = profile?.studentId;
    if (!id) {
      setRemoteBest(0);
      setCoins(0);
      return undefined;
    }
    setRemoteBest(0);
    setCoins(loadCoins(id)); // 로컬 캐시로 즉시 표시
    if (!isFirebaseConfigured) return undefined;
    let cancelled = false;
    fetchMyRecord(id)
      .then((rec) => {
        if (cancelled || !rec) return;
        if (Number.isInteger(rec.bestScore)) setRemoteBest((b) => Math.max(b, rec.bestScore));
        if (Number.isInteger(rec.coins)) applyCoins(id, rec.coins);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile?.studentId, applyCoins]);

  const start = (p, floor = startFloor) => {
    // 엘리베이터: 코인이 충분할 때만 시작 층을 적용(비용은 게임 오버 때 정산)
    const cost = floor > 0 ? elevatorCost(floor) : 0;
    const useFloor = floor > 0 && loadCoins(p.studentId) >= cost ? floor : 0;
    setStartFloor(useFloor);
    setProfile(p);
    saveProfile(p);
    setRound((r) => r + 1);
    setScreen('game');
  };

  // 게임 오버 정산: 코인(획득−소모)을 서버에 저장하고, 정상 기록이면 점수도 기록한다.
  // 빠르게 연달아 플레이해도 순서대로 하나씩, 화면에는 가장 최근 판만 반영.
  const settle = useCallback(
    (p, { score, before, earned, spent, recordScore }) => {
      const token = ++saveToken.current;
      const update = (fn) => {
        if (saveToken.current === token) setSave(fn);
      };
      if (recordScore) update((s) => ({ ...s, status: 'saving' }));
      saveChain.current = saveChain.current.then(async () => {
        try {
          const r = await saveScore({
            studentId: p.studentId,
            name: p.name,
            score,
            earnedCoins: earned,
            spentCoins: spent,
            recordScore,
          });
          applyCoins(p.studentId, r.coins); // 서버 값으로 코인 동기화
          if (recordScore) {
            setRemoteBest((b) => Math.max(b, r.bestScore));
            update((s) => ({
              ...s,
              status: 'saved',
              serverBest: r.bestScore,
              isNewBest: score > 0 && score > Math.max(before, r.previousBest),
            }));
            try {
              const ranks = await fetchRanks({ studentId: p.studentId, bestScore: r.bestScore });
              update((s) => ({ ...s, ranks }));
            } catch (err) {
              console.error(err); // 순위 조회 실패는 저장 성공에 영향 없음
            }
          }
        } catch (err) {
          console.error(err);
          if (recordScore) update((s) => ({ ...s, status: 'error' }));
        }
      });
    },
    [applyCoins],
  );

  const handleGameOver = useCallback(
    (raw) => {
      const usedFloor = raw.startFloor || 0;
      // 부정 기록 검사는 "실제로 오른 칸(엘리베이터 시작 층 제외)"만 본다.
      const climbed = Math.max(0, raw.score - usedFloor);
      const plausible = isPlausibleScore(climbed, raw.elapsedMs);
      const r = { ...raw, score: clampScore(raw.score) };
      const earned = Number.isInteger(raw.coins) ? raw.coins : 0; // 이번 판에 오른 칸 = 코인
      const spent = elevatorCost(usedFloor); // 엘리베이터 비용

      saveToken.current += 1; // 진행 중인 이전 판 저장 결과가 이 화면을 덮어쓰지 않도록
      setBestBefore(best);
      setResult(r);
      setSave({
        status: !plausible ? 'rejected' : isFirebaseConfigured ? 'saving' : 'offline',
        serverBest: null,
        ranks: null,
        isNewBest: plausible && r.score > 0 && r.score > best,
      });
      // 코인을 즉시 로컬에 반영(오프라인 폴백/화면 표시). 서버 정산 후 서버 값으로 맞춰진다.
      applyCoins(profile.studentId, loadCoins(profile.studentId) + earned - spent);
      setScreen('over');
      if (plausible) saveLocalBest(profile.studentId, r.score);
      // 서버 정산: 코인은 항상, 점수는 정상 기록일 때만
      lastSettle.current = { p: profile, score: r.score, before: best, earned, spent, recordScore: plausible };
      if (isFirebaseConfigured) settle(profile, lastSettle.current);
    },
    [best, profile, applyCoins, settle],
  );

  const retrySettle = () => {
    if (lastSettle.current) settle(lastSettle.current.p, lastSettle.current);
  };

  const openRanking = (from) => {
    setRankingFrom(from);
    setScreen('ranking');
  };

  return (
    <div className="app">
      {screen === 'start' && (
        <StartScreen
          profile={profile}
          colorIndex={colorIndex}
          best={best}
          coins={coins}
          onColorChange={(i) => {
            setColorIndex(i);
            saveColorIndex(i);
          }}
          onStart={start}
          onRanking={() => openRanking('start')}
          onSwitchUser={() => {
            setProfile(null);
            saveProfile(null);
          }}
        />
      )}
      {screen === 'game' && profile && (
        <GameScreen
          key={round}
          colorIndex={colorIndex}
          best={best}
          startFloor={startFloor}
          onGameOver={handleGameOver}
          onQuit={() => setScreen('start')}
        />
      )}
      {screen === 'over' && profile && result && save && (
        <GameOver
          result={result}
          save={save}
          bestBefore={bestBefore}
          onRetrySave={retrySettle}
          onRetry={() => start(profile)}
          onRanking={() => openRanking('over')}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'ranking' && <Leaderboard profile={profile} onBack={() => setScreen(rankingFrom)} />}
    </div>
  );
}
