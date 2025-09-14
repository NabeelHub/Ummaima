import React from "https://esm.sh/react@18";
import ReactDOM from "https://esm.sh/react-dom@18/client";

import React, { useEffect, useRef, useState } from "react";

function SubwayShrimpGame(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shrimpImgRef = useRef<HTMLImageElement | null>(null);

  const jumpAudioRef = useRef<HTMLAudioElement | null>(null);
  const crashAudioRef = useRef<HTMLAudioElement | null>(null);
  const collectAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  const [shrimpCount, setShrimpCount] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [gameOver, setGameOver] = useState<boolean>(false);

  const shrimpCountRef = useRef<number>(0);
  useEffect(() => { shrimpCountRef.current = shrimpCount; }, [shrimpCount]);

  const runningRef = useRef<boolean>(running);
  useEffect(() => { runningRef.current = running; }, [running]);
  const mutedRef = useRef<boolean>(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const startedAtRef = useRef<number>(performance.now());
  const itemsRef = useRef<any[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const baseSpeed = 4;
  const speedRef = useRef<number>(baseSpeed);
  const spawnIntervalRef = useRef<number>(900);
  const laneCentersRef = useRef<number[]>([]);
  const laneWidthRef = useRef<number>(0);
  const gameOverRef = useRef<boolean>(false);
  const playerRef = useRef({ lane: 1, x: 0, y: 0, w: 0, h: 0, targetLane: 1 });

  // preload image & audio
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) shrimpImgRef.current = img; };
    img.onerror = () => { shrimpImgRef.current = null; };
    img.src = "/shrimp.png"; // original shrimp icon

    try { jumpAudioRef.current = new Audio('/audio/jump.mp3'); } catch (e) { jumpAudioRef.current = null; }
    try { crashAudioRef.current = new Audio('/audio/crash.mp3'); } catch (e) { crashAudioRef.current = null; }
    try { collectAudioRef.current = new Audio('/audio/collect.mp3'); } catch (e) { collectAudioRef.current = null; }
    try {
      musicAudioRef.current = new Audio('/audio/music.mp3');
      if (musicAudioRef.current) { musicAudioRef.current.loop = true; musicAudioRef.current.volume = 0.45; }
    } catch (e) { musicAudioRef.current = null; }
  }, []);

  // start/stop music according to running & muted
  useEffect(() => {
    const music = musicAudioRef.current;
    if (!music) return;
    if (!running) { music.pause(); music.currentTime = 0; }
    else if (!mutedRef.current) { music.play().catch(() => {}); }
  }, [running, muted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resizeCanvas() {
      const DPR = Math.max(1, window.devicePixelRatio || 1);
      const cssWidth = Math.max(320, Math.min(1100, Math.floor(window.innerWidth * 0.92)));
      const cssHeight = Math.max(420, Math.min(900, Math.floor(window.innerHeight * 0.62)));
      canvas.width = Math.floor(cssWidth * DPR);
      canvas.height = Math.floor(cssHeight * DPR);
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = cssHeight + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      const laneAreaWidth = cssWidth * 0.6;
      const left = (cssWidth - laneAreaWidth) / 2;
      laneWidthRef.current = laneAreaWidth / 3;
      laneCentersRef.current = Array.from({ length: 3 }, (_, i) => left + laneWidthRef.current * i + laneWidthRef.current / 2);

      const p = playerRef.current;
      p.w = Math.min(cssWidth * 0.14, laneWidthRef.current * 0.7);
      p.h = Math.max(28, cssHeight * 0.12);
      p.x = laneCentersRef.current[p.lane] - p.w / 2;
      p.y = cssHeight - p.h - 20;
      p.targetLane = p.lane;
    }

    resizeCanvas();

    const LANES = 3;
    let last = performance.now();
    let rafId = 0;

    function rectsIntersect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function spawn(now: number) {
      if (gameOverRef.current || !runningRef.current) return;
      if (now - lastSpawnRef.current < spawnIntervalRef.current) return;
      lastSpawnRef.current = now;
      const lane = Math.floor(Math.random() * LANES);
      const x = laneCentersRef.current[lane];
      const y = -80;
      const laneW = laneWidthRef.current || (canvas.clientWidth * 0.6 / LANES);
      const rand = Math.random();
      if (rand < 0.25) {
        // obstacle with gap sized to let player pass left or right
        const gap = Math.max(playerRef.current.w + 36, laneW * 0.5);
        const barW = Math.max(8, Math.floor((laneW - gap) / 2));
        itemsRef.current.push({ type: 'obstacle', lane, x, y, gap, barW, h: Math.max(40, laneW * 0.45), vy: speedRef.current });
      } else if (rand < 0.8) {
        itemsRef.current.push({ type: 'shrimp', lane, x, y, w: Math.max(32, laneW * 0.5), h: Math.max(24, laneW * 0.36), vy: speedRef.current });
      } else {
        itemsRef.current.push({ type: 'bonusShrimp', lane, x, y, w: Math.max(40, laneW * 0.7), h: Math.max(32, laneW * 0.5), vy: speedRef.current });
      }
    }

    function playAudio(aRef: React.MutableRefObject<HTMLAudioElement | null>, volume = 1.0) {
      if (mutedRef.current) return;
      const a = aRef.current;
      if (!a) return;
      try { a.currentTime = 0; a.volume = volume; a.play().catch(() => {}); } catch (e) {}
    }

    function doCrash() {
      gameOverRef.current = true;
      runningRef.current = false;
      setRunning(false);
      setGameOver(true);
      setShrimpCount(0);
      shrimpCountRef.current = 0;
      playAudio(crashAudioRef, 1.0);
      const music = musicAudioRef.current; if (music) music.pause();
    }

    function update(dt: number, now: number) {
      if (!runningRef.current) return;
      const elapsed = now - startedAtRef.current;
      speedRef.current = Math.min(20, baseSpeed + (elapsed / 10000) * 0.6);
      spawnIntervalRef.current = Math.max(220, 900 - Math.floor(elapsed / 10000) * 60);

      for (const it of itemsRef.current) it.y += (it.vy || speedRef.current) * (dt / 16.67);
      itemsRef.current = itemsRef.current.filter(it => it.y < canvas.clientHeight + Math.max(it.h || 0, 120));

      const p = playerRef.current;
      const targetX = laneCentersRef.current[p.targetLane] - p.w / 2;
      p.x += (targetX - p.x) * 0.28;

      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const it = itemsRef.current[i];
        if (it.type === 'shrimp' || it.type === 'bonusShrimp') {
          const sx = it.x - it.w / 2;
          const sy = it.y - it.h / 2;
          if (rectsIntersect(p.x, p.y, p.w, p.h, sx, sy, it.w, it.h)) {
            itemsRef.current.splice(i, 1);
            const delta = it.type === 'bonusShrimp' ? 3 : 1;
            setShrimpCount(s => { const nv = s + delta; shrimpCountRef.current = nv; return nv; });
            playAudio(collectAudioRef, 0.9);
            continue;
          }
        } else if (it.type === 'obstacle') {
          const halfLane = laneWidthRef.current / 2;
          const leftBarGlobalX = it.x - halfLane;
          const rightBarGlobalX = it.x + halfLane - it.barW;
          const barY = it.y - it.h / 2;
          const leftHit = rectsIntersect(p.x, p.y, p.w, p.h, leftBarGlobalX, barY, it.barW, it.h);
          const rightHit = rectsIntersect(p.x, p.y, p.w, p.h, rightBarGlobalX, barY, it.barW, it.h);
          if (leftHit || rightHit) { doCrash(); break; }
        }
      }
    }

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#071427');
      bg.addColorStop(1, '#002329');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const laneAreaWidth = width * 0.6;
      const left = (width - laneAreaWidth) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(left, 0, laneAreaWidth, height);

      for (let i = 1; i < 3; i++) {
        const x = left + (laneAreaWidth / 3) * i;
        ctx.beginPath();
        ctx.setLineDash([8, 12]);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 2;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const it of itemsRef.current) {
        if (it.type === 'shrimp') drawShrimp(it.x, it.y, it.w, it.h, false);
        else if (it.type === 'bonusShrimp') drawShrimp(it.x, it.y, it.w, it.h, true);
        else if (it.type === 'obstacle') drawObstacle(it.x, it.y, it.barW, it.h, it.gap);
      }

      const p = playerRef.current;
      const radius = Math.max(10, p.h * 0.12);
      ctx.save();
      roundRect(ctx, p.x, p.y, p.w, p.h, radius);
      ctx.clip();
      ctx.fillStyle = '#FF6B6B';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '600 18px Inter, system-ui, Arial';
      ctx.fillText(`Shrimps: ${shrimpCountRef.current}`, 18, 28);

      if (!runningRef.current) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(width / 2 - 160, height / 2 - 44, 320, 80);
        ctx.fillStyle = '#fff';
        ctx.font = '600 16px Inter, system-ui, Arial';
        ctx.fillText(gameOverRef.current ? 'Game Over! Press Restart' : 'Tap or press ← → to start', width / 2 - 120, height / 2 + 6);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(width - 150, 14, 120, 8);
      const speedPct = Math.min(1, (speedRef.current - baseSpeed) / (20 - baseSpeed));
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(width - 150, 14, 120 * speedPct, 8);
    }

    function drawShrimp(x: number, y: number, w: number, h: number, isBonus: boolean) {
      const img = shrimpImgRef.current;
      if (img && img.complete && img.naturalWidth && img.naturalWidth > 0) {
        try { ctx.save(); ctx.translate(x, y); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore(); } catch (e) { fallbackShrimp(x, y, w, h, isBonus); }
      } else { fallbackShrimp(x, y, w, h, isBonus); }
    }

    function fallbackShrimp(x: number, y: number, w: number, h: number, isBonus: boolean) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = isBonus ? '#FFD93D' : '#FF8F56';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-w * 0.2, 0);
      ctx.lineTo(-w * 0.55, -h * 0.25);
      ctx.lineTo(-w * 0.55, h * 0.25);
      ctx.closePath();
      ctx.fillStyle = isBonus ? '#FFC83D' : '#E6733E';
      ctx.fill();
      ctx.restore();
    }

    function drawObstacle(x: number, y: number, barW: number, h: number, gap: number) {
      ctx.save();
      ctx.translate(x, y);
      const halfLane = laneWidthRef.current / 2;
      const leftBarX = -halfLane;
      const rightBarX = halfLane - barW;
      ctx.fillStyle = '#8E6AFF';
      ctx.fillRect(leftBarX, -h / 2, barW, h);
      ctx.fillRect(rightBarX, -h / 2, barW, h);
      ctx.restore();
    }

    function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    let lastFrame = performance.now();
    function frame(now: number) {
      const dt = Math.min(40, now - lastFrame);
      lastFrame = now;
      if (runningRef.current) { spawn(now); update(dt, now); }
      draw();
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    // pointer/touch handling
    let pointerStartX: number | null = null;
    function onPointerDown(e: PointerEvent) { pointerStartX = e.clientX; }
    function onPointerUp(e: PointerEvent) {
      const x = e.clientX;
      if (pointerStartX === null) { if (!runningRef.current) startGameInternal(); return; }
      const dx = x - pointerStartX;
      if (Math.abs(dx) > 40) { if (dx > 0) moveRight(); else moveLeft(); }
      else if (!runningRef.current) startGameInternal();
      pointerStartX = null;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') moveLeft();
      else if (e.key === 'ArrowRight') moveRight();
      else if (e.key === ' ' || e.key === 'Enter') startGameInternal();
    }

    function moveLeft() { const p = playerRef.current; p.targetLane = Math.max(0, p.targetLane - 1); if (!runningRef.current) startGameInternal(); }
    function moveRight() { const p = playerRef.current; p.targetLane = Math.min(2, p.targetLane + 1); if (!runningRef.current) startGameInternal(); }

    function startGameInternal() {
      startedAtRef.current = performance.now();
      itemsRef.current = [];
      lastSpawnRef.current = 0;
      speedRef.current = baseSpeed;
      spawnIntervalRef.current = 900;
      gameOverRef.current = false;
      setGameOver(false);
      setShrimpCount(0);
      shrimpCountRef.current = 0;
      const p = playerRef.current; p.lane = 1; p.targetLane = 1;
      runningRef.current = true; setRunning(true);
      const music = musicAudioRef.current; if (music && !mutedRef.current) music.play().catch(() => {});
    }

    function onResizeHandler() { resizeCanvas(); }

    canvas.addEventListener('pointerdown', onPointerDown as any);
    window.addEventListener('pointerup', onPointerUp as any);
    window.addEventListener('keydown', onKeyDown as any);
    window.addEventListener('resize', onResizeHandler as any);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown as any);
      window.removeEventListener('pointerup', onPointerUp as any);
      window.removeEventListener('keydown', onKeyDown as any);
      window.removeEventListener('resize', onResizeHandler as any);
    };
  }, []);

  function startGame(): void {
    itemsRef.current = [];
    lastSpawnRef.current = 0;
    speedRef.current = baseSpeed;
    spawnIntervalRef.current = 900;
    gameOverRef.current = false;
    setGameOver(false);
    setShrimpCount(0);
    shrimpCountRef.current = 0;
    const p = playerRef.current; p.lane = 1; p.targetLane = 1;
    startedAtRef.current = performance.now();
    runningRef.current = true;
    setRunning(true);
    const music = musicAudioRef.current; if (music && !mutedRef.current) { music.currentTime = 0; music.play().catch(() => {}); }
  }

  function restartGame(): void { startGame(); }

  function stopGame(): void { runningRef.current = false; setRunning(false); const music = musicAudioRef.current; if (music) music.pause(); }

  function toggleMute(): void {
    setMuted(m => {
      const nm = !m;
      mutedRef.current = nm;
      const music = musicAudioRef.current;
      if (music) {
        if (nm) music.pause(); else if (runningRef.current) music.play().catch(() => {});
      }
      return nm;
    });
  }

  return (
    <div style={{ padding: 20, color: '#fff', fontFamily: 'Inter, system-ui, Arial' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 920, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: '#fff' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Anoma's Shrimp by Ummaima</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Collect shrimps • Mobile + Desktop</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={startGame} style={{ padding: '6px 12px', borderRadius: 8, background: '#10b981', color: '#000', fontWeight: 700 }}>Start</button>
          <button onClick={stopGame} style={{ padding: '6px 12px', borderRadius: 8, background: '#ef4444', color: '#000', fontWeight: 700 }}>Stop</button>
          <button onClick={toggleMute} style={{ padding: '6px 12px', borderRadius: 8, background: '#374151', color: '#fff' }}>{muted ? 'Unmute' : 'Mute'}</button>
        </div>
      </div>

      <div style={{ marginTop: 12, maxWidth: 920, width: '100%', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 560, touchAction: 'none' }} />
        {gameOver && (
          <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%, -50%)', zIndex: 50 }}>
            <button onClick={restartGame} style={{ padding: '10px 18px', borderRadius: 10, background: '#10b981', color: '#000', fontWeight: 800, fontSize: 16 }}>Restart</button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, maxWidth: 920 }}>
        <div style={{ color: '#fff', marginBottom: 6 }}>Shrimps collected: <strong>{shrimpCount}</strong></div>
        <div style={{ color: '#aaa', fontSize: 13 }}>Controls: arrow keys (← →), tap/click or swipe on mobile. Use Start to begin.</div>
      </div>
    </div>
  );
}


export default Home;


ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null, React.createElement(Home))
);
