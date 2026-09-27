// Firebase 설정값은 .env(VITE_ 접두어)에서 읽는다. 커밋하지 않는다.
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let dbPromise = null;

// Firebase SDK 는 크기가 커서 첫 로딩을 늦추지 않도록 필요할 때 동적으로 불러온다
export function getDb() {
  if (!isFirebaseConfigured) {
    return Promise.reject(new Error('FIREBASE_NOT_CONFIGURED'));
  }
  if (!dbPromise) {
    dbPromise = Promise.all([import('firebase/app'), import('firebase/firestore')])
      .then(([{ initializeApp }, { getFirestore, connectFirestoreEmulator }]) => {
        const db = getFirestore(initializeApp(firebaseConfig));
        // 로컬 개발·테스트용 에뮬레이터 (예: VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
        const emulator = env.VITE_FIRESTORE_EMULATOR_HOST;
        if (emulator) {
          const [host, port] = emulator.split(':');
          connectFirestoreEmulator(db, host, Number(port));
        }
        return db;
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}
