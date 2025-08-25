// Flappy Node - a neon, nodeGraph-styled Flappy Bird
// Exposes window.FlappyNode.start(canvasId) and window.FlappyNode.stop()
(function(){
  const FlappyNode = {};
  let canvas, ctx, running = false, rafId = null;
  let paused = false;
  let lastTime = 0;
  let nodes = []; // background nodes (neon graph vibe)
  let lines = [];
  let player, gravity, pipes, pipeTimer, score, bestScore = 0;
  let keyDownHandler, pointerHandler;
  let particles = [];
  let explosionActive = false;
  let explosionTimer = 0;

  const COLORS = {
    bg: '#121212',
    line: (o) => `rgba(0, 200, 255, ${o})`,
    node1: '#00ffff',
    node2: '#ff00ff',
    player: '#ff00ff',
    pipe: '#00ffff',
    text: '#e0e0e0',
    explosion: 'rgba(255,165,0,', // neon orange base, alpha appended dynamically
  };

  function initBackground() {
    nodes = [];
    lines = [];
    const area = canvas.width * canvas.height;
    const nodeCount = Math.max(30, Math.floor(area / 20000));
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.7,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        color: Math.random() > 0.5 ? COLORS.node1 : COLORS.node2,
      });
    }
  }

  function updateBackground(dt) {
    // Move nodes
    nodes.forEach(n => {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (n.x < 0) { n.x = 0; n.vx *= -1; }
      if (n.y < 0) { n.y = 0; n.vy *= -1; }
      if (n.x > canvas.width) { n.x = canvas.width; n.vx *= -1; }
      if (n.y > canvas.height) { n.y = canvas.height; n.vy *= -1; }
    });

    // Recompute lines
    lines = [];
    for (let i=0;i<nodes.length;i++){
      for (let j=i+1;j<nodes.length;j++){
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d = Math.hypot(dx, dy);
        if (d < 100) {
          lines.push({
            x1: nodes[i].x, y1: nodes[i].y,
            x2: nodes[j].x, y2: nodes[j].y,
            o: (100 - d) / 100 * 0.28
          });
        }
      }
    }
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // lines
    ctx.lineWidth = 1;
    lines.forEach(l => {
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.strokeStyle = COLORS.line(l.o);
      ctx.stroke();
    });

    // nodes
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function resetGame() {
    player = {
      x: canvas.width * 0.25,
      y: canvas.height * 0.5,
      r: 10,
      vy: 0,
    };
    gravity = 1400; // px/s^2
    pipes = [];
    pipeTimer = 0;
    score = 0;
    particles = [];
    explosionActive = false;
    explosionTimer = 0;
  }

  function spawnPipe() {
    const gapH = Math.max(120, Math.min(220, canvas.height * 0.25));
    const minY = 80;
    const maxY = canvas.height - 80 - gapH;
    const gapY = Math.random() * (maxY - minY) + minY;
    const width = 60;
    const speed = 220 + Math.min(200, score * 5);
    pipes.push({ x: canvas.width + width, w: width, gapY, gapH, speed, scored: false });
  }

  function updateGame(dt) {
    // dt in seconds
    player.vy += gravity * dt;
    player.y += player.vy * dt;

    // pipes
    pipeTimer -= dt;
    if (pipeTimer <= 0) {
      spawnPipe();
      pipeTimer = 1.6;
    }
    pipes.forEach(p => { p.x -= p.speed * dt; });
    while (pipes.length && pipes[0].x + pipes[0].w < 0) pipes.shift();

    // score
    pipes.forEach(p => {
      if (!p.scored && p.x + p.w < player.x) {
        p.scored = true; score += 1; bestScore = Math.max(bestScore, score);
      }
    });

    // collisions
    if (player.y - player.r < 0 || player.y + player.r > canvas.height) {
      triggerExplosion(player.x, Math.max(0, Math.min(canvas.height, player.y)));
      return;
    }
    for (const p of pipes) {
      const inX = player.x + player.r > p.x && player.x - player.r < p.x + p.w;
      const inGap = player.y - player.r > p.gapY && player.y + player.r < p.gapY + p.gapH;
      if (inX && !inGap) {
        triggerExplosion(player.x, player.y);
        return;
      }
    }
  }

  function drawGame() {
    // pipes as neon vertical bars
    pipes.forEach(p => {
      ctx.fillStyle = COLORS.pipe;
      ctx.shadowColor = COLORS.pipe;
      ctx.shadowBlur = 10;
      // top
      ctx.fillRect(p.x, 0, p.w, p.gapY);
      // bottom
      const by = p.gapY + p.gapH;
      ctx.fillRect(p.x, by, p.w, canvas.height - by);
      ctx.shadowBlur = 0;
    });

    // player node
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.player;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // score
    ctx.fillStyle = COLORS.text;
    ctx.font = '20px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 16, 28);
    ctx.textAlign = 'right';
    ctx.fillText(`Best: ${bestScore}`, canvas.width - 16, 28);
  }

  // --- Explosion Particles ---
  function triggerExplosion(x, y) {
    if (explosionActive) return;
    explosionActive = true;
    explosionTimer = 0.6; // seconds
    particles = [];
    const count = 50;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 300; // px/s
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.2,
        age: 0,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // slight gravity pull
      p.vy += 800 * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.explosion + (0.4 + 0.6 * alpha) + ')';
      ctx.shadowColor = 'rgba(255,165,0,0.9)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawStartOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ffff';
    ctx.textAlign = 'center';
    ctx.font = '28px "Share Tech Mono", monospace';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    ctx.fillText('FLAPPY NODE', canvas.width/2, canvas.height/2 - 20);
    ctx.font = '16px "Share Tech Mono", monospace';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Press Space or Click to Start', canvas.width/2, canvas.height/2 + 16);
  }

  function flap() {
    // give an upward impulse
    player.vy = -420;
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.033, (ts - lastTime) / 1000);
    lastTime = ts;

    updateBackground(dt * 60); // scale to keep background lively
    drawBackground();

    if (!paused && !explosionActive) {
      updateGame(dt);
      drawGame();
    } else if (paused) {
      // draw initial scene (player already reset in start())
      drawGame();
      drawStartOverlay();
    } else if (explosionActive) {
      // Freeze gameplay; animate explosion
      drawGame();
      updateParticles(dt);
      drawParticles();
      explosionTimer -= dt;
      if (explosionTimer <= 0 || particles.length === 0) {
        explosionActive = false;
        gameOver();
        return;
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    if (!running) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (paused) {
        paused = false;
        flap();
      } else if (!explosionActive) {
        flap();
      }
    } else if (e.code === 'Escape') {
      // allow host page to close overlay
      if (typeof FlappyNode.onRequestExit === 'function') FlappyNode.onRequestExit();
    }
  }

  function onPointer() {
    if (!running) return;
    if (paused) {
      paused = false;
      flap();
    } else if (!explosionActive) {
      flap();
    }
  }

  function gameOver() {
    // Show quick flash effect by briefly stopping then resetting
    running = false;
    // Draw game over text
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '28px "Share Tech Mono", monospace';
    ctx.fillText('Game Over', canvas.width/2, canvas.height/2 - 10);
    ctx.font = '18px "Share Tech Mono", monospace';
    ctx.fillText('Press Space to retry or Esc to exit', canvas.width/2, canvas.height/2 + 20);

    const retry = (e) => {
      if (e && e.code !== 'Space') return;
      window.removeEventListener('keydown', retry);
      if (!canvas) return;
      running = true;
      resetGame();
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    };
    window.addEventListener('keydown', retry, { once: true });
  }

  function resizeCanvas() {
    // maintain 4:3 aspect within available CSS size
    const rect = canvas.getBoundingClientRect();
    // Use device pixel ratio for crispness
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      initBackground();
    }
  }

  FlappyNode.start = function(canvasId){
    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    running = true;
    paused = true;
    lastTime = 0;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initBackground();
    resetGame();

    keyDownHandler = onKeyDown;
    pointerHandler = onPointer;
    window.addEventListener('keydown', keyDownHandler);
    canvas.addEventListener('pointerdown', pointerHandler);

    rafId = requestAnimationFrame(loop);
  };

  FlappyNode.stop = function(){
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', keyDownHandler);
    if (canvas) canvas.removeEventListener('pointerdown', pointerHandler);
    window.removeEventListener('resize', resizeCanvas);
    canvas = null; ctx = null; nodes = []; lines = []; pipes = [];
  };

  // Allow host to listen for exit request (Esc)
  FlappyNode.onRequestExit = null;

  window.FlappyNode = FlappyNode;
})();
