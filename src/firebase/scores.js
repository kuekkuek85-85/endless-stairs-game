import { getDb, isFirebaseConfigured } from './config.js';
import { MAX_SCORE, clampScore, classFromStudentId } from '../utils/validate.js';

export { isFirebaseConfigured, MAX_SCORE };

const COLLECTION = 'scores';
const firestore = () => import('firebase/firestore');

// 학생별 문서 1개를 갱신: playCount +1, 최고 기록을 넘었을 때만 bestScore 갱신
export async function saveScore({ studentId, name, score }) {
  const db = await getDb();
  const { doc, runTransaction, serverTimestamp } = await firestore();
  const ref = doc(db, COLLECTION, studentId);
  const safeScore = clampScore(score);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const prevBest = prev && Number.isInteger(prev.bestScore) ? prev.bestScore : 0;
    const prevCount = prev && Number.isInteger(prev.playCount) ? prev.playCount : 0;
    const bestScore = Math.max(prevBest, safeScore);
    const playCount = prevCount + 1;
    const isNewBest = safeScore > prevBest;
    // 동점 시 먼저 달성한 사람이 위에 오도록, 최고 기록을 처음 세운 시각을 저장한다.
    // 최고 기록이 갱신될 때만 갱신하고, 같은 최고 기록을 다시 쳐도 최초 달성 시각을 유지한다.
    const bestAt = !isNewBest && prev && prev.bestAt ? prev.bestAt : serverTimestamp();
    tx.set(ref, {
      studentId,
      name,
      class: classFromStudentId(studentId),
      bestScore,
      bestAt,
      playCount,
      updatedAt: serverTimestamp(),
    });
    return { bestScore, playCount, previousBest: prevBest, isNewBest };
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
