// Firestore 에뮬레이터 통합 테스트 (보안 규칙 + 저장 로직)
// 실행: npm run test:emulator  (firebase-tools 와 Java 필요)
import { describe, expect, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from './config.js';
import { fetchRanks, saveScore } from './scores.js';

const enabled = Boolean(import.meta.env.VITE_FIRESTORE_EMULATOR_HOST);

async function expectDenied(promise) {
  await expect(promise).rejects.toMatchObject({ code: 'permission-denied' });
}

describe.skipIf(!enabled)('Firestore 에뮬레이터', () => {
  it('첫 판은 문서 생성, 이후 playCount +1, 최고 기록만 갱신', async () => {
    const id = '10101';
    let r = await saveScore({ studentId: id, name: '김하나', score: 30 });
    expect(r).toMatchObject({ bestScore: 30, playCount: 1, isNewBest: true });
    r = await saveScore({ studentId: id, name: '김하나', score: 12 });
    expect(r).toMatchObject({ bestScore: 30, playCount: 2, isNewBest: false });
    r = await saveScore({ studentId: id, name: '김하나', score: 45 });
    expect(r).toMatchObject({ bestScore: 45, playCount: 3, isNewBest: true, previousBest: 30 });

    const snap = await getDoc(doc(await getDb(), 'scores', id));
    expect(snap.data()).toMatchObject({ studentId: id, name: '김하나', class: 1, bestScore: 45, playCount: 3 });
  });

  it('전체·반 순위', async () => {
    await saveScore({ studentId: '10102', name: '이둘', score: 100 });
    await saveScore({ studentId: '10201', name: '박셋', score: 200 });
    const ranks = await fetchRanks({ studentId: '10101', bestScore: 45 });
    expect(ranks.overall).toBeGreaterThanOrEqual(3);
    expect(ranks.inClass).toBe(2);
    expect(ranks.classNumber).toBe(1);
  });

  it('보안 규칙: 잘못된 형식·조작·삭제 거부', async () => {
    const db = await getDb();
    const base = { studentId: '10301', name: '최넷', class: 3, bestScore: 10, playCount: 1 };
    const ref = doc(db, 'scores', '10301');

    await expectDenied(setDoc(ref, { ...base, bestScore: 3001, updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(ref, { ...base, bestScore: 10.5, updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(ref, { ...base, name: '가나다라마바사아자차카', updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(ref, { ...base, playCount: 5, updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(ref, { ...base, extra: 1, updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(doc(db, 'scores', 'abcde'), { ...base, studentId: 'abcde', updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(ref, { ...base, studentId: '10302', updatedAt: serverTimestamp() }));
    // 학번 범위 밖(학년·반·번호)과 학번과 다른 반은 거부
    for (const bad of ['99999', '20301', '11601', '10300', '10341']) {
      await expectDenied(
        setDoc(doc(db, 'scores', bad), { ...base, studentId: bad, updatedAt: serverTimestamp() }),
      );
    }
    await expectDenied(setDoc(ref, { ...base, class: 15, updatedAt: serverTimestamp() }));
    await expectDenied(setDoc(ref, { ...base, class: 30, updatedAt: serverTimestamp() }));
    // 두 자리 반도 학번에서 올바르게 파생되면 허용
    await setDoc(doc(db, 'scores', '11501'), {
      ...base,
      studentId: '11501',
      class: 15,
      updatedAt: serverTimestamp(),
    });

    await setDoc(ref, { ...base, updatedAt: serverTimestamp() });
    // playCount 를 건너뛰거나 bestScore 를 낮추거나 반을 바꿀 수 없음
    await expectDenied(updateDoc(ref, { playCount: 3, updatedAt: serverTimestamp() }));
    await expectDenied(updateDoc(ref, { playCount: 2, bestScore: 5, updatedAt: serverTimestamp() }));
    await expectDenied(updateDoc(ref, { playCount: 2, class: 4, updatedAt: serverTimestamp() }));
    await updateDoc(ref, { playCount: 2, bestScore: 20, updatedAt: serverTimestamp() });
    await expectDenied(deleteDoc(ref));
  });
});
