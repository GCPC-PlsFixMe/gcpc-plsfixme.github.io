/**
 * @module ParticleSystem
 * @summary Particles + visual effects — object-pooled pop particles and honeypot conversion (honeycomb) streams.
 * @exports window.NodeNet.ParticleSystem
 * @tags particles, effects, pop, object-pool, honeycomb, honeypot, vfx, juice
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const ObjectPool = window.NodeNetObjectPool;
  if (!ObjectPool) {
    throw new Error("NodeNetObjectPool must load before particle-system.js");
  }

  const dependencies = {
    ctx: null,
    config: {},
    getNodes: () => [],
    getColors: () => ({}),
    getPacketSpeedMultiplier: () => 1,
    promoteToGuardian: () => {},
    logEvent: () => {},
    incrementStat: () => {},
  };

  let ctx = null;
  let config = {};
  let packetSpeedMultiplier = 1;

  function refreshRuntimeState() {
    ctx = dependencies.ctx;
    config = dependencies.config || {};
    packetSpeedMultiplier =
      typeof dependencies.getPacketSpeedMultiplier === "function"
        ? dependencies.getPacketSpeedMultiplier()
        : 1;
  }

  function getNodes() {
    return typeof dependencies.getNodes === "function"
      ? dependencies.getNodes()
      : [];
  }

  function getColors() {
    return typeof dependencies.getColors === "function"
      ? dependencies.getColors()
      : {};
  }

  function promoteToGuardian(node, logKey) {
    dependencies.promoteToGuardian(node, logKey);
  }

  function logEvent(key, context) {
    dependencies.logEvent(key, context);
  }

  function incrementStat(statName) {
    dependencies.incrementStat(statName);
  }

  // --------------------------------------------------------------------------
  // PARTICLE CLASS
  // --------------------------------------------------------------------------

  class Particle {
    constructor(x, y, color) {
      this.reset(x, y, color);
    }

    /**
     * Reset particle state for pool reuse
     */
    reset(x, y, color) {
      this.x = x || 0;
      this.y = y || 0;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.radius = Math.random() * 2 + 1;
      this.life = 30 + Math.random() * 30;
      this.initialLife = this.life;
      this.color = color || { r: 255, g: 255, b: 255 };
      this.pooled = true;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.98;
      this.vy *= 0.98;
      this.life -= 1;
    }

    draw() {
      if (this.life <= 0) return;
      const opacity = this.life / this.initialLife;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${opacity})`;
      ctx.fill();
    }
  }

  // --------------------------------------------------------------------------
  // PARTICLE POOL
  // --------------------------------------------------------------------------

  const particleClassPool = new ObjectPool(
    () => new Particle(0, 0, { r: 255, g: 255, b: 255 }),
    (p, x, y, color) => p.reset(x, y, color),
    50
  );

  let particles = [];

  // --------------------------------------------------------------------------
  // POP PARTICLES (PUBLIC FACTORY)
  // --------------------------------------------------------------------------

  function createPopParticles(x, y, color) {
    const nodes = getNodes();
    const threshold = config.performance?.particlesDisableAt ?? 300;
    if (nodes.length > threshold) return;

    const particleCount = 4;
    for (let i = 0; i < particleCount; i++) {
      const particle = particleClassPool.acquire(x, y, color);
      particles.push(particle);
    }
  }

  // --------------------------------------------------------------------------
  // MANAGE PARTICLES
  // --------------------------------------------------------------------------

  function manageParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw();
      if (p.life <= 0) {
        if (p.pooled) {
          particleClassPool.release(p);
        }
        particles.splice(i, 1);
      }
    }
  }

  // --------------------------------------------------------------------------
  // HONEYCOMB STREAM CLASS
  // --------------------------------------------------------------------------

  class HoneycombStream {
    constructor(sourceNode, targetNode) {
      this.source = sourceNode;
      this.target = targetNode;
      this.active = true;
      this.particles = [];
      this.conversionTriggered = false;

      const streamCount = 10;
      for (let i = 0; i < streamCount; i++) {
        this.particles.push({
          progress: -i * 0.1,
          speed: 0.022,
          rotation: i * 0.2,
          rotationSpeed: 0.06,
          size: 4.5,
          reached: false,
        });
      }
    }

    update() {
      if (!this.active) return;

      if (!this.target || this.target.state !== "alive") {
        this.active = false;
        return;
      }

      let allReached = true;

      this.particles.forEach((p) => {
        if (p.reached) return;
        allReached = false;

        p.progress += p.speed * packetSpeedMultiplier;

        if (p.progress >= 1) {
          p.reached = true;
          p.progress = 1;

          const colors = getColors();
          createPopParticles(
            this.target.x,
            this.target.y,
            colors.honeypot || { r: 255, g: 193, b: 7 }
          );

          if (!this.conversionTriggered) {
            this.conversionTriggered = true;
            const attacker = this.target;

            if (attacker.status !== "green") {
              attacker.status = "green";
              attacker.statusChangedAt = Date.now();
              attacker.isBeingInfected = false;
              attacker.spreadingInfections = [];

              promoteToGuardian(attacker, null);
              logEvent("honeypotConversion", {
                honeypot: this.source,
                attacker: attacker,
              });
              incrementStat("totalRecoveries");
            }
          }
        }
      });

      if (allReached) {
        this.active = false;
      }
    }

    draw() {
      if (!this.active) return;

      const dx = this.target.x - this.source.x;
      const dy = this.target.y - this.source.y;
      const colors = getColors();
      const honeypotColor = colors.honeypot || { r: 255, g: 193, b: 7 };

      // First pass: glowing beam
      ctx.save();
      ctx.beginPath();
      let beamStarted = false;
      let beamAlpha = 0;

      this.particles.forEach((p) => {
        if (p.progress < 0 || p.reached) return;

        const x = this.source.x + dx * p.progress;
        const y = this.source.y + dy * p.progress;

        if (!beamStarted) {
          ctx.moveTo(x, y);
          beamStarted = true;
          beamAlpha = Math.min(1, p.progress * 4);
        } else {
          ctx.lineTo(x, y);
        }
      });

      if (beamStarted) {
        ctx.strokeStyle = `rgba(255, 200, 50, ${beamAlpha * 0.8})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(255, 180, 0, 0.8)";
        ctx.shadowBlur = 8;
        ctx.stroke();
      }
      ctx.restore();

      // Second pass: hexagonal packets
      this.particles.forEach((p) => {
        if (p.progress < 0 || p.reached) return;

        const x = this.source.x + dx * p.progress;
        const y = this.source.y + dy * p.progress;

        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rotation);

        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const hexAngle = (j / 6) * Math.PI * 2 - Math.PI / 6;
          const hx = Math.cos(hexAngle) * p.size;
          const hy = Math.sin(hexAngle) * p.size;
          if (j === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        const alpha = Math.min(1, p.progress * 4);
        ctx.fillStyle = `rgba(${honeypotColor.r}, ${honeypotColor.g}, ${honeypotColor.b}, ${alpha * 0.9})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 220, 100, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();

        ctx.restore();
      });
    }
  }

  // --------------------------------------------------------------------------
  // HONEYCOMB STREAM POOL
  // --------------------------------------------------------------------------

  let honeycombStreams = [];

  // --------------------------------------------------------------------------
  // MANAGE HONEYCOMB STREAMS
  // --------------------------------------------------------------------------

  function manageHoneycombStreams() {
    for (let i = honeycombStreams.length - 1; i >= 0; i--) {
      const stream = honeycombStreams[i];
      stream.update();
      stream.draw();
      if (!stream.active) {
        honeycombStreams.splice(i, 1);
      }
    }
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  const ParticleSystem = {
    /**
     * Connect app-owned state, draw context, and helper callbacks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    Particle,
    HoneycombStream,

    createPopParticles,

    manageParticles() {
      refreshRuntimeState();
      manageParticles();
    },

    manageHoneycombStreams() {
      refreshRuntimeState();
      manageHoneycombStreams();
    },

    createHoneycombStream(sourceNode, targetNode) {
      const stream = new HoneycombStream(sourceNode, targetNode);
      honeycombStreams.push(stream);
      return stream;
    },

    getParticles() {
      return particles;
    },

    getHoneycombStreams() {
      return honeycombStreams;
    },

    clearParticles() {
      // Return pooled particles to the pool before clearing
      particles.forEach((p) => {
        if (p.pooled) {
          particleClassPool.release(p);
        }
      });
      particles.length = 0;
    },

    clearHoneycombStreams() {
      honeycombStreams.length = 0;
    },
  };

  window.NodeNet.ParticleSystem = ParticleSystem;
})();
