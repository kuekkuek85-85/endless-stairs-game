import { useEffect, useState } from 'react';
import CharacterPreview from './CharacterPreview.jsx';
import { CHARACTER_COLORS, CHARACTER_COLOR_NAMES } from '../game/renderer.js';
import { elevatorCost, elevatorFloors } from '../game/engine.js';
import { validateName, validateStudentId } from '../utils/validate.js';
import { fetchMyRecord, isFirebaseConfigured } from '../firebase/scores.js';
import { loadCoins, loadLocalBest, saveCoins, saveLocalBest } from '../utils/storage.js';
import { isMuted, setMuted, unlockAudio } from '../utils/sound.js';

export default function StartScreen({ profile, colorIndex, best = 0, coins: coinsProp = 0, onColorChange, onStart, onRanking, onSwitchUser }) {
  const [studentId, setStudentId] = useState(profile?.studentId ?? '');
  const [name, setName] = useState(profile?.name ?? '');
  const [errors, setErrors] = useState({});
  const [muted, setMutedUi] = useState(isMuted());
  const [elevatorFloor, setElevatorFloor] = useState(0); // 0 = 처음부터(1층)
  const [remote, setRemote] = useState(null); // 입력한 학번의 서버 기록 { studentId, best, coins }

  const typed = validateStudentId(studentId);

  // 학번을 입력하면 그 학번의 서버 기록(코인·최고 기록)을 불러온다 → 다른 기기에서도 이어짐.
  // 불러온 값은 로컬 캐시에도 저장해 게임 시작 시 엘리베이터 결제 판정과 일치시킨다.
  useEffect(() => {
    if (!isFirebaseConfigured || !typed.ok) {
      setRemote(null);
      return undefined;
    }
    const id = typed.value;
    let cancelled = false;
    fetchMyRecord(id)
      .then((rec) => {
        if (cancelled || !rec) return;
        const coins = Number.isInteger(rec.coins) ? rec.coins : 0;
        const b = Number.isInteger(rec.bestScore) ? rec.bestScore : 0;
        saveCoins(id, coins);
        saveLocalBest(id, b);
        setRemote({ studentId: id, coins, best: b });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [typed.ok, typed.value]);

  const isCurrent = typed.ok && typed.value === profile?.studentId;
  const remoteForTyped = remote && typed.ok && remote.studentId === typed.value ? remote : null;
  const effectiveBest = Math.max(best, typed.ok ? loadLocalBest(typed.value) : 0, remoteForTyped?.best ?? 0);
  const coins = remoteForTyped ? remoteForTyped.coins : isCurrent ? coinsProp : typed.ok ? loadCoins(typed.value) : 0;
  const floors = elevatorFloors(effectiveBest); // 이용 가능한 엘리베이터 시작 층 (200,400,...)
  const canAfford = (floor) => coins >= elevatorCost(floor);
  // 선택한 층이 더 이상 이용 불가·코인 부족이면 처음부터로 되돌린다
  const selectedFloor = elevatorFloor > 0 && floors.includes(elevatorFloor) && canAfford(elevatorFloor) ? elevatorFloor : 0;

  const submit = (e) => {
    e.preventDefault();
    const id = validateStudentId(studentId);
    const nm = validateName(name);
    if (!id.ok || !nm.ok) {
      setErrors({ studentId: id.ok ? null : id.message, name: nm.ok ? null : nm.message });
      return;
    }
    setErrors({});
    unlockAudio(); // 사용자 제스처 안에서 오디오 잠금 해제
    onStart({ studentId: id.value, name: nm.value }, selectedFloor);
  };

  const switchUser = () => {
    setStudentId('');
    setName('');
    setErrors({});
    onSwitchUser();
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedUi(!muted);
  };

  return (
    <main className="screen scroll">
      <h1 className="title">끝없는 계단</h1>
      <CharacterPreview colorIndex={colorIndex} />

      <div className="colors" role="radiogroup" aria-label="캐릭터 색상">
        {CHARACTER_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={i === colorIndex}
            aria-label={CHARACTER_COLOR_NAMES[i]}
            className={`color-dot${i === colorIndex ? ' selected' : ''}`}
            style={{ background: c }}
            onClick={() => onColorChange(i)}
          />
        ))}
      </div>

      <form className="card" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="studentId">학번 (5자리)</label>
          <input
            id="studentId"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            placeholder="예: 10305"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.replace(/\D/g, '').slice(0, 5))}
            aria-invalid={Boolean(errors.studentId)}
          />
          {errors.studentId && <p className="error">{errors.studentId}</p>}
        </div>
        <div className="field">
          <label htmlFor="name">성명</label>
          <input
            id="name"
            autoComplete="off"
            maxLength={10}
            placeholder="예: 홍길동"
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <p className="error">{errors.name}</p>}
        </div>

        {/* 학번을 입력하면(로그인) 그 계정의 누적 코인을 항상 보여 준다 */}
        {typed.ok && (
          <div className="coin-balance">
            <span>🪙 보유 코인</span>
            <b>{coins}</b>
          </div>
        )}

        {floors.length > 0 && (
          <div className="elevator">
            <div className="elevator-head">
              <span>🛗 엘리베이터</span>
            </div>
            <div className="elevator-floors">
              <button
                type="button"
                className={`floor-chip${selectedFloor === 0 ? ' selected' : ''}`}
                onClick={() => setElevatorFloor(0)}
              >
                처음부터
              </button>
              {floors.map((f) => {
                const cost = elevatorCost(f);
                const afford = canAfford(f);
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={!afford}
                    aria-pressed={selectedFloor === f}
                    className={`floor-chip${selectedFloor === f ? ' selected' : ''}`}
                    onClick={() => setElevatorFloor(f)}
                  >
                    {f}층<span className="cost">🪙{cost}</span>
                  </button>
                );
              })}
            </div>
            <p className="hint" style={{ margin: '2px 0 0', textAlign: 'left' }}>
              계단을 오르면 1칸당 코인 1개. 엘리베이터로 그 층부터 시작할 수 있어요(코인 소모).
            </p>
          </div>
        )}

        <button type="submit" className="btn" style={{ width: '100%' }}>
          게임 시작
        </button>
        <div className="row-between" style={{ marginTop: 10 }}>
          {profile ? (
            <button type="button" className="link-btn" onClick={switchUser}>
              다른 사람으로 하기
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn secondary small" onClick={toggleMute}>
            {muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}
          </button>
        </div>
      </form>

      <button type="button" className="btn secondary" onClick={onRanking}>
        🏆 랭킹 보기
      </button>

      <p className="hint">
        왼쪽 <b>[방향 전환]</b>은 몸을 돌려 한 칸, 오른쪽 <b>[오르기]</b>는 보는 방향으로 한 칸!
        <br />
        PC: F·← 방향 전환 / J·→ 오르기 / 스페이스 일시정지
      </p>
    </main>
  );
}
