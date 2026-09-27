import { getDb, isFirebaseConfigured } from './config.js';
import { classFromStudentId } from '../utils/validate.js';

export { isFirebaseConfigured };

const COLLECTION = 'scores';
export const MAX_SCORE = 3000;

const firestore = () => import('firebase/firestore');

// 학생별 문서 1개를 갱신: playCount +1, 최고 기록을 넘었을 때만 bestScore 갱신
export async function saveScore({ studentId, name, score }) {
  const db = await getDb();
  const { doc, runTransaction, serverTimestamp } = await firestore();
  const ref = doc(db, COLLECTION, studentId);
  const safeScore = Math.max(0, Math.min(MAX_SCORE, Math.floor(score)));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const prevBest = prev && Number.isInteger(prev.bestScore) ? prev.bestScore : 0;
    const prevCount = prev && Number.isInteger(prev.playCount) ? prev.playCount : 0;
    const bestScore = Math.max(prevBest, safeScore);
    const playCount = prevCount + 1;
    tx.set(ref, {
      studentId,
      name,
      class: classFromStudentId(studentId),
      bestScore,
      playCount,
      updatedAt: serverTimestamp(),
    });
    return { bestScore, playCount, previousBest: prevBest, isNewBest: safeScore > prevBest };
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
      const q =
        classNumber == null
          ? query(col, orderBy('bestScore', 'desc'), limit(30))
          : query(col, where('class', '==', classNumber), orderBy('bestScore', 'desc'), limit(10));
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
