# 끝없는 계단

1학년 정보 캐주얼 게임 시리즈 #6. 지그재그로 끝없이 이어지는 계단을 버튼 두 개로 올라가며 최고 기록을 겨루는 게임입니다.

- 요구사항: [docs/PRD.md](docs/PRD.md)
- 기술 스택: Vite + React, HTML5 Canvas, Firebase Firestore, Vercel

## 조작

| | 방향 전환 | 오르기 | 일시정지 |
|---|---|---|---|
| 모바일·태블릿 | 하단 왼쪽 버튼 | 하단 오른쪽 버튼 | 우측 상단 ❚❚ |
| PC | `F` / `←` | `J` / `→` | `Space` |

## 개발

```bash
npm install
cp .env.example .env   # Firebase 값 입력 (없어도 게임은 동작, 랭킹만 비활성)
npm run dev
npm test               # 단위 테스트
npm run build
```

### Firestore 에뮬레이터 테스트 (보안 규칙 + 저장 로직)

Java(11 이상)가 필요합니다. firebase-tools 는 npx 로 자동 실행되며, CI 에서도 같은 테스트가 돕니다.

```bash
npm run test:emulator
```

## 폴더 구조

```
src/
  components/  StartScreen, GameScreen, GameOver, Leaderboard, ControlButtons, CharacterPreview
  game/        engine.js (계단 생성·판정·게이지), renderer.js (캔버스·카메라·배경), input.js (터치·키보드)
  firebase/    config.js, scores.js
  utils/       validate.js, sound.js, storage.js
firestore.rules, firestore.indexes.json
```

## 배포

1. **Firebase**: 프로젝트 생성 → Firestore 데이터베이스 생성 → 웹 앱 등록
   - 규칙·인덱스 반영: `firebase deploy --only firestore --project <프로젝트ID>`
   - 인덱스(반별 랭킹·반 순위용 `class` + `bestScore`)가 만들어질 때까지 몇 분 걸릴 수 있습니다.
2. **Vercel**: 저장소 Import → Framework `Vite` → Environment Variables 에 `.env.example` 의 `VITE_FIREBASE_*` 6개 등록 → Deploy

## 개발 방식

- 설계·구현: Claude Code
- 코드 리뷰: GitHub에 연결된 Codex 앱이 PR 생성 시 자동 리뷰 (추가 리뷰는 PR 댓글에 `@codex review`)
