/**
 * @module BackgroundSystem
 * @summary Registry-driven background manager + selectable backgrounds (galaxy, mood, lava, retro, aurora, matrix, void).
 * @description New backgrounds register via `registerBackground(id, factory)` and
 *   are chosen through the Background selector / CONFIG.background.active.
 * @exports window.NodeNet.BackgroundSystem, GalaxyBackground, MoodBackground, LavaBackground, RetroBackground, AuroraBackground, MatrixBackground, registerBackground
 * @tags background, galaxy, mood, lava, retro, aurora, matrix, void, nebula, stars, registry, ambient, vfx
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  let canvas = null;
  let ctx = null;
  let viewState = null;
  let nodes = [];
  let edges = [];
  let getNodes = () => [];
  let getEdges = () => [];
  let onCometImpact = null;

  let galaxyStars = [];
  let galaxyNebulae = [];
  let galaxyComets = [];
  let galaxyNovas = [];
  let galaxyPulsars = [];
  let galaxyStarSprites = [];
  let galaxyCometExplosions = [];
  let GALAXY_STAR_COUNT = 480;
  let GALAXY_NEBULA_COUNT = 5;
  let GALAXY_COMET_CAP = 2;
  let lastBackgroundTime = Date.now();
  let lastNovaSpawn = 0;
  let galaxyWindAngle = Math.random() * Math.PI * 2;

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function mixColor(a, b, t) {
    const amount = clamp01(t);
    return {
      r: Math.round(a.r + (b.r - a.r) * amount),
      g: Math.round(a.g + (b.g - a.g) * amount),
      b: Math.round(a.b + (b.b - a.b) * amount),
    };
  }

  function rgba(color, alpha) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  function configureGalaxyConfig(config = {}) {
    GALAXY_STAR_COUNT = config.starCount ?? 480;
    GALAXY_NEBULA_COUNT = config.nebulaCount ?? 5;
    GALAXY_COMET_CAP = config.cometCap ?? 2;
  }

  function configureGalaxyDependencies(dependencies = {}) {
    canvas = dependencies.canvas || canvas;
    ctx = dependencies.ctx || ctx;
    viewState = dependencies.viewState || viewState;
    getNodes = dependencies.getNodes || getNodes;
    getEdges = dependencies.getEdges || getEdges;
    onCometImpact = dependencies.onCometImpact || onCometImpact;
  }

  function refreshGalaxyRuntimeState() {
    nodes = typeof getNodes === "function" ? getNodes() : [];
    edges = typeof getEdges === "function" ? getEdges() : [];
  }

  function handleCometImpact(centralNode, color) {
    if (typeof onCometImpact === "function") {
      onCometImpact(centralNode, color);
    }
  }

  const backgroundFactories = new Map();

  function registerBackgroundFactory(id, factory) {
    if (!id || typeof factory !== "function") return;
    backgroundFactories.set(id, factory);
  }

  // Shared star palette (referenced by sprite cache and pulsars)
  const GALAXY_STAR_PALETTE = [
    { r: 255, g: 255, b: 255 },
    { r: 176, g: 196, b: 255 },
    { r: 255, g: 244, b: 214 },
    { r: 167, g: 210, b: 255 },
  ];
  // Discrete star size bins (radii in px) used for sprite cache lookup
  const GALAXY_STAR_SIZE_BINS = [0.5, 0.9, 1.3, 1.8];

  // Pre-render star sprites (one per color x size) to an offscreen canvas.
  // Lets the render loop use a single drawImage instead of arc+fill.
  function buildGalaxyStarSprites() {
    galaxyStarSprites.length = 0;
    for (let c = 0; c < GALAXY_STAR_PALETTE.length; c++) {
      const color = GALAXY_STAR_PALETTE[c];
      const row = [];
      for (let s = 0; s < GALAXY_STAR_SIZE_BINS.length; s++) {
        const core = GALAXY_STAR_SIZE_BINS[s];
        const halo = core * 3;
        const size = Math.ceil(halo * 2);
        const off = document.createElement("canvas");
        off.width = size;
        off.height = size;
        const octx = off.getContext("2d");
        const cx = size / 2;
        const cy = size / 2;
        const grad = octx.createRadialGradient(cx, cy, 0, cx, cy, halo);
        grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},1)`);
        grad.addColorStop(
          0.3,
          `rgba(${color.r},${color.g},${color.b},0.55)`
        );
        grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
        octx.fillStyle = grad;
        octx.fillRect(0, 0, size, size);
        row.push(off);
      }
      galaxyStarSprites.push(row);
    }
  }

  // Distant pulsars: stationary points that emit slow expanding rings.
  function initializePulsars() {
    galaxyPulsars.length = 0;
    const palette = [
      { r: 255, g: 255, b: 255 },
      { r: 170, g: 200, b: 255 },
      { r: 255, g: 200, b: 140 },
    ];
    const count = 3;
    const now = Date.now();
    // Shockwaves can reach past the screen edge - size them relative
    // to the canvas diagonal so they always wash over the viewport.
    const diagonal = Math.hypot(canvas.width, canvas.height) || 1;
    for (let i = 0; i < count; i++) {
      galaxyPulsars.push({
        x: randomRange(canvas.width * 0.1, canvas.width * 0.9),
        y: randomRange(canvas.height * 0.1, canvas.height * 0.9),
        color: palette[i % palette.length],
        // Stagger first pulses heavily so the opening minutes feel calm
        nextPulse: now + randomRange(60000, 600000),
        pulseStart: 0,
        // Slower expansion to match larger radius (5.5-8s)
        pulseDuration: randomRange(5500, 8000),
        // 70-120% of screen diagonal - ring sweeps past the edges
        maxRadius: randomRange(diagonal * 0.7, diagonal * 1.2),
        coreRadius: randomRange(1.2, 1.8),
      });
    }
  }

  function initializeGalaxy() {
    galaxyStars.length = 0;
    for (let i = 0; i < GALAXY_STAR_COUNT; i++) {
      const depth = Math.random();
      const colorIdx = Math.floor(
        Math.random() * GALAXY_STAR_PALETTE.length
      );
      // Map depth to one of 3 parallax layers (far/mid/near)
      const layer = Math.min(2, Math.floor(depth * 3));
      // Discrete size bin used to pick a pre-rendered sprite
      const sizeIdx = Math.min(
        GALAXY_STAR_SIZE_BINS.length - 1,
        Math.floor(depth * GALAXY_STAR_SIZE_BINS.length)
      );
      // Layer scale: far layers move MUCH slower than near ones
      //   layer 0 (far)  -> 0.25x
      //   layer 1 (mid)  -> 1.00x
      //   layer 2 (near) -> 1.75x
      const layerScale = 0.25 + layer * 0.75;
      galaxyStars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: 0.25 + depth * 1.6,
        // Much slower base speed (was 10 + depth*40)
        speed: 1 + depth * 10,
        // Per-star perpendicular drift (scaled per-layer in render)
        driftX: (Math.random() - 0.5) * 2.5,
        driftY: (Math.random() - 0.5) * 2.5,
        layer: layer,
        layerScale: layerScale,
        // Far layers are dimmer for depth cueing
        layerAlpha: 0.45 + layer * 0.275,
        colorIdx: colorIdx,
        sizeIdx: sizeIdx,
        // Primary twinkle: wider randomized range, mostly slow
        twinkleSpeed: 0.15 + Math.random() * 1.25,
        twinkleOffset: Math.random() * Math.PI * 2,
        // Secondary slow beat so each star has its own rhythm
        twinkleSpeed2: 0.08 + Math.random() * 0.5,
        twinkleOffset2: Math.random() * Math.PI * 2,
        // Baseline dimness and fluctuation range vary per star
        twinkleMin: 0.12 + Math.random() * 0.35,
        twinkleRange: 0.2 + Math.random() * 0.55,
        color: GALAXY_STAR_PALETTE[colorIdx],
      });
    }
    initializePulsars();

    galaxyNebulae.length = 0;
    const nebulaPalette = [
      { r: 99, g: 102, b: 241 },
      { r: 14, g: 165, b: 233 },
      { r: 236, g: 72, b: 153 },
      { r: 74, g: 222, b: 128 },
    ];
    const maxDimension = Math.max(canvas.width, canvas.height) || 1;
    for (let i = 0; i < GALAXY_NEBULA_COUNT; i++) {
      const color =
        nebulaPalette[Math.floor(Math.random() * nebulaPalette.length)];
      const baseRadius = randomRange(
        maxDimension * 0.2,
        maxDimension * 0.35
      );
      const driftAngle = Math.random() * Math.PI * 2;
      const driftSpeed = randomRange(4, 12);

      // Create multiple cloud clusters for irregular nebula structure
      const numClouds = Math.floor(randomRange(3, 7)); // 3-6 overlapping clouds
      const clouds = [];
      for (let j = 0; j < numClouds; j++) {
        clouds.push({
          // Offset from nebula center
          offsetX: randomRange(-baseRadius * 0.4, baseRadius * 0.4),
          offsetY: randomRange(-baseRadius * 0.4, baseRadius * 0.4),
          // Size variation
          sizeScale: randomRange(0.3, 1.0),
          // Opacity variation for depth
          opacityScale: randomRange(0.6, 1.0),
          // Individual morphing
          morphPhase: Math.random() * Math.PI * 2,
          morphSpeed: randomRange(0.0002, 0.0006),
        });
      }

      galaxyNebulae.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        baseRadius,
        color,
        pulseSpeed: randomRange(0.25, 0.6),
        pulsePhase: Math.random() * Math.PI * 2,
        vx: Math.cos(driftAngle) * driftSpeed,
        vy: Math.sin(driftAngle) * driftSpeed,
        clouds: clouds, // Array of cloud clusters
        // Overall morphing parameters
        morphSpeed1: randomRange(0.0003, 0.0008),
        morphSpeed2: randomRange(0.0004, 0.0009),
        morphSpeed3: randomRange(0.0002, 0.0006),
        morphPhase1: Math.random() * Math.PI * 2,
        morphPhase2: Math.random() * Math.PI * 2,
        morphPhase3: Math.random() * Math.PI * 2,
      });
    }

    galaxyComets.length = 0;
    galaxyNovas.length = 0;
    galaxyCometExplosions.length = 0;
    lastBackgroundTime = Date.now();
    lastNovaSpawn = lastBackgroundTime;
  }

  function spawnComet() {
    const panelOffset = viewState.isSidePanelOpen
      ? viewState.sidePanelWidth
      : 0;
    const visualCx = (canvas.width - panelOffset) / 2;
    const visualCy = canvas.height / 2;
    const worldCx = canvas.width / 2;
    const worldCy = canvas.height / 2;

    const screenLeft = 0;
    const screenTop = 0;
    const screenRight = canvas.width - panelOffset;
    const screenBottom = canvas.height;

    const worldLeft = (screenLeft - visualCx) / viewState.scale + worldCx;
    const worldRight = (screenRight - visualCx) / viewState.scale + worldCx;
    const worldTop = (screenTop - visualCy) / viewState.scale + worldCy;
    const worldBottom = (screenBottom - visualCy) / viewState.scale + worldCy;

    const centralNode = nodes[0];
    const rootX = centralNode ? centralNode.x : worldCx;
    const rootY = centralNode ? centralNode.y : worldCy;

    const spawnMargin = randomRange(140, 240) / viewState.scale;
    const edgeRoll = Math.random();
    let startX;
    let startY;
    if (edgeRoll < 0.25) {
      startX = worldLeft - spawnMargin;
      startY = randomRange(worldTop, worldBottom);
    } else if (edgeRoll < 0.5) {
      startX = worldRight + spawnMargin;
      startY = randomRange(worldTop, worldBottom);
    } else if (edgeRoll < 0.75) {
      startX = randomRange(worldLeft, worldRight);
      startY = worldTop - spawnMargin;
    } else {
      startX = randomRange(worldLeft, worldRight);
      startY = worldBottom + spawnMargin;
    }

    const aimJitterX = randomRange(-160, 160) / viewState.scale;
    const aimJitterY = randomRange(-120, 120) / viewState.scale;
    const aimX = rootX + aimJitterX;
    const aimY = rootY + aimJitterY;

    const dirX = aimX - startX;
    const dirY = aimY - startY;
    const dirMag = Math.hypot(dirX, dirY) || 1;

    const speed = randomRange(160, 280) / viewState.scale;
    const color = { r: 173, g: 216, b: 255 };
    galaxyComets.push({
      x: startX,
      y: startY,
      vx: (dirX / dirMag) * speed,
      vy: (dirY / dirMag) * speed,
      radius: randomRange(2.2, 3.6),
      life: randomRange(12, 18),
      tailDistance: randomRange(140, 220),
      color,
      spin: Math.random() < 0.5 ? -1 : 1,
      radialStrength: randomRange(0.75, 1.35),
      tangentialStrength: randomRange(0.6, 1.8),
    });
  }

  function spawnNova(now) {
    lastNovaSpawn = now;
    const novaPalette = [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 214, b: 102 },
      { r: 147, g: 197, b: 253 },
      { r: 244, g: 114, b: 182 },
    ];
    const novaX = randomRange(0, canvas.width);
    const novaY = randomRange(0, canvas.height);
    const novaColor =
      novaPalette[Math.floor(Math.random() * novaPalette.length)];

    const flareDuration = 8000;
    galaxyNovas.push({
      x: novaX,
      y: novaY,
      start: now,
      duration: flareDuration, // Match lens flare duration so nova doesn't get removed early
      maxRadius: randomRange(
        Math.max(canvas.width, canvas.height) * 0.08,
        Math.max(canvas.width, canvas.height) * 0.14
      ),
      color: novaColor,
      // Lens flare effect
      lensFlare: {
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 0.001, // Slow rotation
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.015, // Slower pulse (about 1 pulse per 7 seconds at 60fps)
        lingerDuration: flareDuration, // Lens flare lasts 8 seconds
        rayLength: randomRange(40, 80),
        haloSize: randomRange(25, 45),
      },
    });
  }

  function drawGalaxyBackground(now, frameDeltaSeconds = null) {
    if (canvas.width === 0 || canvas.height === 0) {
      return;
    }

    if (galaxyStars.length === 0) {
      initializeGalaxy();
    }

    const deltaSeconds =
      frameDeltaSeconds ??
      (Math.min(0.05, (now - lastBackgroundTime) / 1000) || 0);
    const frameStep = deltaSeconds * 60;
    lastBackgroundTime = now;

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nebulae
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    galaxyNebulae.forEach((nebula) => {
      nebula.x += nebula.vx * deltaSeconds;
      nebula.y += nebula.vy * deltaSeconds;
      nebula.pulsePhase += nebula.pulseSpeed * deltaSeconds;
      const pulse = 0.82 + Math.cos(nebula.pulsePhase) * -0.18;
      const maxRadius = nebula.baseRadius;
      if (nebula.x < -maxRadius) nebula.x = canvas.width + maxRadius;
      if (nebula.x > canvas.width + maxRadius) nebula.x = -maxRadius;
      if (nebula.y < -maxRadius) nebula.y = canvas.height + maxRadius;
      if (nebula.y > canvas.height + maxRadius) nebula.y = -maxRadius;
      const baseRadius = nebula.baseRadius * pulse;

      // Update overall morph phases
      nebula.morphPhase1 += nebula.morphSpeed1 * frameStep;
      nebula.morphPhase2 += nebula.morphSpeed2 * frameStep;
      nebula.morphPhase3 += nebula.morphSpeed3 * frameStep;

      // Calculate overall wobble
      const morph1 = Math.sin(nebula.morphPhase1);
      const morph2 = Math.sin(nebula.morphPhase2);
      const globalOffsetX = morph1 * baseRadius * 0.05;
      const globalOffsetY = morph2 * baseRadius * 0.05;

      // Draw each cloud cluster to create irregular nebula structure
      nebula.clouds.forEach((cloud) => {
        // Update individual cloud morph
        cloud.morphPhase += cloud.morphSpeed * frameStep;

        // Individual cloud wobble and breathing
        const cloudMorph = Math.sin(cloud.morphPhase);
        const cloudWobbleX = cloudMorph * baseRadius * 0.03;
        const cloudWobbleY =
          Math.cos(cloud.morphPhase * 1.3) * baseRadius * 0.03;
        const cloudBreathing = 1 + cloudMorph * 0.08;

        // Calculate cloud position and size
        const cloudX =
          nebula.x + globalOffsetX + cloud.offsetX + cloudWobbleX;
        const cloudY =
          nebula.y + globalOffsetY + cloud.offsetY + cloudWobbleY;
        const cloudRadius = baseRadius * cloud.sizeScale * cloudBreathing;

        // Draw cloud with radial gradient
        const gradient = ctx.createRadialGradient(
          cloudX,
          cloudY,
          0,
          cloudX,
          cloudY,
          cloudRadius
        );
        const baseOpacity = 0.28 * cloud.opacityScale;
        const midOpacity = 0.14 * cloud.opacityScale;

        gradient.addColorStop(
          0,
          `rgba(${nebula.color.r}, ${nebula.color.g}, ${nebula.color.b}, ${baseOpacity})`
        );
        gradient.addColorStop(
          0.5,
          `rgba(${nebula.color.r}, ${nebula.color.g}, ${nebula.color.b}, ${midOpacity})`
        );
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cloudX, cloudY, cloudRadius, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.restore();

    // Adaptive density: scale background load with simulation complexity.
    // Heavy networks/attacks get fewer stars and comets to free up frame time.
    const bgComplexity = nodes.length + edges.length * 0.5;
    const bgLoad = Math.max(0.25, 1 - bgComplexity / 800);

    // Slowly rotate the global "wind" vector - gives the void a
    // gravity-shifting feel instead of one-direction scroll.
    galaxyWindAngle += 0.05 * deltaSeconds; // ~3 deg/sec

    // Per-layer angle offsets: each parallax layer drifts in a slightly
    // different direction so the void feels three-dimensional.
    //   layer 0 (far)  -> -18deg from wind
    //   layer 1 (mid)  ->  +0deg (matches wind)
    //   layer 2 (near) -> +22deg
    const layerWind = [
      {
        x: Math.cos(galaxyWindAngle - 0.32),
        y: Math.sin(galaxyWindAngle - 0.32),
      },
      {
        x: Math.cos(galaxyWindAngle),
        y: Math.sin(galaxyWindAngle),
      },
      {
        x: Math.cos(galaxyWindAngle + 0.38),
        y: Math.sin(galaxyWindAngle + 0.38),
      },
    ];

    // Stars (sprite-cached, parallax layers, 4-edge wrap)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const starCount = Math.floor(galaxyStars.length * bgLoad);
    const cw = canvas.width;
    const ch = canvas.height;
    // Center "sun" dimming: stars fade out as they near the simulation
    // center (where the network lives) and stay bright toward the edges.
    // This declutters the busy middle and skips drawing fully-dimmed
    // stars for a free performance win.
    const starPanelOffset = viewState.isSidePanelOpen
      ? viewState.sidePanelWidth
      : 0;
    const starCenterX = (cw - starPanelOffset) / 2;
    const starCenterY = ch / 2;
    const minDim = Math.min(cw, ch);
    const fadeStart = minDim * 0.06; // fully dark within this radius
    const fadeSpan = Math.max(1, minDim * 0.42 - fadeStart);
    for (let s = 0; s < starCount; s++) {
      const star = galaxyStars[s];
      // Parallax: nearer layers move much faster than far ones
      const layerSpeed = star.speed * star.layerScale;
      const lw = layerWind[star.layer];
      star.x +=
        (lw.x * layerSpeed + star.driftX * star.layerScale) *
        deltaSeconds;
      star.y +=
        (lw.y * layerSpeed + star.driftY * star.layerScale) *
        deltaSeconds;
      // Wrap on all four edges so wind rotation stays seamless
      if (star.x < -8) star.x = cw + 8;
      else if (star.x > cw + 8) star.x = -8;
      if (star.y < -8) star.y = ch + 8;
      else if (star.y > ch + 8) star.y = -8;

      // Two-harmonic twinkle: primary pulse + slow beat for variety.
      // Each star has its own speeds, phases, min alpha and range, so
      // no two follow the same dim/brighten pattern.
      const primary =
        Math.sin(now * 0.0008 * star.twinkleSpeed + star.twinkleOffset);
      const beat =
        Math.sin(
          now * 0.0003 * star.twinkleSpeed2 + star.twinkleOffset2
        );
      const combined = (primary + beat * 0.6) / 1.6; // -1..1
      const twinkle = combined * 0.5 + 0.5; // 0..1

      // Distance-from-center fade (smoothstep) - dark in the middle,
      // bright at the edges. Skip fully-dimmed stars entirely.
      const dcx = star.x - starCenterX;
      const dcy = star.y - starCenterY;
      const distCenter = Math.sqrt(dcx * dcx + dcy * dcy);
      let centerFade = (distCenter - fadeStart) / fadeSpan;
      centerFade = centerFade < 0 ? 0 : centerFade > 1 ? 1 : centerFade;
      centerFade = centerFade * centerFade * (3 - 2 * centerFade);
      if (centerFade <= 0.02) continue;

      ctx.globalAlpha =
        (star.twinkleMin + twinkle * star.twinkleRange) *
        star.layerAlpha *
        centerFade;
      const sprite = galaxyStarSprites[star.colorIdx][star.sizeIdx];
      ctx.drawImage(
        sprite,
        star.x - sprite.width / 2,
        star.y - sprite.height / 2
      );
    }
    ctx.restore();

    // Distant pulsars: dim core points that emit a slow expanding ring.
    // Overall opacity is clamped to PULSAR_OPACITY so they never dominate.
    const PULSAR_OPACITY = 0.12;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let p = 0; p < galaxyPulsars.length; p++) {
      const pulsar = galaxyPulsars[p];
      const cr = pulsar.color.r;
      const cg = pulsar.color.g;
      const cb = pulsar.color.b;
      // Always draw a faint, transparent core
      ctx.globalAlpha = PULSAR_OPACITY;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
      ctx.beginPath();
      ctx.arc(pulsar.x, pulsar.y, pulsar.coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Trigger a new pulse if it's time
      if (pulsar.pulseStart === 0 && now >= pulsar.nextPulse) {
        pulsar.pulseStart = now;
      }
      if (pulsar.pulseStart !== 0) {
        const t = (now - pulsar.pulseStart) / pulsar.pulseDuration;
        if (t >= 1) {
          // Pulse complete - schedule next one 12-18 min out.
          // With 3 pulsars, the scene averages one pulse every ~5 min.
          pulsar.pulseStart = 0;
          pulsar.nextPulse = now + randomRange(720000, 1080000);
        } else {
          const eased = t * (2 - t); // ease-out
          const r = pulsar.maxRadius * eased;
          const fade = 1 - t;
          const leadAlpha = fade * 0.55 * PULSAR_OPACITY;
          const trailAlpha = fade * 0.22 * PULSAR_OPACITY;
          // Shockwave: filled disc with a radial gradient that is
          // transparent at the center, ramps up through an inward
          // trail, and peaks at the leading edge.
          const grad = ctx.createRadialGradient(
            pulsar.x,
            pulsar.y,
            0,
            pulsar.x,
            pulsar.y,
            r
          );
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
          grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},0)`);
          grad.addColorStop(
            0.82,
            `rgba(${cr},${cg},${cb},${trailAlpha})`
          );
          grad.addColorStop(
            0.97,
            `rgba(${cr},${cg},${cb},${leadAlpha})`
          );
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pulsar.x, pulsar.y, r, 0, Math.PI * 2);
          ctx.fill();
          // Subtle translucent core flare while pulsing
          ctx.globalAlpha = fade * 0.35 * PULSAR_OPACITY;
          ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
          ctx.beginPath();
          ctx.arc(
            pulsar.x,
            pulsar.y,
            pulsar.coreRadius * 1.8,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // Spawn new comets and novas (comets throttled by bgLoad, novas kept full)
    const cometCap = Math.max(1, Math.floor(GALAXY_COMET_CAP * bgLoad));
    if (
      galaxyComets.length < cometCap &&
      Math.random() < deltaSeconds * 0.05 * bgLoad
    ) {
      spawnComet();
    }
    if (now - lastNovaSpawn > 6000 && Math.random() < deltaSeconds * 0.18) {
      spawnNova(now);
    }

    // Comets
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const panelOffset = viewState.isSidePanelOpen
      ? viewState.sidePanelWidth
      : 0;
    const visualCx = (canvas.width - panelOffset) / 2;
    const visualCy = canvas.height / 2;
    const worldCx = canvas.width / 2;
    const worldCy = canvas.height / 2;

    ctx.translate(visualCx, visualCy);
    ctx.scale(viewState.scale, viewState.scale);
    ctx.translate(viewState.offsetX, viewState.offsetY);
    ctx.translate(-worldCx, -worldCy);

    const cometScreenMargin = 240;
    const screenLeft = -cometScreenMargin;
    const screenTop = -cometScreenMargin;
    const screenRight = canvas.width - panelOffset + cometScreenMargin;
    const screenBottom = canvas.height + cometScreenMargin;

    const worldLeft = (screenLeft - visualCx) / viewState.scale + worldCx;
    const worldRight = (screenRight - visualCx) / viewState.scale + worldCx;
    const worldTop = (screenTop - visualCy) / viewState.scale + worldCy;
    const worldBottom =
      (screenBottom - visualCy) / viewState.scale + worldCy;

    const centralNode = nodes[0];
    const rootX = centralNode ? centralNode.x : worldCx;
    const rootY = centralNode ? centralNode.y : worldCy;
    const maxCenterDistance =
      Math.hypot(visualCx, visualCy) / viewState.scale || 1;
    const centralRadius = centralNode ? centralNode.radius : 0;
    for (let i = galaxyComets.length - 1; i >= 0; i--) {
      const comet = galaxyComets[i];
      comet.x += comet.vx * deltaSeconds;
      comet.y += comet.vy * deltaSeconds;
      comet.life -= deltaSeconds;

      if (
        comet.life <= 0 ||
        comet.x < worldLeft ||
        comet.x > worldRight ||
        comet.y < worldTop ||
        comet.y > worldBottom
      ) {
        galaxyComets.splice(i, 1);
        continue;
      }

      const dirX = comet.x - rootX;
      const dirY = comet.y - rootY;
      const dirMag = Math.hypot(dirX, dirY) || 1;
      const distanceFromCenter = Math.min(maxCenterDistance, dirMag);
      const centerFactor = 1 - distanceFromCenter / maxCenterDistance;

      if (centralNode && centralRadius > 0) {
        if (dirMag <= centralRadius + comet.radius * 0.75) {
          galaxyComets.splice(i, 1);
          galaxyCometExplosions.push({
            x: comet.x,
            y: comet.y,
            start: now,
            duration: 950,
            maxRadius: Math.max(centralRadius * 1.6, 60),
            color: { ...comet.color },
          });
          handleCometImpact(centralNode, {
            r: Math.min(255, comet.color.r + 40),
            g: Math.min(255, comet.color.g + 40),
            b: Math.min(255, comet.color.b + 40),
          });
          continue;
        }
      }

      const influenceRadius = maxCenterDistance * 0.65;
      if (dirMag < influenceRadius) {
        const normDirX = dirX / dirMag;
        const normDirY = dirY / dirMag;
        const proximity = 1 - dirMag / influenceRadius;
        const radialStrength = comet.radialStrength || 1;
        const tangentialStrength = comet.tangentialStrength || 1;
        const spin = comet.spin || 1;
        const radialAccel =
          110 * radialStrength * Math.pow(proximity, 1.4);
        const tangentialAccel = 22 * tangentialStrength * proximity ** 2;

        // Pull toward the center to curve the path inward
        comet.vx += -normDirX * radialAccel * deltaSeconds;
        comet.vy += -normDirY * radialAccel * deltaSeconds;

        // Add a slight tangential component to simulate gravitational bending
        const normalX = -normDirY;
        const normalY = normDirX;
        comet.vx += normalX * tangentialAccel * deltaSeconds * spin;
        comet.vy += normalY * tangentialAccel * deltaSeconds * spin;
      }

      // Calculate tail properties based on distance to center
      const normX = dirX / dirMag;
      const normY = dirY / dirMag;

      // Tail grows as comet approaches center (50% longer when near center)
      const tailLength = comet.tailDistance * (1 + centerFactor * 0.5);

      // Brightness increases dramatically as comet approaches center
      // Nearly transparent at edges (0.05), bright at center (0.8)
      const baseBrightness = 0.05 + centerFactor * 0.75;

      // Color tints toward white as it approaches center
      const tintAmount = centerFactor * 0.8;
      const tintedColor = {
        r: Math.round(comet.color.r + (255 - comet.color.r) * tintAmount),
        g: Math.round(comet.color.g + (255 - comet.color.g) * tintAmount),
        b: Math.round(comet.color.b + (255 - comet.color.b) * tintAmount),
      };

      // Draw tail as stream of tiny fading particles with animation
      // Fixed particle count to prevent stutter - elongate particles instead
      const FIXED_PARTICLE_COUNT = 15;
      const baseParticleSize = 0.8; // Base particle size (constant)

      // Animation offset using time for flowing effect
      const animationSpeed = 0.0001; // Speed of particle flow animation (slower)
      const animationOffset = (now * animationSpeed) % 1; // 0-1 cycling value

      for (let i = 0; i < FIXED_PARTICLE_COUNT; i++) {
        // Distribute particles evenly with animation offset
        // Add small offset per particle to prevent all particles from wrapping at once
        const particlePhaseOffset = i / FIXED_PARTICLE_COUNT;
        const t = (particlePhaseOffset + animationOffset) % 1; // 0 at head, 1 at tail end

        // Use smooth position without additional modulo to prevent stutter
        const animatedT = t;
        const particleX = comet.x + normX * tailLength * animatedT;
        const particleY = comet.y + normY * tailLength * animatedT;

        // Fade out along tail length (bright at head, transparent at end)
        const tailFade = 1 - Math.pow(animatedT, 1.5);
        const particleAlpha = baseBrightness * tailFade;

        // Elongate particles based on centerFactor (1.0x to 2.5x)
        // Particles stretch more as comet approaches center
        const elongationFactor = 1.0 + centerFactor * 1.5;

        // Particles also get larger near head
        const sizeMultiplier = 1 - Math.pow(animatedT, 0.8); // 1.0 at head, ~0 at tail
        const particleSize =
          baseParticleSize *
          (0.3 + sizeMultiplier * 1.2) *
          elongationFactor;

        // Draw elongated particle (ellipse stretched along tail direction)
        ctx.save();
        ctx.translate(particleX, particleY);

        // Calculate angle of tail direction
        const angle = Math.atan2(normY, normX);
        ctx.rotate(angle);

        // Draw stretched ellipse
        ctx.fillStyle = `rgba(${tintedColor.r}, ${tintedColor.g}, ${tintedColor.b}, ${particleAlpha})`;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          particleSize * elongationFactor,
          particleSize,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }

      // Draw comet head (brighter than tail)
      const headAlpha = baseBrightness * 1.5; // Head is 50% brighter than tail start
      ctx.fillStyle = `rgba(${tintedColor.r}, ${tintedColor.g}, ${tintedColor.b}, ${headAlpha})`;
      ctx.beginPath();
      ctx.arc(
        comet.x,
        comet.y,
        comet.radius * (0.7 + centerFactor * 0.5),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();

    // Comet explosions
    if (galaxyCometExplosions.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const panelOffset = viewState.isSidePanelOpen
        ? viewState.sidePanelWidth
        : 0;
      const visualCx = (canvas.width - panelOffset) / 2;
      const visualCy = canvas.height / 2;
      const worldCx = canvas.width / 2;
      const worldCy = canvas.height / 2;

      ctx.translate(visualCx, visualCy);
      ctx.scale(viewState.scale, viewState.scale);
      ctx.translate(viewState.offsetX, viewState.offsetY);
      ctx.translate(-worldCx, -worldCy);
      for (let i = galaxyCometExplosions.length - 1; i >= 0; i--) {
        const boom = galaxyCometExplosions[i];
        const progress = (now - boom.start) / boom.duration;
        if (progress >= 1) {
          galaxyCometExplosions.splice(i, 1);
          continue;
        }
        const eased = Math.pow(progress, 0.55);
        const radius = boom.maxRadius * eased;
        const alpha = 0.75 * (1 - progress);
        const gradient = ctx.createRadialGradient(
          boom.x,
          boom.y,
          0,
          boom.x,
          boom.y,
          radius
        );
        gradient.addColorStop(
          0,
          `rgba(${boom.color.r}, ${boom.color.g}, ${boom.color.b}, ${alpha})`
        );
        gradient.addColorStop(
          0.45,
          `rgba(${boom.color.r}, ${boom.color.g}, ${boom.color.b}, ${
            alpha * 0.6
          })`
        );
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(boom.x, boom.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Novas
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = galaxyNovas.length - 1; i >= 0; i--) {
      const nova = galaxyNovas[i];
      const progress = (now - nova.start) / nova.duration;
      if (progress >= 1) {
        galaxyNovas.splice(i, 1);
        continue;
      }
      const eased = progress * (2 - progress);
      const radius = nova.maxRadius * eased;
      const alpha = (1 - progress) * 0.8;
      const gradient = ctx.createRadialGradient(
        nova.x,
        nova.y,
        0,
        nova.x,
        nova.y,
        radius
      );
      gradient.addColorStop(
        0,
        `rgba(${nova.color.r}, ${nova.color.g}, ${nova.color.b}, ${Math.min(
          1,
          alpha
        )})`
      );
      gradient.addColorStop(
        0.4,
        `rgba(${nova.color.r}, ${nova.color.g}, ${nova.color.b}, ${
          alpha * 0.55
        })`
      );
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(nova.x, nova.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw lens flare effect at center
      const flare = nova.lensFlare;
      const flareElapsed = now - nova.start;
      const flareProgress = flareElapsed / flare.lingerDuration;

      if (flareProgress < 1) {
        // Update flare animation
        flare.rotation += flare.rotationSpeed * frameStep;
        flare.pulsePhase += flare.pulseSpeed * frameStep;

        // Pulsing intensity (more dramatic range for visibility)
        const pulse = 0.5 + Math.sin(flare.pulsePhase) * 0.5; // Pulses between 0.0 and 1.0

        // Fade in quickly, hold, then fade out very gradually
        let lifetimeAlpha;
        if (flareProgress < 0.1) {
          // Quick fade in over first 10% (0.8 seconds)
          lifetimeAlpha = flareProgress / 0.1;
        } else if (flareProgress > 0.4) {
          // Very gradual fade out over last 60% (4.8 seconds)
          const fadeProgress = (flareProgress - 0.4) / 0.6;
          lifetimeAlpha = 1 - fadeProgress * fadeProgress; // Quadratic easing
        } else {
          // Hold full brightness for 30% (2.4 seconds)
          lifetimeAlpha = 1;
        }

        const flareAlpha = Math.max(0.05, lifetimeAlpha * pulse); // Minimum 5% visibility

        ctx.save();
        ctx.translate(nova.x, nova.y);

        // Draw cross-shaped light rays (diffraction spikes)
        ctx.rotate(flare.rotation);
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          ctx.save();
          ctx.rotate(angle);

          // Draw ray as gradient line
          const rayGradient = ctx.createLinearGradient(
            0,
            0,
            flare.rayLength,
            0
          );
          rayGradient.addColorStop(
            0,
            `rgba(255, 255, 255, ${flareAlpha * 0.9})`
          );
          rayGradient.addColorStop(
            0.3,
            `rgba(${nova.color.r}, ${nova.color.g}, ${nova.color.b}, ${
              flareAlpha * 0.6
            })`
          );
          rayGradient.addColorStop(
            1,
            `rgba(${nova.color.r}, ${nova.color.g}, ${nova.color.b}, 0)`
          );

          ctx.strokeStyle = rayGradient;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(flare.rayLength, 0);
          ctx.stroke();

          // Add thinner bright core to ray
          ctx.strokeStyle = `rgba(255, 255, 255, ${flareAlpha * 0.8})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(flare.rayLength * 0.7, 0);
          ctx.stroke();

          ctx.restore();
        }
        ctx.restore();

        // Draw bright central point
        const centerGradient = ctx.createRadialGradient(
          nova.x,
          nova.y,
          0,
          nova.x,
          nova.y,
          8
        );
        centerGradient.addColorStop(
          0,
          `rgba(255, 255, 255, ${flareAlpha})`
        );
        centerGradient.addColorStop(
          0.5,
          `rgba(${nova.color.r}, ${nova.color.g}, ${nova.color.b}, ${
            flareAlpha * 0.8
          })`
        );
        centerGradient.addColorStop(
          1,
          `rgba(${nova.color.r}, ${nova.color.g}, ${nova.color.b}, 0)`
        );
        ctx.fillStyle = centerGradient;
        ctx.beginPath();
        ctx.arc(nova.x, nova.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Draw circular halo ring (chromatic aberration effect)
        ctx.save();
        // Blue halo (inner)
        ctx.strokeStyle = `rgba(147, 197, 253, ${flareAlpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nova.x, nova.y, flare.haloSize * 0.9, 0, Math.PI * 2);
        ctx.stroke();

        // Main color halo (middle)
        ctx.strokeStyle = `rgba(${nova.color.r}, ${nova.color.g}, ${
          nova.color.b
        }, ${flareAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nova.x, nova.y, flare.haloSize, 0, Math.PI * 2);
        ctx.stroke();

        // Red halo (outer - chromatic aberration)
        ctx.strokeStyle = `rgba(248, 113, 113, ${flareAlpha * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nova.x, nova.y, flare.haloSize * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Adapter for the extracted galaxy renderer.
   */
  class GalaxyBackground {
    constructor(config = {}, dependencies = {}) {
      configureGalaxyConfig(config);
      configureGalaxyDependencies(dependencies);
    }

    configure(dependencies = {}) {
      configureGalaxyDependencies(dependencies);
    }

    init() {
      buildGalaxyStarSprites();
      initializeGalaxy();
    }

    resize() {
      initializeGalaxy();
    }

    draw(now, deltaSeconds = null) {
      refreshGalaxyRuntimeState();
      drawGalaxyBackground(now, deltaSeconds);
    }

    destroy() {
      galaxyStars.length = 0;
      galaxyNebulae.length = 0;
      galaxyComets.length = 0;
      galaxyNovas.length = 0;
      galaxyPulsars.length = 0;
      galaxyCometExplosions.length = 0;
    }
  }

  /**
   * Void background — pure black, minimal.
   */
  class VoidBackground {
    constructor(_config, dependencies = {}) {
      this.canvas = dependencies.canvas || null;
      this.ctx = dependencies.ctx || null;
      this.getNodes = dependencies.getNodes || (() => []);
      this.phase = Math.random() * Math.PI * 2;
      this.currentHealthColor = { r: 64, g: 224, b: 208 };
    }

    configure(dependencies = {}) {
      this.canvas = dependencies.canvas || this.canvas;
      this.ctx = dependencies.ctx || this.ctx;
      this.getNodes = dependencies.getNodes || this.getNodes;
    }

    init() {}
    resize() {}
    destroy() {}

    getHealthColor() {
      const nodes = typeof this.getNodes === "function" ? this.getNodes() : [];
      const alive = nodes.filter((n) => n.state === "alive" && !n.isSatellite);
      if (alive.length === 0) return { r: 64, g: 224, b: 208 };

      let score = 0;
      let infected = 0;
      let down = 0;
      let healing = 0;
      for (const node of alive) {
        if (node.status === "green" || node.status === "blue") score += 1;
        else if (node.status === "yellow") score += 0.5;
        if (
          node.status === "malware" ||
          node.status === "botnet" ||
          node.status === "commandControl"
        ) {
          infected += 1;
        }
        if (node.status === "red" || node.status === "yellow") down += 1;
        if (node.isSelfHealing) healing += 1;
      }

      const health = clamp01(score / alive.length);
      const infectedRatio = infected / alive.length;
      const downRatio = down / alive.length;
      const healingRatio = healing / alive.length;
      if (healingRatio > 0.05) return { r: 251, g: 191, b: 36 };
      if (infectedRatio > 0.2) return mixColor({ r: 138, g: 43, b: 226 }, { r: 255, g: 40, b: 120 }, infectedRatio);
      if (downRatio > 0.25) return { r: 220, g: 38, b: 38 };
      return mixColor({ r: 220, g: 38, b: 38 }, { r: 64, g: 224, b: 208 }, health);
    }

    drawTesseract(cx, cy, scale, now) {
      const ctx = this.ctx;
      const t = now * 0.00012;
      const breathe = 1 + Math.sin(now * 0.00012 + this.phase) * 0.08;
      const s = scale * breathe;

      // 4D hypercube vertices: all combinations of +/-1 in 4 dimensions
      const verts4D = [];
      for (let i = 0; i < 16; i++) {
        verts4D.push([
          (i & 1) ? 1 : -1,
          (i & 2) ? 1 : -1,
          (i & 4) ? 1 : -1,
          (i & 8) ? 1 : -1,
        ]);
      }

      // 4D rotation in three independent planes for evolving orientation
      const rotate4D = (v, a12, a13, a24) => {
        let [x, y, z, w] = v;
        // XY plane
        let c = Math.cos(a12), s_ = Math.sin(a12);
        let nx = c * x - s_ * y;
        let ny = s_ * x + c * y;
        x = nx; y = ny;
        // XZ plane
        c = Math.cos(a13); s_ = Math.sin(a13);
        nx = c * x - s_ * z;
        let nz = s_ * x + c * z;
        x = nx; z = nz;
        // YW plane
        c = Math.cos(a24); s_ = Math.sin(a24);
        ny = c * y - s_ * w;
        let nw = s_ * y + c * w;
        y = ny; w = nw;
        return [x, y, z, w];
      };

      const angle12 = t * 0.7 + this.phase;
      const angle13 = t * 0.4 + this.phase * 1.3;
      const angle24 = t * 0.55 + this.phase * 0.7;

      const projected = [];
      for (const v of verts4D) {
        const r = rotate4D(v, angle12, angle13, angle24);
        // Perspective projection 4D -> 3D -> 2D
        const dist4D = 3.2;
        const dist3D = 3.0;
        const wFactor = dist4D / (dist4D + r[3] * 0.45);
        const x3 = r[0] * wFactor;
        const y3 = r[1] * wFactor;
        const z3 = r[2] * wFactor;
        const zFactor = dist3D / (dist3D + z3 * 0.35);
        projected.push({
          x: cx + x3 * zFactor * s,
          y: cy + y3 * zFactor * s,
          z: z3,
        });
      }

      // Edges: vertices differ in exactly one coordinate bit
      const edges = [];
      for (let i = 0; i < 16; i++) {
        for (let bit = 1; bit <= 8; bit <<= 1) {
          const j = i ^ bit;
          if (j > i) edges.push([i, j]);
        }
      }

      // Draw outer (faint, farther) edges first, then inner
      const sortDepth = (a, b) => {
        const za = (projected[a[0]].z + projected[a[1]].z) * 0.5;
        const zb = (projected[b[0]].z + projected[b[1]].z) * 0.5;
        return za - zb;
      };
      edges.sort(sortDepth);

      for (const [i, j] of edges) {
        const a = projected[i];
        const b = projected[j];
        const midZ = (a.z + b.z) * 0.5;
        const depthFade = clamp01((midZ + 1.2) / 2.4);
        ctx.globalAlpha = 0.35 + depthFade * 0.65;
        ctx.lineWidth = 2.2 + depthFade * 2.0;
        ctx.strokeStyle = "#000000";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    draw(now, _deltaSeconds) {
      if (!this.canvas || !this.ctx) return;
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const maxDimension = Math.max(cw, ch);
      const targetColor = this.getHealthColor();
      const lerp = 0.04;
      this.currentHealthColor = {
        r: this.currentHealthColor.r + (targetColor.r - this.currentHealthColor.r) * lerp,
        g: this.currentHealthColor.g + (targetColor.g - this.currentHealthColor.g) * lerp,
        b: this.currentHealthColor.b + (targetColor.b - this.currentHealthColor.b) * lerp,
      };
      const healthColor = this.currentHealthColor;
      const roveX = cw * (0.5 + Math.sin(now * 0.00014 + this.phase) * 0.18);
      const roveY = ch * (0.5 + Math.cos(now * 0.00012 + this.phase) * 0.20);
      const shapeX = cw * (0.5 + Math.sin(now * 0.000055 + this.phase) * 0.04);
      const shapeY = ch * (0.5 + Math.cos(now * 0.000065 + this.phase) * 0.05);
      const shapeScale = maxDimension * (0.28 + Math.sin(now * 0.00013) * 0.025);

      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, cw, ch);

      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(roveX, roveY, 0, roveX, roveY, maxDimension * 0.55);
      glow.addColorStop(0, rgba(healthColor, 0.18));
      glow.addColorStop(0.35, rgba(healthColor, 0.075));
      glow.addColorStop(0.72, rgba(healthColor, 0.025));
      glow.addColorStop(1, rgba(healthColor, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cw, ch);

      ctx.globalCompositeOperation = "source-over";
      ctx.shadowColor = rgba(healthColor, 0.16);
      ctx.shadowBlur = 55;
      this.drawTesseract(shapeX, shapeY, shapeScale, now);

      ctx.shadowBlur = 0;

      const vignette = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, maxDimension * 0.72);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.68)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
  }

  class MoodBackground {
    constructor(config = {}, dependencies = {}) {
      this.config = {
        particleCount: config.particleCount ?? 140,
        maxNodeFields: config.maxNodeFields ?? 110,
      };
      this.particles = [];
      this.canvas = null;
      this.ctx = null;
      this.viewState = null;
      this.getNodes = () => [];
      this.configure(dependencies);
    }

    configure(dependencies = {}) {
      this.canvas = dependencies.canvas || this.canvas;
      this.ctx = dependencies.ctx || this.ctx;
      this.viewState = dependencies.viewState || this.viewState;
      this.getNodes = dependencies.getNodes || this.getNodes;
    }

    init() {
      this.resize();
    }

    resize() {
      this.particles.length = 0;
      if (!this.canvas) return;
      for (let i = 0; i < this.config.particleCount; i++) {
        this.particles.push(this.createParticle(true));
      }
    }

    destroy() {
      this.particles.length = 0;
    }

    createParticle(anywhere = false) {
      const cw = this.canvas?.width || 1;
      const ch = this.canvas?.height || 1;
      const side = Math.floor(Math.random() * 4);
      let x = Math.random() * cw;
      let y = Math.random() * ch;
      if (!anywhere) {
        if (side === 0) y = -12;
        else if (side === 1) x = cw + 12;
        else if (side === 2) y = ch + 12;
        else x = -12;
      }
      return {
        x,
        y,
        angle: Math.random() * Math.PI * 2,
        speed: randomRange(0.25, 1.0),
        size: randomRange(0.6, 2.2),
        phase: Math.random() * Math.PI * 2,
      };
    }

    getScreenPoint(node) {
      const panelOffset = this.viewState?.isSidePanelOpen
        ? this.viewState.sidePanelWidth
        : 0;
      const visualCx = (this.canvas.width - panelOffset) / 2;
      const visualCy = this.canvas.height / 2;
      const worldCx = this.canvas.width / 2;
      const worldCy = this.canvas.height / 2;
      const scale = this.viewState?.scale || 1;
      const offsetX = this.viewState?.offsetX || 0;
      const offsetY = this.viewState?.offsetY || 0;
      return {
        x: visualCx + (offsetX + node.x - worldCx) * scale,
        y: visualCy + (offsetY + node.y - worldCy) * scale,
      };
    }

    getNodeColor(node) {
      if (node.isSelfHealing || node.status === "yellow") {
        return { r: 251, g: 191, b: 36 };
      }
      if (node.status === "red") return { r: 220, g: 38, b: 38 };
      if (node.status === "malware") return { r: 138, g: 43, b: 226 };
      if (node.status === "botnet") return { r: 168, g: 85, b: 247 };
      if (node.status === "commandControl") return { r: 255, g: 40, b: 120 };
      if (node.status === "blue") return { r: 74, g: 144, b: 226 };
      return { r: 64, g: 224, b: 208 };
    }

    getMoodSnapshot(nodes) {
      const alive = nodes.filter((n) => n.state === "alive" && !n.isSatellite);
      if (alive.length === 0) {
        return {
          alive,
          health: 1,
          chaos: 0,
          infectedRatio: 0,
          downRatio: 0,
          healingRatio: 0,
          stormRatio: 0,
          ddosRatio: 0,
        };
      }
      const total = alive.length || 1;
      let healthyScore = 0;
      let infected = 0;
      let down = 0;
      let healing = 0;
      let ddos = 0;
      for (const node of alive) {
        if (node.status === "green" || node.status === "blue") healthyScore += 1;
        else if (node.status === "yellow") healthyScore += 0.5;
        if (
          node.status === "malware" ||
          node.status === "botnet" ||
          node.status === "commandControl"
        ) {
          infected += 1;
        }
        if (node.status === "red" || node.status === "yellow") down += 1;
        if (node.isSelfHealing) healing += 1;
        if (node.ddosState === "active" || node.isUnderDDOS) ddos += 1;
      }

      const stormLoad = (window.NodeNet?.NetworkStorms?.storms || []).reduce(
        (sum, storm) => sum + (storm.intensity || 0),
        0
      );
      const health = clamp01(healthyScore / total);
      const infectedRatio = infected / total;
      const downRatio = down / total;
      const healingRatio = healing / total;
      const ddosRatio = Math.min(1, ddos / Math.max(1, total * 0.08));
      const stormRatio = Math.min(1, stormLoad / 4);
      const chaos = clamp01(
        (1 - health) * 0.45 +
          infectedRatio * 0.55 +
          downRatio * 0.35 +
          stormRatio * 0.35 +
          ddosRatio * 0.35
      );
      return {
        alive,
        health,
        chaos,
        infectedRatio,
        downRatio,
        healingRatio,
        stormRatio,
        ddosRatio,
      };
    }

    pickNodeFields(alive) {
      const priority = alive.filter(
        (node) =>
          node.status !== "green" ||
          node.status === "blue" ||
          node.isSelfHealing ||
          node.ddosState === "active" ||
          node.isUnderDDOS
      );
      const remaining = alive.filter((node) => !priority.includes(node));
      const limit = this.config.maxNodeFields;
      const selected = priority.slice(0, limit);
      const spaceLeft = Math.max(0, limit - selected.length);
      if (spaceLeft > 0 && remaining.length > 0) {
        const step = Math.max(1, Math.ceil(remaining.length / spaceLeft));
        for (let i = 0; i < remaining.length && selected.length < limit; i += step) {
          selected.push(remaining[i]);
        }
      }
      return selected;
    }

    draw(now, deltaSeconds = 0.016) {
      if (!this.canvas || !this.ctx) return;
      if (this.particles.length === 0) this.resize();

      const nodes = typeof this.getNodes === "function" ? this.getNodes() : [];
      const mood = this.getMoodSnapshot(nodes);
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const ctx = this.ctx;
      const calmCore = { r: 5, g: 34, b: 29 };
      const calmEdge = { r: 1, g: 8, b: 12 };
      const downCore = { r: 54, g: 8, b: 12 };
      const malwareCore = { r: 34, g: 12, b: 58 };
      const upsetCore = mixColor(downCore, malwareCore, mood.infectedRatio);
      const healingTint = { r: 50, g: 38, b: 12 };
      const baseCore = mixColor(
        mixColor(calmCore, upsetCore, mood.chaos),
        healingTint,
        mood.healingRatio * 0.6
      );
      const baseEdge = mixColor(calmEdge, { r: 16, g: 2, b: 10 }, mood.chaos);

      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, cw, ch);

      const pulse = Math.sin(now * (0.0006 + mood.chaos * 0.003)) * 0.5 + 0.5;
      const bg = ctx.createRadialGradient(
        cw * (0.48 + Math.sin(now * 0.00017) * 0.04 * mood.chaos),
        ch * (0.45 + Math.cos(now * 0.00013) * 0.04 * mood.chaos),
        0,
        cw * 0.5,
        ch * 0.5,
        Math.max(cw, ch) * 0.85
      );
      bg.addColorStop(0, rgba(mixColor(baseCore, { r: 40, g: 110, b: 70 }, mood.health * 0.2), 0.9));
      bg.addColorStop(0.52, rgba(baseCore, 0.6 + pulse * mood.chaos * 0.12));
      bg.addColorStop(1, rgba(baseEdge, 1));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      ctx.globalCompositeOperation = "lighter";
      // Tie field size to zoom so colour fields track node spacing on screen.
      // Without this, fixed-pixel fields pile up additively at high zoom and
      // wash out to white. Clamp so extreme zoom stays readable.
      const zoom = this.viewState?.scale || 1;
      const fieldZoom = Math.max(0.45, Math.min(1.4, zoom));
      // Density falloff: the more fields we draw, the lower each one's alpha,
      // preventing additive saturation when many overlap.
      const fieldList = this.pickNodeFields(mood.alive);
      const densityScale = Math.max(0.45, 1 - fieldList.length / 220);
      for (const node of fieldList) {
        const point = this.getScreenPoint(node);
        if (
          point.x < -260 ||
          point.x > cw + 260 ||
          point.y < -260 ||
          point.y > ch + 260
        ) {
          continue;
        }
        const color = this.getNodeColor(node);
        const unhealthy =
          node.status === "red" ||
          node.status === "malware" ||
          node.status === "botnet" ||
          node.status === "commandControl" ||
          node.isUnderDDOS;
        const statusBoost = unhealthy ? 1.35 : node.status === "yellow" ? 1.15 : 0.85;
        const shimmer = Math.sin(now * 0.002 + point.x * 0.01 + point.y * 0.01);
        const radius =
          (unhealthy ? 150 : 95) *
          statusBoost *
          fieldZoom *
          (0.85 + mood.chaos * 0.55 + shimmer * mood.chaos * 0.1);
        const alpha =
          (unhealthy
            ? 0.18 + mood.chaos * 0.14
            : 0.06 + mood.health * 0.09) * densityScale;
        const jitterX = unhealthy ? Math.sin(now * 0.01 + point.y) * mood.chaos * 7 : 0;
        const jitterY = unhealthy ? Math.cos(now * 0.012 + point.x) * mood.chaos * 7 : 0;
        const grad = ctx.createRadialGradient(
          point.x + jitterX,
          point.y + jitterY,
          0,
          point.x,
          point.y,
          radius
        );
        grad.addColorStop(0, rgba(color, alpha));
        grad.addColorStop(0.45, rgba(color, alpha * 0.35));
        grad.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const storms = window.NodeNet?.NetworkStorms?.storms || [];
      for (const storm of storms) {
        if (!storm || storm.intensity <= 0) continue;
        const point = this.getScreenPoint(storm);
        const color =
          storm.type === "cascade"
            ? { r: 168, g: 85, b: 247 }
            : { r: 220, g: 38, b: 38 };
        const radius = (storm.radius || 120) * (this.viewState?.scale || 1) * 2.4;
        const grad = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        grad.addColorStop(0, rgba(color, storm.intensity * 0.28));
        grad.addColorStop(0.65, rgba(color, storm.intensity * 0.1));
        grad.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const particleColor = mixColor(
        { r: 82, g: 255, b: 172 },
        mixColor({ r: 255, g: 76, b: 76 }, { r: 168, g: 85, b: 247 }, mood.infectedRatio),
        mood.chaos
      );
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const speed = p.speed * (12 + mood.health * 12 + mood.chaos * 90);
        const driftAngle =
          p.angle +
          Math.sin(now * 0.0006 + p.phase) * (0.8 + mood.chaos * 2.2);
        if (deltaSeconds > 0) {
          p.x += Math.cos(driftAngle) * speed * deltaSeconds;
          p.y += Math.sin(driftAngle) * speed * deltaSeconds;
          if (mood.chaos > 0.2) {
            p.x += (Math.random() - 0.5) * mood.chaos * 18;
            p.y += (Math.random() - 0.5) * mood.chaos * 18;
          }
        }
        if (p.x < -30 || p.x > cw + 30 || p.y < -30 || p.y > ch + 30) {
          this.particles[i] = this.createParticle(false);
          continue;
        }
        const twinkle = Math.sin(now * 0.002 + p.phase) * 0.5 + 0.5;
        const alpha = 0.08 + twinkle * 0.18 + mood.chaos * 0.16;
        ctx.fillStyle = rgba(particleColor, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + mood.chaos * 1.2), 0, Math.PI * 2);
        ctx.fill();
        if (mood.chaos > 0.45) {
          ctx.strokeStyle = rgba(particleColor, alpha * 0.7);
          ctx.lineWidth = 0.8 + mood.chaos;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(
            p.x - Math.cos(driftAngle) * (12 + mood.chaos * 22),
            p.y - Math.sin(driftAngle) * (12 + mood.chaos * 22)
          );
          ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = "source-over";
      const vignette = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, `rgba(0, 0, 0, ${0.35 + mood.chaos * 0.25})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
  }

  /**
   * Hot-wax lava lamp. Instead of separate translucent circles, the wax is a
   * metaball scalar field rendered to a tiny offscreen buffer: nearby blobs
   * merge into one gooey mass and pinch apart as they drift, exactly like
   * molten wax. A heat gradient (amber at the hot base, deep red as it cools
   * near the top) plus a bloom pass give the glowing, viscous look.
   */
  class LavaBackground {
    constructor(config = {}, dependencies = {}) {
      this.config = {
        riserCount: config.riserCount ?? config.blobCount ?? 7,
        poolCount: config.poolCount ?? 5,
        fieldWidth: config.fieldWidth ?? 190,
      };
      this.blobs = [];
      this.canvas = null;
      this.ctx = null;
      this.fieldCanvas = null;
      this.fieldCtx = null;
      this.fieldImage = null;
      this.fw = 1;
      this.fh = 1;
      this.fScale = 1;
      this.configure(dependencies);
    }

    configure(dependencies = {}) {
      this.canvas = dependencies.canvas || this.canvas;
      this.ctx = dependencies.ctx || this.ctx;
    }

    init() {
      this.resize();
    }

    resize() {
      this.blobs.length = 0;
      if (!this.canvas) return;
      const cw = this.canvas.width;
      const ch = this.canvas.height;

      // Low-res scalar field buffer (kept small; upscaled smoothly).
      this.fw = Math.max(40, Math.min(this.config.fieldWidth, cw));
      this.fScale = cw / this.fw;
      this.fh = Math.max(1, Math.round(ch / this.fScale));
      if (!this.fieldCanvas) {
        this.fieldCanvas = document.createElement("canvas");
        this.fieldCtx = this.fieldCanvas.getContext("2d");
      }
      this.fieldCanvas.width = this.fw;
      this.fieldCanvas.height = this.fh;
      this.fieldImage = this.fieldCtx.createImageData(this.fw, this.fh);

      // Wax pool: wide overlapping blobs anchored along the heated base.
      for (let i = 0; i < this.config.poolCount; i++) {
        const r = randomRange(ch * 0.16, ch * 0.26);
        this.blobs.push({
          kind: "pool",
          x: ((i + 0.5) / this.config.poolCount) * cw + randomRange(-30, 30),
          baseY: ch * randomRange(0.97, 1.05),
          y: ch,
          r,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: randomRange(0.15, 0.4),
          vx: 0,
          vy: 0,
        });
      }

      // Risers: globs of wax that detach from the pool, float up, cool, sink.
      for (let i = 0; i < this.config.riserCount; i++) {
        this.blobs.push(this.createRiser(true));
      }
    }

    destroy() {
      this.blobs.length = 0;
    }

    createRiser(anywhere = false) {
      const cw = this.canvas?.width || 1;
      const ch = this.canvas?.height || 1;
      const r = randomRange(ch * 0.05, ch * 0.12);
      return {
        kind: "riser",
        x: randomRange(r, Math.max(r, cw - r)),
        y: anywhere ? randomRange(ch * 0.3, ch * 0.92) : ch * 0.94,
        r,
        vx: randomRange(-4, 4),
        vy: -randomRange(3, 9),
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: randomRange(0.25, 0.7),
      };
    }

    update(now, dt) {
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      for (const b of this.blobs) {
        b.wobble += b.wobbleSpeed * dt;
        if (b.kind === "pool") {
          // The molten base breathes and sways gently.
          b.y = b.baseY + Math.sin(b.wobble) * ch * 0.012;
          b.x += Math.sin(now * 0.0003 + b.wobble) * 6 * dt;
        } else {
          // Viscous convection: hot at the bottom rises, cool top sinks.
          const heat = b.y / ch; // 0 top .. 1 bottom
          const targetVy = -(heat - 0.5) * 2 * 16; // slow px/s
          b.vy += (targetVy - b.vy) * Math.min(1, dt * 0.4);
          b.x += (b.vx + Math.sin(now * 0.0004 + b.wobble) * 9) * dt;
          b.y += b.vy * dt;
          if (b.x < b.r) {
            b.x = b.r;
            b.vx = Math.abs(b.vx);
          } else if (b.x > cw - b.r) {
            b.x = cw - b.r;
            b.vx = -Math.abs(b.vx);
          }
          // Linger at the very top (cooling) and merge back into the pool.
          if (b.y < b.r * 0.6) b.y = b.r * 0.6;
          if (b.y > ch - b.r * 0.2) b.y = ch - b.r * 0.2;
        }
      }
    }

    // Render the metaball field into the offscreen buffer with a heat-graded,
    // glossy wax colour and soft surface alpha.
    renderField(now) {
      const fw = this.fw;
      const fh = this.fh;
      const data = this.fieldImage.data;
      const blobs = this.blobs;
      const nb = blobs.length;
      const inv = 1 / this.fScale;
      // Cache blob field-space coords.
      for (let k = 0; k < nb; k++) {
        const b = blobs[k];
        b._fx = b.x * inv;
        b._fy = b.y * inv;
        const fr = b.r * inv;
        b._fr2 = fr * fr;
      }
      // Wax colour stops: deep red (cool/top) -> bright amber (hot/base).
      const coolR = 150, coolG = 22, coolB = 44;
      const hotR = 255, hotG = 200, hotB = 95;
      let idx = 0;
      for (let py = 0; py < fh; py++) {
        const heatBase = 1 - py / (fh - 1 || 1);
        const shimmer = Math.sin(now * 0.0006 + py * 0.07) * 0.03;
        for (let px = 0; px < fw; px++) {
          let sum = 0;
          for (let k = 0; k < nb; k++) {
            const b = blobs[k];
            const dx = px - b._fx;
            const dy = py - b._fy;
            sum += b._fr2 / (dx * dx + dy * dy + 1);
          }
          if (sum > 0.82) {
            const heat = clamp01(heatBase + shimmer);
            // Soft alpha across the surface band for a rounded, molten edge.
            const a = sum >= 1 ? 255 : ((sum - 0.82) / 0.18) * 255;
            // Surface (thin) areas catch a glossy highlight; deep areas darker.
            const coreT = sum > 1 ? Math.min(1, (sum - 1) / 0.8) : 0;
            const surf = 1 - coreT;
            let r = coolR + (hotR - coolR) * heat;
            let g = coolG + (hotG - coolG) * heat;
            let bl = coolB + (hotB - coolB) * heat;
            const gloss = surf * 0.32;
            data[idx] = r + (255 - r) * gloss;
            data[idx + 1] = g + (255 - g) * gloss;
            data[idx + 2] = bl + (255 - bl) * gloss;
            data[idx + 3] = a;
          } else {
            data[idx + 3] = 0;
          }
          idx += 4;
        }
      }
      this.fieldCtx.putImageData(this.fieldImage, 0, 0);
    }

    draw(now, deltaSeconds = 0.016) {
      if (!this.canvas || !this.ctx) return;
      if (this.blobs.length === 0 || !this.fieldImage) this.resize();

      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const dt = deltaSeconds > 0 ? Math.min(0.05, deltaSeconds) : 0.016;
      const heatPulse = Math.sin(now * 0.00045) * 0.5 + 0.5;

      this.update(now, dt);
      this.renderField(now);

      ctx.save();
      // Warm dark glass body.
      const bg = ctx.createLinearGradient(0, 0, 0, ch);
      bg.addColorStop(0, "#1a0606");
      bg.addColorStop(0.5, "#220a08");
      bg.addColorStop(1, "#0a0302");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      // Heat source glow rising from the base.
      const lampGlow = ctx.createRadialGradient(
        cw * 0.5, ch * 0.96, 0,
        cw * 0.5, ch * 0.96, Math.max(cw, ch) * 0.7
      );
      lampGlow.addColorStop(0, `rgba(255, 170, 70, ${0.22 + heatPulse * 0.1})`);
      lampGlow.addColorStop(0.5, `rgba(220, 70, 40, ${0.1 + heatPulse * 0.05})`);
      lampGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = lampGlow;
      ctx.fillRect(0, 0, cw, ch);

      // Bloom pass: blurred, additive copy of the wax for a molten glow.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.filter = "blur(14px)";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fieldCanvas, 0, 0, this.fw, this.fh, 0, 0, cw, ch);
      ctx.restore();

      // Main wax pass (smoothly upscaled so the low-res field looks gooey).
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fieldCanvas, 0, 0, this.fw, this.fh, 0, 0, cw, ch);
      ctx.restore();

      // Glass sheen down the sides.
      const glass = ctx.createLinearGradient(0, 0, cw, 0);
      glass.addColorStop(0, "rgba(255, 255, 255, 0.04)");
      glass.addColorStop(0.16, "rgba(255, 255, 255, 0)");
      glass.addColorStop(0.8, "rgba(255, 255, 255, 0)");
      glass.addColorStop(1, "rgba(255, 255, 255, 0.06)");
      ctx.fillStyle = glass;
      ctx.fillRect(0, 0, cw, ch);

      const vignette = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.82);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
  }

  /**
   * 8-bit Retro background — a synthwave sunset rendered at low resolution
   * then upscaled with smoothing off for a chunky pixel-art look.
   * Cheap: the scene draws to a tiny offscreen buffer each frame.
   */
  class RetroBackground {
    constructor(config = {}, dependencies = {}) {
      this.config = {
        pixelScale: config.pixelScale ?? 4,
        starCount: config.starCount ?? 44,
      };
      this.canvas = null;
      this.ctx = null;
      this.viewState = null;
      this.buffer = null;
      this.bctx = null;
      this.bw = 1;
      this.bh = 1;
      this.stars = [];
      this.scroll = 0;
      this.configure(dependencies);
    }

    configure(dependencies = {}) {
      this.canvas = dependencies.canvas || this.canvas;
      this.ctx = dependencies.ctx || this.ctx;
      this.viewState = dependencies.viewState || this.viewState;
    }

    init() {
      this.resize();
    }

    resize() {
      if (!this.canvas) return;
      const scale = this.config.pixelScale;
      this.bw = Math.max(1, Math.floor(this.canvas.width / scale));
      this.bh = Math.max(1, Math.floor(this.canvas.height / scale));
      if (!this.buffer) {
        this.buffer = document.createElement("canvas");
        this.bctx = this.buffer.getContext("2d");
      }
      this.buffer.width = this.bw;
      this.buffer.height = this.bh;
      this.stars.length = 0;
      const horizon = this.bh * 0.55;
      for (let i = 0; i < this.config.starCount; i++) {
        this.stars.push({
          x: Math.random() * this.bw,
          y: Math.random() * horizon,
          blink: Math.random() * Math.PI * 2,
          speed: randomRange(1, 3),
        });
      }
    }

    destroy() {
      this.stars.length = 0;
    }

    draw(now, deltaSeconds = 0.016) {
      if (!this.canvas || !this.ctx) return;
      const wantBw = Math.max(1, Math.floor(this.canvas.width / this.config.pixelScale));
      if (!this.buffer || this.bw !== wantBw) this.resize();

      const b = this.bctx;
      const bw = this.bw;
      const bh = this.bh;
      const horizon = Math.floor(bh * 0.55);

      // Center the composition on the VISIBLE area, not the raw canvas, so
      // the sun/grid stay centred when the side panel covers part of it.
      const panelOffset = this.viewState?.isSidePanelOpen
        ? this.viewState.sidePanelWidth
        : 0;
      const visibleCenterBuf =
        ((this.canvas.width - panelOffset) / 2) * (bw / this.canvas.width);

      // Banded sunset sky
      const sky = b.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#2b0a3d");
      sky.addColorStop(0.5, "#7a1f6b");
      sky.addColorStop(1, "#ff5a6e");
      b.fillStyle = sky;
      b.fillRect(0, 0, bw, horizon);

      // Ground
      b.fillStyle = "#0a0220";
      b.fillRect(0, horizon, bw, bh - horizon);

      // Pixel sun with retro scanline gaps
      const sunCx = visibleCenterBuf;
      const sunCy = horizon * 0.62;
      const sunR = Math.min(bw, bh) * 0.16;
      const sunGrad = b.createLinearGradient(0, sunCy - sunR, 0, sunCy + sunR);
      sunGrad.addColorStop(0, "#ffe14d");
      sunGrad.addColorStop(0.5, "#ff9a3c");
      sunGrad.addColorStop(1, "#ff4d6d");
      b.save();
      b.beginPath();
      b.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
      b.clip();
      b.fillStyle = sunGrad;
      b.fillRect(sunCx - sunR, sunCy - sunR, sunR * 2, sunR * 2);
      b.fillStyle = "#0a0220";
      const gapStep = Math.max(2, Math.floor(sunR * 0.2));
      for (let gy = sunCy; gy < sunCy + sunR; gy += gapStep) {
        const gapH = Math.max(1, Math.floor(sunR * 0.08 * ((gy - sunCy) / sunR + 0.3)));
        b.fillRect(sunCx - sunR, gy, sunR * 2, gapH);
      }
      b.restore();

      // Chunky twinkling stars
      for (const s of this.stars) {
        s.blink += deltaSeconds * s.speed;
        const tw = Math.sin(s.blink) * 0.5 + 0.5;
        if (tw < 0.35) continue;
        b.fillStyle = tw > 0.7 ? "#ffffff" : "#b9a7ff";
        b.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
      }

      // Perspective neon grid floor
      this.scroll += deltaSeconds * 0.6;
      if (this.scroll > 1) this.scroll -= 1;
      b.strokeStyle = "#ff3cac";
      b.lineWidth = 1;
      const rows = 12;
      for (let r = 0; r < rows; r++) {
        const t = (r + this.scroll) / rows;
        const y = horizon + (bh - horizon) * (t * t);
        b.globalAlpha = 0.2 + 0.6 * t;
        b.beginPath();
        b.moveTo(0, y);
        b.lineTo(bw, y);
        b.stroke();
      }
      b.globalAlpha = 0.5;
      const vpX = visibleCenterBuf;
      const cols = 12;
      for (let c = 0; c <= cols; c++) {
        const fx = (c / cols) * bw;
        b.beginPath();
        b.moveTo(vpX + (fx - vpX) * 0.06, horizon);
        b.lineTo(fx, bh);
        b.stroke();
      }
      b.globalAlpha = 1;

      // Blit upscaled with smoothing off for crisp pixels
      const ctx = this.ctx;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.buffer, 0, 0, bw, bh, 0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }

  /**
   * Aurora background — slow waving curtains of northern lights over a
   * starry night sky. Additive curtains, smooth and cheap.
   */
  class AuroraBackground {
    constructor(config = {}, dependencies = {}) {
      this.config = {
        bandCount: config.bandCount ?? 4,
        starCount: config.starCount ?? 90,
      };
      this.canvas = null;
      this.ctx = null;
      this.bands = [];
      this.stars = [];
      // Foreground scene cycling along the bottom horizon.
      this.sceneList = ["city", "forest", "ocean"];
      this.sceneIndex = 0;
      this.sceneElapsed = 0;
      this.sceneHold = config.sceneHold ?? 14; // seconds a scene stays
      this.sceneFade = config.sceneFade ?? 3.5; // crossfade duration
      this.sceneData = null;
      this.configure(dependencies);
    }

    configure(dependencies = {}) {
      this.canvas = dependencies.canvas || this.canvas;
      this.ctx = dependencies.ctx || this.ctx;
    }

    init() {
      this.resize();
    }

    resize() {
      this.bands.length = 0;
      this.stars.length = 0;
      if (!this.canvas) return;
      const ch = this.canvas.height;
      const palette = [
        { r: 64, g: 224, b: 170 },
        { r: 72, g: 170, b: 255 },
        { r: 160, g: 96, b: 255 },
        { r: 64, g: 255, b: 160 },
        { r: 120, g: 230, b: 255 },
      ];
      for (let i = 0; i < this.config.bandCount; i++) {
        this.bands.push({
          color: palette[i % palette.length],
          baseY: randomRange(ch * 0.15, ch * 0.55),
          amp: randomRange(ch * 0.08, ch * 0.2),
          freq: randomRange(0.6, 1.5),
          // Much slower drift for a calm, smooth wave.
          speed: randomRange(0.00006, 0.00016) * (Math.random() < 0.5 ? -1 : 1),
          phase: Math.random() * Math.PI * 2,
          thickness: randomRange(ch * 0.12, ch * 0.28),
          // Independent slow alpha breathing so curtains brighten and fade.
          alphaPhase: Math.random() * Math.PI * 2,
          alphaSpeed: randomRange(0.00012, 0.00028),
        });
      }
      for (let i = 0; i < this.config.starCount; i++) {
        this.stars.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height * 0.6,
          r: Math.random() * 1.2 + 0.3,
          tw: Math.random() * Math.PI * 2,
        });
      }
      this.buildScenes();
    }

    destroy() {
      this.bands.length = 0;
      this.stars.length = 0;
      this.sceneData = null;
    }

    // Horizon line where foreground scenes sit.
    horizonY() {
      return this.canvas.height * 0.62;
    }

    // Precompute deterministic geometry for each foreground scene so the
    // silhouettes stay stable frame-to-frame (only lights/water animate).
    buildScenes() {
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const horizon = this.horizonY();

      // --- Night city skyline ---
      const buildings = [];
      let bx = -randomRange(0, 30);
      while (bx < cw + 20) {
        const w = randomRange(26, 64);
        const h = randomRange(ch * 0.1, ch * 0.34);
        const top = ch - h;
        const windows = [];
        const cols = Math.max(1, Math.floor(w / 9));
        const rows = Math.max(1, Math.floor(h / 12));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (Math.random() < 0.4) continue; // many windows dark
            windows.push({
              dx: 4 + c * 9,
              dy: 6 + r * 12,
              s: 3,
              phase: Math.random() * Math.PI * 2,
              flick: randomRange(0.2, 1.4),
              thresh: randomRange(0.1, 0.7),
              warm: Math.random() < 0.7,
            });
          }
        }
        buildings.push({ x: bx, w, top, h, windows });
        bx += w + randomRange(1, 7);
      }

      // --- Forest with mountains ---
      // Two layered ranges: a taller distant range behind a shorter near one.
      // Each ridge is ridged-noise (sharp peaks) rather than a few giant
      // triangles, and snow caps are clipped to the silhouette above a
      // snowline so they scale with each peak.
      const mountains = [
        {
          pts: this.makeRidge(cw, horizon + ch * 0.01, ch * 0.34, 92),
          color: ["#141d33", "#0a1120"],
          snowLineY: horizon - ch * 0.16,
        },
        {
          pts: this.makeRidge(cw, horizon + ch * 0.03, ch * 0.22, 84),
          color: ["#0c1322", "#060b16"],
          snowLineY: horizon - ch * 0.06,
        },
      ];

      const trees = [];
      let tx = -randomRange(0, 30);
      while (tx < cw + 30) {
        // Larger pines, with depth variation.
        const th = randomRange(ch * 0.12, ch * 0.26);
        trees.push({
          x: tx,
          h: th,
          w: th * randomRange(0.5, 0.72),
          snowy: Math.random() < 0.6,
        });
        tx += th * randomRange(0.28, 0.5);
      }

      // --- Ocean with icebergs ---
      const icebergs = [];
      const count = Math.floor(randomRange(4, 7));
      for (let i = 0; i < count; i++) {
        const w = randomRange(cw * 0.06, cw * 0.16);
        const h = randomRange(ch * 0.05, ch * 0.14);
        // Jagged, crystalline top profile with one dominant peak.
        const n = Math.floor(randomRange(4, 7));
        const peakAt = randomRange(0.32, 0.68);
        const sharp = randomRange(1.4, 2.2);
        const verts = [];
        let peakIdx = 0;
        for (let j = 0; j <= n; j++) {
          const t = j / n;
          const tent = clamp01(1 - Math.abs(t - peakAt) * sharp);
          const hh = h * (0.22 + tent * 0.78) * randomRange(0.82, 1.05);
          verts.push({ x: -w / 2 + t * w, y: -hh });
          if (verts[j].y < verts[peakIdx].y) peakIdx = j;
        }
        icebergs.push({
          baseX: randomRange(0, cw),
          baseY: horizon + randomRange(ch * 0.02, ch * 0.18),
          w,
          h,
          verts,
          peakIdx,
          phase: Math.random() * Math.PI * 2,
          bobAmp: randomRange(ch * 0.004, ch * 0.011),
          bobSpeed: randomRange(0.0004, 0.0009),
          swaySpeed: randomRange(0.0003, 0.0007),
          drift: randomRange(-7, 7) / 1000, // px per ms
        });
      }
      icebergs.sort((a, b) => a.baseY - b.baseY);

      this.sceneData = { buildings, mountains, trees, icebergs };
    }

    // Ridged-noise mountain silhouette: summed |sin| octaves give sharp peaks.
    makeRidge(cw, baseY, amp, points) {
      const oct = [
        { f: 1, a: 1.0, p: Math.random() * Math.PI * 2 },
        { f: 2.3, a: 0.5, p: Math.random() * Math.PI * 2 },
        { f: 4.7, a: 0.26, p: Math.random() * Math.PI * 2 },
        { f: 9.1, a: 0.13, p: Math.random() * Math.PI * 2 },
      ];
      const sumA = oct.reduce((s, o) => s + o.a, 0);
      const pts = [];
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * cw;
        let h = 0;
        for (const o of oct) {
          h += (1 - Math.abs(Math.sin((x / cw) * Math.PI * o.f + o.p))) * o.a;
        }
        const elevation = h / sumA; // 0..1, sharp ridge peaks
        pts.push({ x, y: baseY - elevation * amp });
      }
      return pts;
    }

    drawScene(name, alpha, now) {
      if (!this.sceneData || alpha <= 0.01) return;
      if (name === "city") this.drawCity(alpha, now);
      else if (name === "forest") this.drawForest(alpha, now);
      else this.drawOcean(alpha, now);
    }

    drawCity(alpha, now) {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      ctx.save();
      ctx.globalAlpha = alpha;
      // Light-pollution haze glowing up from behind the skyline.
      const haze = ctx.createLinearGradient(0, ch * 0.5, 0, ch);
      haze.addColorStop(0, "rgba(90, 60, 130, 0)");
      haze.addColorStop(1, "rgba(120, 70, 140, 0.16)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, ch * 0.5, cw, ch * 0.5);
      for (const b of this.sceneData.buildings) {
        ctx.fillStyle = "#070a14";
        ctx.fillRect(b.x, b.top, b.w, b.h);
        for (const win of b.windows) {
          const lit = Math.sin(now * 0.001 * win.flick + win.phase) > win.thresh;
          if (!lit) continue;
          ctx.fillStyle = win.warm
            ? "rgba(255, 206, 120, 0.85)"
            : "rgba(150, 205, 255, 0.8)";
          ctx.fillRect(b.x + win.dx, b.top + win.dy, win.s, win.s * 1.4);
        }
      }
      ctx.restore();
    }

    // Build the closed silhouette path for a mountain range (ridge + base).
    ridgePath(ctx, pts, cw, ch) {
      ctx.beginPath();
      ctx.moveTo(0, ch);
      ctx.lineTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(cw, ch);
      ctx.closePath();
    }

    drawRange(range, now) {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;

      // Mountain body
      this.ridgePath(ctx, range.pts, cw, ch);
      const mg = ctx.createLinearGradient(0, this.horizonY() - ch * 0.34, 0, ch);
      mg.addColorStop(0, range.color[0]);
      mg.addColorStop(1, range.color[1]);
      ctx.fillStyle = mg;
      ctx.fill();

      // Snow caps: clip to the mountain, then fill everything above a jagged
      // snowline. Only the peaks poke above it, so caps scale with the peaks.
      ctx.save();
      this.ridgePath(ctx, range.pts, cw, ch);
      ctx.clip();
      const sy = range.snowLineY;
      const grad = ctx.createLinearGradient(0, sy - ch * 0.1, 0, sy + ch * 0.05);
      grad.addColorStop(0, "rgba(236, 246, 255, 0.92)");
      grad.addColorStop(1, "rgba(200, 220, 245, 0.55)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cw, 0);
      const stepN = 48;
      for (let i = stepN; i >= 0; i--) {
        const x = (i / stepN) * cw;
        const jag = Math.sin(x * 0.05 + range.pts.length) * ch * 0.012;
        const jag2 = Math.sin(x * 0.013 + 2) * ch * 0.02;
        ctx.lineTo(x, sy + jag + jag2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawForest(alpha, now) {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      ctx.save();
      ctx.globalAlpha = alpha;

      // Distant range behind, near range in front.
      for (const range of this.sceneData.mountains) this.drawRange(range, now);

      // Foreground pines (larger, fuller, with occasional snow on the boughs).
      for (const t of this.sceneData.trees) {
        const baseY = ch;
        const layers = 4;
        // Trunk
        ctx.fillStyle = "#0a0d10";
        ctx.fillRect(t.x - t.w * 0.05, baseY - t.h * 0.12, t.w * 0.1, t.h * 0.12);
        for (let l = 0; l < layers; l++) {
          const ly = baseY - (t.h * l) / layers;
          const lw = t.w * (1 - (l / layers) * 0.55);
          const lh = (t.h / layers) * 1.6;
          ctx.fillStyle = "#05090b";
          ctx.beginPath();
          ctx.moveTo(t.x, ly - lh);
          ctx.lineTo(t.x - lw / 2, ly);
          ctx.lineTo(t.x + lw / 2, ly);
          ctx.closePath();
          ctx.fill();
          // Snow dusting on the upper boughs
          if (t.snowy && l >= layers - 2) {
            ctx.fillStyle = "rgba(225, 238, 252, 0.5)";
            ctx.beginPath();
            ctx.moveTo(t.x, ly - lh);
            ctx.lineTo(t.x - lw * 0.26, ly - lh * 0.42);
            ctx.lineTo(t.x + lw * 0.26, ly - lh * 0.42);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    drawOcean(alpha, now) {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const horizon = this.horizonY();
      ctx.save();
      ctx.globalAlpha = alpha;

      // Sea surface
      const water = ctx.createLinearGradient(0, horizon, 0, ch);
      water.addColorStop(0, "#0a2236");
      water.addColorStop(1, "#03101c");
      ctx.fillStyle = water;
      ctx.fillRect(0, horizon, cw, ch - horizon);

      // Shimmering aurora reflection on the water
      ctx.globalCompositeOperation = "lighter";
      const lines = 26;
      for (let i = 0; i < lines; i++) {
        const yy = horizon + (i / lines) * (ch - horizon);
        const sway = Math.sin(now * 0.0008 + i * 0.6) * 0.5 + 0.5;
        const a = (1 - i / lines) * 0.05 * sway * alpha;
        ctx.strokeStyle = `rgba(120, 220, 200, ${a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yy + Math.sin(now * 0.001 + i) * 1.5);
        ctx.lineTo(cw, yy + Math.cos(now * 0.0012 + i) * 1.5);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      // Icebergs: refined crystalline silhouettes that bob, sway and drift.
      const traceTop = (verts, w) => {
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        for (const v of verts) ctx.lineTo(v.x, v.y);
        ctx.lineTo(w / 2, 0);
        ctx.closePath();
      };
      for (const ice of this.sceneData.icebergs) {
        // Animate: slow horizontal drift (wrapped), vertical bob, gentle sway.
        const x = (((ice.baseX + now * ice.drift) % cw) + cw) % cw;
        const y = ice.baseY + Math.sin(now * ice.bobSpeed + ice.phase) * ice.bobAmp;
        const sway = Math.sin(now * ice.swaySpeed + ice.phase) * 0.045;
        const peak = ice.verts[ice.peakIdx];

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(sway);

        // Reflection in the water (squashed, faded), drawn beneath the berg.
        ctx.save();
        ctx.scale(1, -0.5);
        ctx.globalAlpha = alpha * 0.14;
        ctx.fillStyle = "#9fc0d8";
        traceTop(ice.verts, ice.w);
        ctx.fill();
        ctx.restore();

        // Body
        ctx.fillStyle = "rgba(140, 172, 198, 0.96)";
        traceTop(ice.verts, ice.w);
        ctx.fill();

        // Two facets meeting at the dominant peak give a 3D, crystalline read.
        ctx.fillStyle = "rgba(222, 238, 252, 0.92)"; // sunlit left face
        ctx.beginPath();
        ctx.moveTo(-ice.w / 2, 0);
        ctx.lineTo(peak.x, peak.y);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(86, 116, 146, 0.92)"; // shadowed right face
        ctx.beginPath();
        ctx.moveTo(ice.w / 2, 0);
        ctx.lineTo(peak.x, peak.y);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        // Bright waterline rim
        ctx.strokeStyle = "rgba(235, 248, 255, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-ice.w / 2, 0);
        ctx.lineTo(ice.w / 2, 0);
        ctx.stroke();

        ctx.restore();
      }
      ctx.restore();
    }

    draw(now, deltaSeconds = 0.016) {
      if (!this.canvas || !this.ctx) return;
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;

      ctx.save();
      const sky = ctx.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, "#020417");
      sky.addColorStop(0.6, "#04102a");
      sky.addColorStop(1, "#071b2e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, ch);

      for (const s of this.stars) {
        const a = 0.3 + (Math.sin(now * 0.002 + s.tw) * 0.5 + 0.5) * 0.6;
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "lighter";
      const step = Math.max(6, Math.floor(cw / 160));
      for (const band of this.bands) {
        const phase = now * band.speed + band.phase;
        const waveAt = (x) =>
          Math.sin(x * 0.004 * band.freq + phase) * band.amp +
          Math.sin(x * 0.0013 + phase * 1.7) * band.amp * 0.4;
        // Slow alpha breathing: each curtain swells and fades independently.
        const alphaMul =
          0.45 + (Math.sin(now * band.alphaSpeed + band.alphaPhase) * 0.5 + 0.5) * 0.55;
        ctx.beginPath();
        let first = true;
        for (let x = 0; x <= cw; x += step) {
          const y = band.baseY + waveAt(x);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        for (let x = cw; x >= 0; x -= step) {
          ctx.lineTo(x, band.baseY + waveAt(x) + band.thickness);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(
          0,
          band.baseY - band.amp,
          0,
          band.baseY + band.thickness
        );
        grad.addColorStop(0, rgba(band.color, 0));
        grad.addColorStop(0.35, rgba(band.color, 0.32 * alphaMul));
        grad.addColorStop(0.7, rgba(band.color, 0.14 * alphaMul));
        grad.addColorStop(1, rgba(band.color, 0));
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // Cycling foreground scene along the bottom: city -> forest -> ocean,
      // each holding for a while then crossfading to the next.
      const dt = deltaSeconds > 0 ? deltaSeconds : 0.016;
      this.sceneElapsed += dt;
      let t = 0;
      if (this.sceneElapsed > this.sceneHold) {
        t = Math.min(1, (this.sceneElapsed - this.sceneHold) / this.sceneFade);
      }
      const cur = this.sceneList[this.sceneIndex];
      if (t <= 0) {
        this.drawScene(cur, 1, now);
      } else {
        const nxt = this.sceneList[(this.sceneIndex + 1) % this.sceneList.length];
        this.drawScene(cur, 1 - t, now);
        this.drawScene(nxt, t, now);
        if (t >= 1) {
          this.sceneIndex = (this.sceneIndex + 1) % this.sceneList.length;
          this.sceneElapsed = 0;
        }
      }

      ctx.restore();
    }
  }

  /**
   * Matrix background — calm digital rain of glowing glyphs. Trails are faint
   * and slow with rare brighter streaks; every so often a falling trail spells
   * out a famous line from The Matrix before dissolving back into glyphs.
   */
  class MatrixBackground {
    constructor(config = {}, dependencies = {}) {
      this.config = {
        fontSize: config.fontSize ?? 16,
        trail: config.trail ?? 14,
        maxQuotes: config.maxQuotes ?? 2,
      };
      this.canvas = null;
      this.ctx = null;
      this.getNodes = () => [];
      this.columns = [];
      this.quoteTimer = randomRange(4, 9);
      // Smoothed network state drivers (0..1).
      this.infectedRatio = 0;
      this.downRatio = 0;
      this.glyphs =
        "アイウエオカキクケコサシスセソタチツテトナニヌネ0123456789ABCDEF#$%*+-<>".split("");
      this.quotes = [
        "WAKE UP NEO",
        "THE MATRIX HAS YOU",
        "FOLLOW THE WHITE RABBIT",
        "KNOCK KNOCK",
        "THERE IS NO SPOON",
        "FREE YOUR MIND",
        "I KNOW KUNG FU",
        "WELCOME TO THE REAL WORLD",
        "RED PILL OR BLUE PILL",
        "DODGE THIS",
      ];
      this.configure(dependencies);
    }

    configure(dependencies = {}) {
      this.canvas = dependencies.canvas || this.canvas;
      this.ctx = dependencies.ctx || this.ctx;
      this.getNodes = dependencies.getNodes || this.getNodes;
    }

    init() {
      this.resize();
    }

    resize() {
      this.columns.length = 0;
      if (!this.canvas) return;
      const fs = this.config.fontSize;
      const count = Math.ceil(this.canvas.width / fs);
      for (let i = 0; i < count; i++) {
        this.columns.push(this.createColumn(i * fs));
      }
    }

    destroy() {
      this.columns.length = 0;
    }

    randGlyph() {
      return this.glyphs[Math.floor(Math.random() * this.glyphs.length)];
    }

    // Sample the live network: ratio of infected (malware/botnet/C&C) and
    // down (red) nodes drives the rain's mood.
    sampleState() {
      const nodes = typeof this.getNodes === "function" ? this.getNodes() : [];
      let alive = 0;
      let infected = 0;
      let down = 0;
      for (const n of nodes) {
        if (n.state !== "alive" || n.isSatellite) continue;
        alive++;
        if (
          n.status === "malware" ||
          n.status === "botnet" ||
          n.status === "commandControl"
        ) {
          infected++;
        }
        if (n.status === "red") down++;
      }
      return alive > 0
        ? { infectedRatio: infected / alive, downRatio: down / alive }
        : { infectedRatio: 0, downRatio: 0 };
    }

    // Fraction of columns that actively rain. "Mostly down" makes it sparse.
    activeFraction() {
      const quiet = clamp01((this.downRatio - 0.1) / 0.5);
      return 0.15 + (1 - quiet) * 0.85;
    }

    // Occasionally a drop is infected (purple) or failing (red); chance grows
    // with the corresponding network state.
    chooseTint() {
      const purpleChance = 0.03 + this.infectedRatio * 0.5;
      const redChance = 0.03 + this.downRatio * 0.35 + this.infectedRatio * 0.1;
      const r = Math.random();
      if (r < purpleChance) return "purple";
      if (r < purpleChance + redChance) return "red";
      return "green";
    }

    createColumn(x) {
      const len = Math.floor(randomRange(8, 8 + this.config.trail));
      return {
        x,
        // Row-based head position keeps glyphs snapped to the grid (no jitter).
        headF: -randomRange(0, 40),
        speed: randomRange(2, 5.5), // rows per second (slower = calmer)
        len,
        // Stable glyph buffer; mutated only rarely so it doesn't flicker.
        chars: Array.from({ length: len }, () => this.randGlyph()),
        bright: 0, // streak intensity, decays over time
        dim: randomRange(0.04, 0.1), // very faint baseline brightness
        streakRate: randomRange(0.012, 0.045), // chance/sec of a bright streak
        isQuote: false,
        tint: this.chooseTint(),
        enabled: Math.random() < this.activeFraction(),
      };
    }

    // Turn a column into a falling Matrix quote. Letters are stored tail->head
    // (reversed) so the line reads top-to-bottom as it descends.
    createQuoteColumn(x) {
      const text = this.quotes[Math.floor(Math.random() * this.quotes.length)];
      const letters = text.toUpperCase().split("").reverse();
      return {
        x,
        headF: -randomRange(1, letters.length * 0.5),
        speed: randomRange(2, 3.2), // slower so it stays readable
        len: letters.length,
        chars: letters,
        bright: 0,
        dim: 0.06,
        streakRate: 0,
        isQuote: true,
        tint: "green",
        enabled: true,
      };
    }

    draw(now, deltaSeconds = 0.016) {
      if (!this.canvas || !this.ctx) return;
      if (this.columns.length === 0) this.resize();

      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const fs = this.config.fontSize;
      const rowsOnScreen = ch / fs;
      const dt = deltaSeconds > 0 ? deltaSeconds : 0.016;

      // Sample + smooth the network state, then derive mood drivers.
      const s = this.sampleState();
      const lerp = Math.min(1, dt * 0.6);
      this.infectedRatio += (s.infectedRatio - this.infectedRatio) * lerp;
      this.downRatio += (s.downRatio - this.downRatio) * lerp;
      // Chaos peaks when malware is the majority; quiet peaks when mostly down.
      const chaos = clamp01((this.infectedRatio - 0.1) / 0.5);
      const quiet = clamp01((this.downRatio - 0.1) / 0.5);
      const speedMul = Math.max(0.15, (1 + chaos * 1.4) * (1 - quiet * 0.8));
      const brightnessMul = Math.max(0.12, (1 + chaos * 0.5) * (1 - quiet * 0.7));
      const mutateMul = (0.5 + chaos * 7) * (1 - quiet * 0.9);
      const streakMul = (1 + chaos * 8) * (1 - quiet * 0.95);

      // Quotes fire more often (and more of them) the more chaotic things get.
      this.quoteTimer -= dt;
      if (this.quoteTimer <= 0) {
        this.quoteTimer = randomRange(7, 16) * (1 - chaos * 0.55);
        const maxQuotes = this.config.maxQuotes + Math.round(chaos * 2);
        const activeQuotes = this.columns.reduce(
          (n, c) => n + (c.isQuote ? 1 : 0),
          0
        );
        if (activeQuotes < maxQuotes && this.columns.length > 0) {
          const idx = Math.floor(Math.random() * this.columns.length);
          if (!this.columns[idx].isQuote) {
            this.columns[idx] = this.createQuoteColumn(this.columns[idx].x);
          }
        }
      }

      ctx.save();
      ctx.fillStyle = "#000300";
      ctx.fillRect(0, 0, cw, ch);
      // Faint mood wash: purple when infected, cold blue when mostly down.
      if (chaos > 0.01) {
        ctx.fillStyle = `rgba(40, 0, 55, ${chaos * 0.14})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (quiet > 0.01) {
        ctx.fillStyle = `rgba(0, 6, 16, ${quiet * 0.2})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      ctx.font = `${fs}px monospace`;
      ctx.textBaseline = "top";

      for (const col of this.columns) {
        if (!col.isQuote) {
          // Decay any streak, then ignite new ones at a state-scaled rate.
          col.bright = Math.max(0, col.bright - dt / 1.3);
          if (Math.random() < dt * col.streakRate * streakMul) col.bright = 1;
          // Glyph churn scales with chaos (calm shimmer -> frantic flicker).
          if (Math.random() < dt * mutateMul) {
            col.chars[Math.floor(Math.random() * col.len)] = this.randGlyph();
          }
        }

        col.headF += col.speed * speedMul * dt;
        if (col.headF - col.len > rowsOnScreen) {
          // Quotes show once then revert to ordinary rain (re-rolls tint/enabled).
          this.columns[this.columns.indexOf(col)] = this.createColumn(col.x);
          continue;
        }

        // Dormant columns (sparse "quiet" state) still fall but aren't drawn.
        if (!col.enabled && !col.isQuote) continue;

        const headRow = Math.floor(col.headF);
        for (let k = 0; k < col.len; k++) {
          const row = headRow - k;
          if (row < 0) continue;
          const gy = row * fs;
          if (gy > ch) continue;
          const glyph = col.chars[k];
          if (glyph === " ") continue; // word gaps in quotes
          const fade = 1 - k / col.len;

          if (col.isQuote) {
            // Readable, steady glow; leading letter brightest.
            if (k === 0) {
              ctx.fillStyle = "rgba(225, 255, 230, 0.95)";
            } else {
              const a = 0.32 + fade * 0.6;
              ctx.fillStyle = `rgba(180, 255, 195, ${a})`;
            }
          } else if (k === 0) {
            const a = (0.16 + col.bright * 0.7) * brightnessMul;
            if (col.tint === "purple") {
              ctx.fillStyle = `rgba(228, 190, 255, ${a})`;
            } else if (col.tint === "red") {
              ctx.fillStyle = `rgba(255, 175, 175, ${a})`;
            } else {
              ctx.fillStyle =
                col.bright > 0.5
                  ? `rgba(200, 255, 205, ${a})`
                  : `rgba(110, 200, 130, ${a})`;
            }
          } else {
            const a = (col.dim * fade + col.bright * fade * 0.6) * brightnessMul;
            if (col.tint === "purple") {
              const g = Math.floor(45 + col.bright * 60);
              ctx.fillStyle = `rgba(150, ${g}, 230, ${a})`;
            } else if (col.tint === "red") {
              const g = Math.floor(30 + col.bright * 45);
              ctx.fillStyle = `rgba(220, ${g}, ${g + 8}, ${a})`;
            } else {
              const g = Math.floor(110 + col.bright * 120);
              ctx.fillStyle = `rgba(0, ${g}, 50, ${a})`;
            }
          }
          ctx.fillText(glyph, col.x, gy);
        }
      }
      ctx.restore();
    }
  }

  registerBackgroundFactory("void", (backgroundConfig, deps) =>
    new VoidBackground(backgroundConfig, deps)
  );

  registerBackgroundFactory("galaxy", (backgroundConfig, deps) =>
    new GalaxyBackground(backgroundConfig, deps)
  );

  registerBackgroundFactory("mood", (backgroundConfig, deps) =>
    new MoodBackground(backgroundConfig, deps)
  );

  registerBackgroundFactory("lava", (backgroundConfig, deps) =>
    new LavaBackground(backgroundConfig, deps)
  );

  registerBackgroundFactory("retro", (backgroundConfig, deps) =>
    new RetroBackground(backgroundConfig, deps)
  );

  registerBackgroundFactory("aurora", (backgroundConfig, deps) =>
    new AuroraBackground(backgroundConfig, deps)
  );

  registerBackgroundFactory("matrix", (backgroundConfig, deps) =>
    new MatrixBackground(backgroundConfig, deps)
  );

  /**
   * Registry for swappable background renderers.
   *
   * A new background registers an id and factory that returns an object with
   * init(), resize(), draw(now, deltaSeconds), and optional destroy().
   */
  class BackgroundSystem {
    constructor(config = {}, dependencies = {}) {
      this.config = config || {};
      this.dependencies = dependencies || {};
      this.registry = new Map(backgroundFactories);
      this.activeId = this.config.active || "galaxy";
      this.active = null;
      this.initialized = false;

      this.setActive(this.activeId);
    }

    static register(id, factory) {
      registerBackgroundFactory(id, factory);
    }

    register(id, factory) {
      if (!id || typeof factory !== "function") return;
      this.registry.set(id, factory);
    }

    configure(dependencies = {}) {
      this.dependencies = { ...this.dependencies, ...dependencies };
      if (this.active && typeof this.active.configure === "function") {
        this.active.configure(this.dependencies);
      }
    }

    setActive(id) {
      const nextId = id || "galaxy";
      const factory = this.registry.get(nextId);
      if (!factory) {
        throw new Error(`Unknown NodeNet background: ${nextId}`);
      }

      if (this.active && typeof this.active.destroy === "function") {
        this.active.destroy();
      }

      this.activeId = nextId;
      this.active = factory(this.getBackgroundConfig(nextId), this.dependencies);
      if (this.initialized && typeof this.active.init === "function") {
        this.active.init();
      }
    }

    init() {
      this.initialized = true;
      if (this.active && typeof this.active.init === "function") {
        this.active.init();
      }
    }

    resize() {
      if (this.active && typeof this.active.resize === "function") {
        this.active.resize();
      }
    }

    draw(now, deltaSeconds = null) {
      if (this.active && typeof this.active.draw === "function") {
        this.active.draw(now, deltaSeconds);
      }
    }

    getBackgroundConfig(id) {
      return this.config[id] || {};
    }
  }

  window.NodeNet.BackgroundSystem = BackgroundSystem;
  window.NodeNet.GalaxyBackground = GalaxyBackground;
  window.NodeNet.MoodBackground = MoodBackground;
  window.NodeNet.LavaBackground = LavaBackground;
  window.NodeNet.RetroBackground = RetroBackground;
  window.NodeNet.AuroraBackground = AuroraBackground;
  window.NodeNet.MatrixBackground = MatrixBackground;
  window.NodeNet.registerBackground = registerBackgroundFactory;
})();
