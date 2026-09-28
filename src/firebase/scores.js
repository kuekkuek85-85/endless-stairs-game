import { getDb, isFirebaseConfigured } from './config.js';
import { MAX_SCORE, clampScore, classFromStudentId } from '../utils/validate.js';

export { isFirebaseConfigured, MAX_SCORE };

export const MAX_COINS = 1_000_000; // 코인 상한 (보안 규칙과 동일)

const COLLECTION = 'scores';
const firestore = () => import('firebase/firestore');

const clampCoins = (n) => Math.max(0, Math.min(MAX_COINS, Math.floor(n)));

// 게임 오버 시 한 번 호출: 서버 문서를 정산한다.
//  - 코인: 이번 판에 모은 코인(earnedCoins)을 더하고, 엘리베이터 비용(spentCoins)을 뺀다.
//  - recordScore=true 이면 playCount +1, 최고 기록/최초 달성 시각 갱신.
//    (부정 기록 등으로 false 이면 기록은 그대로 두고 코인만 정산)
// 코인은 서버에 저장되어 여러 기기에서 이어진다.
export async function saveScore({ studentId, name, score, earnedCoins = 0, spentCoins = 0, recordScore = true }) {
  const db = await getDb();
  const { doc, runTransaction, serverTimestamp } = await firestore();
  const ref = doc(db, COLLECTION, studentId);
  const safeScore = clampScore(score);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const prevBest = prev && Number.isInteger(prev.bestScore) ? prev.bestScore : 0;
    const prevCount = prev && Number.isInteger(prev.playCount) ? prev.playCount : 0;
    const prevCoins = prev && Number.isInteger(prev.coins) ? prev.coins : 0;

    const coins = clampCoins(prevCoins + earnedCoins - spentCoins);
    const isNewBest = recordScore && safeScore > prevBest;
    const bestScore = recordScore ? Math.max(prevBest, safeScore) : prevBest;
    const playCount = recordScore ? prevCount + 1 : prevCount;
    // 동점 시 먼저 달성한 사람이 위에 오도록, 최고 기록을 처음 세운 시각을 저장한다.
    // 최고 기록이 갱신될 때만 갱신하고, 그 외에는 기존 값을 유지(없던 예전 문서는 지금).
    const bestAt = !isNewBest && prev && prev.bestAt ? prev.bestAt : serverTimestamp();

    // 첫 문서(create)는 반드시 playCount>=1 이어야 하므로 최소 1로 만든다
    const finalCount = snap.exists() ? playCount : Math.max(1, playCount);

    tx.set(ref, {
      studentId,
      name,
      class: classFromStudentId(studentId),
      bestScore,
      bestAt,
      coins,
      playCount: finalCount,
      updatedAt: serverTimestamp(),
    });
    return { bestScore, playCount: finalCount, previousBest: prevBest, isNewBest, coins };
  });
}

export async function fetchMyRecord(studentId) {
  const db = await getDb();
  const { doc, getDoc } = await firestore();
  const snap = await getDoc(doc(db, COLLECTION, studentId));
  return snap.exists() ? snap.data() : null;
}

// 순위 = 나보다 최고 기록이 높은 학생 수 + 1 (동점은 같은 순위)
export async function fetchRanks({ studentId, bestScore }) {
  const db = await getDb();
  const { collection, query, where, getCountFromServer } = await firestore();
  const col = collection(db, COLLECTION);
  const cls = classFromStudentId(studentId);
  const [overall, inClass] = await Promise.all([
    getCountFromServer(query(col, where('bestScore', '>', bestScore))),
    getCountFromServer(query(col, where('class', '==', cls), where('bestScore', '>', bestScore))),
  ]);
  return { overall: overall.data().count + 1, inClass: inClass.data().count + 1, classNumber: cls };
}

// 랭킹 실시간 구독. classNumber 가 없으면 전체 TOP 30, 있으면 해당 반 TOP 10
// 반환값: 구독 해제 함수
export function subscribeLeaderboard({ classNumber = null }, onData, onError) {
  let unsub = null;
  let cancelled = false;

  Promise.all([getDb(), firestore()])
    .then(([db, { collection, query, where, orderBy, limit, onSnapshot }]) => {
      if (cancelled) return;
      const col = collection(db, COLLECTION);
      // 최고 기록 내림차순, 동점이면 먼저 달성한 사람(bestAt 오름차순)이 위
      const q =
        classNumber == null
          ? query(col, orderBy('bestScore', 'desc'), orderBy('bestAt', 'asc'), limit(30))
          : query(
              col,
              where('class', '==', classNumber),
              orderBy('bestScore', 'desc'),
              orderBy('bestAt', 'asc'),
              limit(10),
            );
      unsub = onSnapshot(
        q,
        (snap) => onData(snap.docs.map((d) => d.data())),
        (err) => onError?.(err),
      );
    })
    .catch((err) => {
      if (!cancelled) onError?.(err);
    });

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// 정렬된 기록에 순위를 매긴다 (동점은 같은 순위: 1, 2, 2, 4 ...)
export function withRanks(rows) {
  let rank = 0;
  let prevScore = null;
  return rows.map((row, i) => {
    if (row.bestScore !== prevScore) {
      rank = i + 1;
      prevScore = row.bestScore;
    }
    return { ...row, rank };
  });
}
