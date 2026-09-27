import { useState } from 'react';
import GameScreen from './components/GameScreen.jsx';

// 임시 연결: 시작/게임 오버/랭킹 화면은 다음 단계에서 추가
export default function App() {
  const [round, setRound] = useState(0);
  const [best, setBest] = useState(0);

  return (
    <div className="app">
      <GameScreen
        key={round}
        colorIndex={0}
        best={best}
        onGameOver={({ score }) => {
          setBest((b) => Math.max(b, score));
          setTimeout(() => setRound((r) => r + 1), 800);
        }}
        onQuit={() => setRound((r) => r + 1)}
      />
    </div>
  );
}
