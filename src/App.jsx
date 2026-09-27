import { useCallback, useRef, useState } from 'react';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import GameOver from './components/GameOver.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import { fetchMyRecord, fetchRanks, isFirebaseConfigured, saveScore } from './firebase/scores.js';
import {
  loadColorIndex,
  loadLocalBest,
  loadProfile,
  saveColorIndex,
  saveLocalBest,
  saveProfile,
} from './utils/storage.js';
import { clampScore, isPlausibleScore } from './utils/validate.js';
import { CHARACTER_COLORS } from './game/renderer.js';

export default function App() {
  const [screen, setScreen] = useState('start'); // start | game | over | ranking
  const [rankingFrom, setRankingFrom] = useState('start');
  const [profile, setProfile] = useState(loadProfile);
  const [colorIndex, setColorIndex] = useState(() => Math.min(loadColorIndex(), CHARACTER_COLORS.length - 1));
  const [remoteBest, setRemoteBest] = useState(0);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const [bestBefore, setBestBefore] = useState(0);
  const [save, setSave] = useState(null);
  const remoteLoadedFor = useRef(null);
  const saveChain = useRef(Promise.resolve());
  const saveToken = useRef(0);

  const best = profile ? Math.max(loadLocalBest(profile.studentId), remoteBest) : 0;

  const start = (p) => {
    if (remoteLoadedFor.current !== p.studentId) {
      setRemoteBest(0);
      remoteLoadedFor.current = p.studentId;
      // 다른 기기에서 세운 최고 기록도 HUD 에 보이도록 (실패해도 게임은 진행)
      if (isFirebaseConfigured) {
        fetchMyRecord(p.studentId)
          .then((rec) => {
            if (rec && Number.isInteger(rec.bestScore) && remoteLoadedFor.current === p.studentId) {
              setRemoteBest((b) => Math.max(b, rec.bestScore));
            }
          })
          .catch(() => {});
      }
    }
    setProfile(p);
    saveProfile(p);
    setRound((r) => r + 1);
    setScreen('game');
  };

  // Firestore 저장: 게임 오버 순간 / [다시 시도] 때만 호출 (화면 이동으로 중복 저장되지 않음)
  // 빠르게 연달아 플레이해도 저장은 순서대로 하나씩, 화면에는 가장 최근 판의 결과만 반영
  const persist = useCallback((p, score, before) => {
    const token = ++saveToken.current;
    const update = (fn) => {
      if (saveToken.current === token) setSave(fn);
    };
    update((s) => ({ ...s, status: 'saving' }));
    saveChain.current = saveChain.current.then(async () => {
      try {
        const r = await saveScore({ studentId: p.studentId, name: p.name, score });
        // 저장이 끝나기 전에 다른 학생으로 바뀌었다면 그 학생의 최고 기록에 섞지 않는다
        if (remoteLoadedFor.current === p.studentId) setRemoteBest((b) => Math.max(b, r.bestScore));
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
      } catch (err) {
        console.error(err);
        update((s) => ({ ...s, status: 'error' }));
      }
    });
  }, []);

  const handleGameOver = useCallback(
    (raw) => {
      // 부정 기록 검사는 실제 점수로, 이후 화면·로컬·서버에는 같은 상한을 적용한 점수를 쓴다
      const plausible = isPlausibleScore(raw.score, raw.elapsedMs);
      const r = { ...raw, score: clampScore(raw.score) };
      saveToken.current += 1; // 진행 중인 이전 판 저장 결과가 이 화면을 덮어쓰지 않도록
      setBestBefore(best);
      setResult(r);
      setSave({
        status: !plausible ? 'rejected' : isFirebaseConfigured ? 'saving' : 'offline',
        serverBest: null,
        ranks: null,
        isNewBest: plausible && r.score > 0 && r.score > best,
      });
      setScreen('over');
      if (!plausible) return;
      saveLocalBest(profile.studentId, r.score);
      if (isFirebaseConfigured) persist(profile, r.score, best);
    },
    [best, profile, persist],
  );

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
          onColorChange={(i) => {
            setColorIndex(i);
            saveColorIndex(i);
          }}
          onStart={start}
          onRanking={() => openRanking('start')}
          onSwitchUser={() => {
            setProfile(null);
            saveProfile(null);
            setRemoteBest(0);
            remoteLoadedFor.current = null;
          }}
        />
      )}
      {screen === 'game' && profile && (
        <GameScreen
          key={round}
          colorIndex={colorIndex}
          best={best}
          onGameOver={handleGameOver}
          onQuit={() => setScreen('start')}
        />
      )}
      {screen === 'over' && profile && result && save && (
        <GameOver
          result={result}
          save={save}
          bestBefore={bestBefore}
          onRetrySave={() => persist(profile, result.score, bestBefore)}
          onRetry={() => start(profile)}
          onRanking={() => openRanking('over')}
          onHome={() => setScreen('start')}
        />
      )}
      {screen === 'ranking' && <Leaderboard profile={profile} onBack={() => setScreen(rankingFrom)} />}
    </div>
  );
}
