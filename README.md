# 끝없는 계단

1학년 정보 캐주얼 게임 시리즈 #6. 지그재그로 끝없이 이어지는 계단을 버튼 두 개로 올라가며 최고 기록을 겨루는 게임입니다.

- 요구사항: [docs/PRD.md](docs/PRD.md)
- 기술 스택: Vite + React, HTML5 Canvas, Firebase Firestore, Vercel

## 개발 방식

- 설계·구현: Claude Code
- 코드 리뷰: 각 PR 푸시마다 Codex(GitHub Action, `.github/workflows/codex-review.yml`)가 PR 댓글로 리뷰
  - 저장소 Secrets에 `OPENAI_API_KEY` 등록 필요
