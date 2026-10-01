// 캔버스 렌더링 (계단·캐릭터·카메라·배경·HUD). 게임 상태를 읽기만 하고 바꾸지 않는다.
import { GAUGE_WARNING, getStair, FALL_DURATION } from './engine.js';

export const CHARACTER_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ec4899', '#a855f7'];
export const CHARACTER_COLOR_NAMES = ['주황', '파랑', '초록', '분홍', '보라'];

const VISIBLE_AHEAD = 14; // 캐릭터 위로 보이는 계단 수 (PRD: 최소 12칸)
const CAMERA_ANCHOR = 2 / 3; // 캐릭터가 화면 위에서 2/3 = 아래쪽 1/3 지점
const HOP_TIME = 0.09;
const POPUP_TIME = 1.2;
const TRANSITION = 30; // 배경이 바뀌는 데 걸리는 계단 수

// 높이에 따른 배경 테마: 운동장 → 하늘·구름 → 노을 → 우주
const THEMES = [
  { at: 0, top: '#7ec8f0', bottom: '#dff4ff', stair: '#b8703f', edge: '#e8a064', cloud: 0.9, star: 0, sun: 0 },
  { at: 100, top: '#2f8fe0', bottom: '#b5e2ff', stair: '#5b6bd6', edge: '#98a4ff', cloud: 1, star: 0, sun: 0 },
  { at: 300, top: '#3b2a6b', bottom: '#ff9a5a', stair: '#7a3b5e', edge: '#d77a96', cloud: 0.55, star: 0.25, sun: 1 },
  { at: 500, top: '#04041a', bottom: '#1d1552', stair: '#363c78', edge: '#7c88ff', cloud: 0, star: 1, sun: 0 },
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const THEME_RGB = THEMES.map((t) => ({
  ...t,
  top: hexToRgb(t.top),
  bottom: hexToRgb(t.bottom),
  stair: hexToRgb(t.stair),
  edge: hexToRgb(t.edge),
}));

const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function themeAt(height) {
  let cur = THEME_RGB[0];
  for (let i = 1; i < THEME_RGB.length; i++) {
    const next = THEME_RGB[i];
    const t = clamp01((height - (next.at - TRANSITION)) / TRANSITION);
    if (t <= 0) break;
    cur = {
      top: mixRgb(cur.top, next.top, t),
      bottom: mixRgb(cur.bottom, next.bottom, t),
      stair: mixRgb(cur.stair, next.stair, t),
      edge: mixRgb(cur.edge, next.edge, t),
      cloud: lerp(cur.cloud, next.cloud, t),
      star: lerp(cur.star, next.star, t),
      sun: lerp(cur.sun, next.sun, t),
    };
  }
  return cur;
}

// 0~1 사이의 결정적 해시 (구름 위치 등)
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function shade(hex, amount) {
  const c = hexToRgb(hex);
  const target = amount < 0 ? 0 : 255;
  return rgb(mixRgb(c, [target, target, target], Math.abs(amount)));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 오리지널 캐릭터: 동그란 몸통 + 눈 + 짧은 다리
// (x, y) = 발바닥 중앙, r = 몸통 반지름
export function drawCharacter(ctx, x, y, r, color, facing, opts = {}) {
  const { rotation = 0, squash = 0, legPhase = 0, blink = false } = opts;
  const legLen = r * 0.45;
  ctx.save();
  ctx.translate(x, y - legLen - r);
  if (rotation) ctx.rotate(rotation);

  // 다리
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  const legSpread = r * 0.38;
  const swing = Math.sin(legPhase) * r * 0.15;
  ctx.beginPath();
  ctx.moveTo(-legSpread, r * 0.7);
  ctx.lineTo(-legSpread - swing, r + legLen * 0.85);
  ctx.moveTo(legSpread, r * 0.7);
  ctx.lineTo(legSpread + swing, r + legLen * 0.85);
  ctx.stroke();

  // 몸통
  ctx.save();
  ctx.scale(1 + squash * 0.12, 1 - squash * 0.12);
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 광택
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 눈 (바라보는 방향으로 치우침)
  const eyeShift = facing * r * 0.28;
  const eyeY = -r * 0.12;
  for (const ex of [-r * 0.3, r * 0.3]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (blink) ctx.ellipse(ex + eyeShift, eyeY, r * 0.2, r * 0.04, 0, 0, Math.PI * 2);
    else ctx.ellipse(ex + eyeShift, eyeY, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!blink) {
      ctx.fillStyle = '#1f2a44';
      ctx.beginPath();
      ctx.arc(ex + eyeShift + facing * r * 0.07, eyeY + r * 0.03, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 볼
  ctx.fillStyle = 'rgba(255,120,140,0.45)';
  ctx.beginPath();
  ctx.ellipse(eyeShift + facing * r * 0.45, r * 0.25, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function createRenderer(canvas, { color = CHARACTER_COLORS[0] } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;

  // 화면 표현 상태 (게임 로직과 별개)
  const view = {
    initialized: false,
    camX: 0,
    camY: 0,
    charX: 0,
    charY: 0,
    hopT: HOP_TIME,
    shake: 0,
    time: 0,
    popups: [],
    fallFromX: 0,
    fallFromY: 0,
  };

  const stars = Array.from({ length: 90 }, (_, i) => ({
    u: hash(i + 1),
    v: hash(i + 101),
    size: 0.6 + hash(i + 201) * 1.6,
    phase: hash(i + 301) * Math.PI * 2,
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    // 저사양 기기 부담을 줄이기 위해 픽셀 비율 상한 2
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function metrics() {
    const unitY = (h * CAMERA_ANCHOR) / (VISIBLE_AHEAD + 0.5);
    const unitX = Math.min(w / 11, unitY * 1.4);
    return { unitX, unitY, anchorY: h * CAMERA_ANCHOR };
  }

  function onEvents(events, game) {
    for (const e of events) {
      if (e === 'climb' || e === 'turn') view.hopT = 0;
      // 빠르게 오를 때 이전 팝업과 겹치지 않도록 최신 것만 보여 준다
      else if (e === 'milestone') view.popups = [{ text: `${game.score}!`, t: 0 }];
      else if (e === 'fall' || e === 'timeout') {
        view.shake = 1;
        view.fallFromX = view.charX;
        view.fallFromY = view.charY;
      }
    }
  }

  function drawBackground(theme, m) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(theme.top));
    g.addColorStop(1, rgb(theme.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 별 (우주)
    if (theme.star > 0.01) {
      for (const s of stars) {
        const y = (((s.v * h + view.camY * m.unitY * 0.08) % h) + h) % h;
        const tw = 0.6 + 0.4 * Math.sin(view.time * 2 + s.phase);
        ctx.fillStyle = `rgba(255,255,255,${theme.star * tw})`;
        ctx.fillRect(s.u * w, y, s.size, s.size);
      }
    }

    // 노을 해
    if (theme.sun > 0.01) {
      const sx = w * 0.72;
      const sy = h * 0.78;
      const sr = Math.min(w, h) * 0.16;
      const sg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.2);
      sg.addColorStop(0, `rgba(255,220,120,${theme.sun})`);
      sg.addColorStop(0.45, `rgba(255,150,80,${theme.sun * 0.5})`);
      sg.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(255,214,120,${theme.sun})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 구름 (카메라보다 느리게 움직이는 원경)
    if (theme.cloud > 0.01) {
      const px = 0.3;
      const py = 0.5;
      const spacing = 3.5;
      const pc = view.camY * py;
      const jMin = Math.floor((pc - (h - m.anchorY) / m.unitY - 2) / spacing);
      const jMax = Math.ceil((pc + m.anchorY / m.unitY + 2) / spacing);
      ctx.fillStyle = `rgba(255,255,255,${0.85 * theme.cloud})`;
      for (let j = Math.max(1, jMin); j <= jMax; j++) {
        const cx = w / 2 + ((hash(j) - 0.5) * 18 - view.camX * px) * m.unitX;
        const cy = m.anchorY - (j * spacing - pc) * m.unitY;
        const s = m.unitX * (0.9 + hash(j + 50) * 0.9);
        ctx.beginPath();
        ctx.arc(cx, cy, s, 0, Math.PI * 2);
        ctx.arc(cx + s * 0.9, cy + s * 0.2, s * 0.75, 0, Math.PI * 2);
        ctx.arc(cx - s * 0.9, cy + s * 0.25, s * 0.65, 0, Math.PI * 2);
        ctx.arc(cx + s * 0.2, cy - s * 0.5, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 학교 운동장 (시작 지점 아래, 올라가면 화면 밖으로 사라짐)
  function drawGround(m, toScreen) {
    const groundTop = toScreen(0, -0.35)[1];
    if (groundTop > h + 5) return;

    // 학교 건물
    const [bx, by] = toScreen(-9, -0.35);
    const bw = m.unitX * 6;
    const bh = m.unitY * 5.2;
    ctx.fillStyle = '#f4e3c3';
    ctx.fillRect(bx, by - bh, bw, bh);
    ctx.fillStyle = '#d9694a';
    ctx.fillRect(bx - m.unitX * 0.3, by - bh - m.unitY * 0.5, bw + m.unitX * 0.6, m.unitY * 0.6);
    ctx.fillStyle = '#9fd3f5';
    const winW = bw / 7;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(bx + winW * (1 + c * 2), by - bh + m.unitY * (0.7 + r * 1.5), winW, m.unitY * 0.8);
      }
    }
    // 시계
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx + bw / 2, by - bh - m.unitY * 0.1, m.unitY * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // 운동장
    ctx.fillStyle = '#5cbf5a';
    ctx.fillRect(0, groundTop, w, h - groundTop + 10);
    ctx.fillStyle = '#d98b5f';
    ctx.fillRect(0, groundTop + m.unitY * 0.6, w, m.unitY * 1.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    for (let k = 1; k < 3; k++) {
      const ly = groundTop + m.unitY * (0.6 + k * 0.47);
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(w, ly);
      ctx.stroke();
    }

    // 나무
    for (const tx of [4, 7.5, -12]) {
      const [x, y] = toScreen(tx, -0.35);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x - m.unitX * 0.12, y - m.unitY * 1.2, m.unitX * 0.24, m.unitY * 1.2);
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.arc(x, y - m.unitY * 1.6, m.unitX * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStairs(game, theme, m, toScreen) {
    const sw = m.unitX * 1.32; // 벽돌 폭 (살짝 더 크게)
    const sh = m.unitY * 0.64; // 벽돌 높이 (살짝 더 두껍게)
    const from = Math.max(game.base, game.pos - 10);
    const to = Math.min(game.base + game.stairs.length - 1, game.pos + VISIBLE_AHEAD + 4);
    const top = rgb(theme.edge);
    const body = rgb(theme.stair);
    for (let i = from; i <= to; i++) {
      const s = getStair(game, i);
      const [x, y] = toScreen(s.x, s.y);
      if (y < -sh || y > h + sh) continue;
      ctx.fillStyle = body;
      roundRect(ctx, x - sw / 2, y, sw, sh, Math.min(6, sh * 0.3));
      ctx.fill();
      ctx.fillStyle = top;
      ctx.fillRect(x - sw / 2 + 2, y, sw - 4, Math.max(3, sh * 0.28));
    }
  }

  function drawGauge(game) {
    const x = 16;
    const y = 12;
    const bw = w - 32;
    const bh = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, x, y, bw, bh, bh / 2);
    ctx.fill();
    const g = game.gauge;
    let color = '#22c55e';
    let alpha = 1;
    if (g <= GAUGE_WARNING) {
      color = '#ef4444';
      // 30% 이하: 빨간색으로 깜빡임
      alpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(view.time * 18));
    } else if (g <= 0.6) color = '#facc15';
    if (g > 0) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      roundRect(ctx, x + 2, y + 2, Math.max(bh - 4, (bw - 4) * g), bh - 4, (bh - 4) / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function outlinedText(text, x, y, size, fill = '#fff', align = 'center') {
    ctx.font = `900 ${size}px system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeStyle = 'rgba(20,24,48,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawHud(game, best) {
    drawGauge(game);
    outlinedText(`BEST ${Math.max(best, game.score)}`, 16, 46, 15, '#fde68a', 'left');
    const scoreSize = Math.min(72, w * 0.17);
    outlinedText(String(game.score), w / 2, 42 + scoreSize * 0.6, scoreSize);

    if (game.status === 'ready') {
      const pulse = 0.6 + 0.4 * Math.sin(view.time * 5);
      ctx.globalAlpha = pulse;
      outlinedText('버튼을 눌러 출발!', w / 2, h * 0.84, Math.min(26, w * 0.065));
      ctx.globalAlpha = 1;
    } else if (game.status === 'falling' || game.status === 'over') {
      const text = game.overReason === 'timeout' ? '시간 초과!' : '으악!';
      outlinedText(text, w / 2, h * 0.4, Math.min(48, w * 0.12), '#fecaca');
    }

    // 50칸 마일스톤 팝업
    for (const p of view.popups) {
      const k = p.t / POPUP_TIME;
      const scale = k < 0.2 ? lerp(0.3, 1.25, k / 0.2) : k < 0.3 ? lerp(1.25, 1, (k - 0.2) / 0.1) : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(w / 2, h * 0.3 - k * 20);
      ctx.scale(scale, scale);
      outlinedText(p.text, 0, 0, Math.min(110, w * 0.26), '#facc15');
      ctx.restore();
    }
  }

  function render(game, dt, { best = 0 } = {}) {
    if (!w || !h) resize();
    const m = metrics();
    view.time += dt;

    // 캐릭터 표시 위치: 논리 위치를 빠르게 따라감 + 짧은 점프
    const stair = getStair(game, game.pos);
    if (!view.initialized) {
      view.charX = view.camX = stair.x;
      view.charY = view.camY = stair.y;
      view.initialized = true;
    }

    let rotation = 0;
    let drawX;
    let drawY;
    const falling = game.status === 'falling' || game.status === 'over';
    if (falling) {
      const t = Math.min(game.fallTime, FALL_DURATION);
      drawX = view.fallFromX + game.fallDir * t * 2.2;
      drawY = view.fallFromY + 1.4 * t - 9 * t * t;
      rotation = game.fallDir * t * 12;
    } else {
      const k = 1 - Math.exp(-dt * 30);
      view.charX += (stair.x - view.charX) * k;
      view.charY += (stair.y - view.charY) * k;
      view.hopT += dt;
      drawX = view.charX;
      drawY = view.charY + Math.sin(Math.PI * clamp01(view.hopT / HOP_TIME)) * 0.3;
      // 카메라는 캐릭터를 부드럽게 따라감
      const kx = 1 - Math.exp(-dt * 6);
      const ky = 1 - Math.exp(-dt * 9);
      view.camX += (view.charX - view.camX) * kx;
      view.camY += (view.charY - view.camY) * ky;
    }

    // 화면 흔들림
    view.shake = Math.max(0, view.shake - dt * 2.2);
    const shakePx = view.shake * view.shake * 10;
    const offX = (Math.random() - 0.5) * 2 * shakePx;
    const offY = (Math.random() - 0.5) * 2 * shakePx;

    // 팝업 수명
    for (const p of view.popups) p.t += dt;
    view.popups = view.popups.filter((p) => p.t < POPUP_TIME);

    const toScreen = (x, y) => [w / 2 + (x - view.camX) * m.unitX + offX, m.anchorY - (y - view.camY) * m.unitY + offY];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const theme = themeAt(view.camY);
    drawBackground(theme, m);
    drawGround(m, toScreen);
    drawStairs(game, theme, m, toScreen);

    const [cx, cy] = toScreen(drawX, drawY);
    const r = m.unitX * 0.4;
    const squash = !falling && view.hopT < HOP_TIME ? Math.sin(Math.PI * (view.hopT / HOP_TIME)) * -0.6 : 0;
    const blink = !falling && game.status === 'ready' && view.time % 3 < 0.12;
    drawCharacter(ctx, cx, cy, r, color, game.facing, {
      rotation,
      squash,
      legPhase: falling ? view.time * 30 : Math.min(view.hopT / HOP_TIME, 1) * Math.PI,
      blink,
    });

    drawHud(game, best);
  }

  resize();
  return { resize, render, onEvents };
}
