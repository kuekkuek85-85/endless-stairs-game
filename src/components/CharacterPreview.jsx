import { useEffect, useRef } from 'react';
import { CHARACTER_COLORS, drawCharacter } from '../game/renderer.js';

// 시작 화면의 캐릭터 대기 애니메이션 (통통 튀며 두리번거림)
export default function CharacterPreview({ colorIndex, size = 140 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const color = CHARACTER_COLORS[colorIndex] ?? CHARACTER_COLORS[0];
    let raf = 0;
    const start = performance.now();

    const frame = (now) => {
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const bounce = Math.abs(Math.sin(t * 3)) * size * 0.08;
      const squash = Math.max(0, 0.5 - Math.abs(Math.sin(t * 3))) * 0.8;
      const facing = Math.sin(t * 0.8) > 0 ? 1 : -1;
      const blink = t % 2.6 < 0.12;
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(size / 2, size * 0.9, size * 0.22 - bounce * 0.3, size * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      drawCharacter(ctx, size / 2, size * 0.9 - bounce, size * 0.27, color, facing, {
        squash,
        blink,
        legPhase: t * 6,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [colorIndex, size]);

  return <canvas ref={ref} className="preview-canvas" style={{ width: size, height: size }} aria-hidden="true" />;
}
