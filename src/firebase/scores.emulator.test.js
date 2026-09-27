// Firestore 에뮬레이터 통합 테스트 (보안 규칙 + 저장 로직)
// 실행: npm run test:emulator  (firebase-tools 와 Java 필요)
import { describe, expect, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from './config.js';
import { fetchRanks, saveScore, subscribeLeaderboard } from './scores.js';

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
    expect(snap.data().bestAt).toBeTruthy();
  });

  it('같은 최고 기록을 다시 쳐도 최초 달성 시각(bestAt)은 유지', async () => {
    const id = '10105';
    await saveScore({ studentId: id, name: '한결', score: 40 });
    const first = (await getDoc(doc(await getDb(), 'scores', id))).data().bestAt;
    await saveScore({ studentId: id, name: '한결', score: 40 }); // 동점 재달성
    const second = (await getDoc(doc(await getDb(), 'scores', id))).data().bestAt;
    expect(second.isEqual(first)).toBe(true);
    await saveScore({ studentId: id, name: '한결', score: 55 }); // 최고 기록 갱신
    const third = (await getDoc(doc(await getDb(), 'scores', id))).data().bestAt;
    expect(third.toMillis()).toBeGreaterThan(first.toMillis());
  });

  it('동점이면 먼저 달성한 사람이 랭킹에서 위', async () => {
    await saveScore({ studentId: '10110', name: '먼저', score: 70 });
    await new Promise((r) => setTimeout(r, 30));
    await saveScore({ studentId: '10111', name: '나중', score: 70 });
    await saveScore({ studentId: '10111', name: '나중', score: 70 }); // 재달성해도 순서 불변
    const rows = await new Promise((resolve, reject) => {
      let unsub;
      unsub = subscribeLeaderboard(
        { classNumber: null },
        (data) => {
          // 두 문서가 모두 반영된 스냅샷을 기다린다
          if (data.some((r) => r.studentId === '10111')) {
            if (unsub) unsub();
            resolve(data);
          }
        },
        reject,
      );
    });
    const tied = rows.filter((r) => r.bestScore === 70).map((r) => r.studentId);
    expect(tied).toContain('10110');
    expect(tied).toContain('10111');
    expect(tied.indexOf('10110')).toBeLessThan(tied.indexOf('10111'));
  });

  it('전체·반 순위', async () => {
    // 7반에서만 검증 (다른 테스트의 1반 데이터와 격리)
    await saveScore({ studentId: '10701', name: '이둘', score: 45 });
    await saveScore({ studentId: '10702', name: '박셋', score: 100 });
    await saveScore({ studentId: '10703', name: '최다', score: 200 });
    const ranks = await fetchRanks({ studentId: '10701', bestScore: 45 });
    expect(ranks.inClass).toBe(3); // 7반에서 100·200 이 위 → 3위
    expect(ranks.classNumber).toBe(7);
    expect(ranks.overall).toBeGreaterThanOrEqual(3);
  });

  it('보안 규칙: 잘못된 형식·조작·삭제 거부', async () => {
    const db = await getDb();
    const base = { studentId: '10301', name: '최넷', class: 3, bestScore: 10, playCount: 1, bestAt: serverTimestamp() };
    const ref = doc(db, 'scores', '10301');

    // bestAt 이 없거나 타입이 틀리면 거부
    await expectDenied(
      setDoc(ref, { studentId: '10301', name: '최넷', class: 3, bestScore: 10, playCount: 1, updatedAt: serverTimestamp() }),
    );
    await expectDenied(setDoc(ref, { ...base, bestAt: 123, updatedAt: serverTimestamp() }));

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
    // 최고 기록을 올리면서 bestAt 을 갱신하지 않으면 거부
    await expectDenied(updateDoc(ref, { playCount: 2, bestScore: 20, updatedAt: serverTimestamp() }));
    // 최고 기록이 그대로인데 bestAt 을 바꾸면 거부
    await expectDenied(
      updateDoc(ref, { playCount: 2, bestScore: 10, bestAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
    // 최고 기록 갱신 + bestAt 갱신은 허용
    await updateDoc(ref, { playCount: 2, bestScore: 20, bestAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await expectDenied(deleteDoc(ref));
  });
});
