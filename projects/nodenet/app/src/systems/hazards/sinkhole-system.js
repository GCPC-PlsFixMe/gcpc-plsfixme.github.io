/**
 * @module SinkholeSystem
 * @summary Roving sinkhole hazard — pulls in-flight packets into a vortex and consumes them.
 * @description Class instantiated per-run by the coordinator. Reports consumption
 *   back to the runtime so packet systems can clean up their own state safely.
 * @exports window.NodeNet.SinkholeSystem
 * @tags sinkhole, hazard, black-hole, vortex, packet-consumption, event-horizon, gravity
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /**
   * Moving black-hole style hazard that captures and consumes packet entities.
   */
  class SinkholeSystem {
    constructor(config = {}) {
      this.config = {
        enabled: config.enabled !== false,
        influenceRadius: config.influenceRadius ?? 155,
        eventHorizonRadius: config.eventHorizonRadius ?? 16,
        driftSpeed: config.driftSpeed ?? 58,
        offscreenMargin: config.offscreenMargin ?? 0,
        retargetMinMs: config.retargetMinMs ?? 6500,
        retargetMaxMs: config.retargetMaxMs ?? 12000,
        initialCooldownMinMs: config.initialCooldownMinMs ?? 14000,
        initialCooldownMaxMs: config.initialCooldownMaxMs ?? 28000,
        activeMinMs: config.activeMinMs ?? 10000,
        activeMaxMs: config.activeMaxMs ?? 16000,
        cooldownMinMs: config.cooldownMinMs ?? 45000,
        cooldownMaxMs: config.cooldownMaxMs ?? 75000,
        spawnDurationMs: config.spawnDurationMs ?? 1500,
        despawnDurationMs: config.despawnDurationMs ?? 1200,
        logEvent: typeof config.logEvent === "function" ? config.logEvent : () => {},
      };
      this.x = 0;
      this.y = 0;
      this.targetX = 0;
      this.targetY = 0;
      this.phase = Math.random() * Math.PI * 2;
      this.nextRetargetAt = 0;
      this.initialized = false;
      this.captures = new WeakMap();
      this.bursts = [];
      this.lifecycleState = "cooldown";
      this.lifecycleStartedAt = 0;
      this.lifecycleEndsAt = 0;
      this.lifecycleDuration = 0;
      this.firstSpawnAnnounced = false;
      this.consumedPackets = 0;
      this.nextConsumptionLogAt = 100;
    }

    /**
     * Move the sinkhole through world space and age short-lived burst particles.
     */
    update({ canvas, nodes, now, deltaSeconds }) {
      if (!this.config.enabled || !canvas || deltaSeconds <= 0) return;
      if (!this.initialized) {
        this.initialize(canvas, nodes, now);
      }

      this.updateLifecycle(canvas, nodes, now);

      if (this.lifecycleState === "active") {
        if (now >= this.nextRetargetAt || this.distanceToTarget() < 12) {
          this.pickTarget(canvas, nodes, now);
        }

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
          const step = Math.min(dist, this.config.driftSpeed * deltaSeconds);
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
          this.clampToCanvas(canvas);
        }
      }

      this.phase = (this.phase + deltaSeconds * 0.85) % (Math.PI * 2);
      this.updateBursts(deltaSeconds);
    }

    /**
     * Apply vortex capture to a packet. Returns true once the packet is consumed.
     */
    applyToPacket(packet, packetType, deltaSeconds) {
      if (!this.config.enabled || !this.initialized || deltaSeconds <= 0) {
        return false;
      }

      let capture = this.captures.get(packet);
      if (!capture && this.lifecycleState !== "active") return false;
      if (this.lifecycleState === "cooldown") return false;
      if (!this.canAffectPacket(packet, packetType)) {
        return false;
      }

      const dx = packet.x - this.x;
      const dy = packet.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (!capture) {
        if (dist > this.config.influenceRadius) return false;
        capture = {
          radius: Math.max(dist, this.config.eventHorizonRadius + 2),
          angle: Math.atan2(dy, dx),
          spin: Math.random() < 0.5 ? -1 : 1,
          progress:
            typeof packet.progress === "number" ? packet.progress : null,
        };
        this.captures.set(packet, capture);
      }

      if (typeof packet.progress === "number" && capture.progress !== null) {
        packet.progress = capture.progress;
      }

      const radiusRatio = Math.max(
        0,
        Math.min(1, capture.radius / this.config.influenceRadius)
      );
      const strength = 1 - radiusRatio;
      const pullSpeed = 10 + strength * 42;
      const spinSpeed = (0.85 + strength * 2.2) * capture.spin;

      capture.radius = Math.max(
        0,
        capture.radius - pullSpeed * deltaSeconds
      );
      capture.angle += spinSpeed * deltaSeconds;

      const wobble = Math.sin(this.phase * 1.2 + capture.angle * 2) * 0.9;
      const visualRadius = Math.max(0, capture.radius + wobble * strength);
      packet.x = this.x + Math.cos(capture.angle) * visualRadius;
      packet.y = this.y + Math.sin(capture.angle) * visualRadius;

      if (typeof packet.opacity === "number") {
        packet.opacity = Math.max(0.28, packet.opacity * (0.995 - strength * 0.045));
      }

      if (capture.radius <= this.config.eventHorizonRadius) {
        this.createConsumptionBurst(packet);
        this.recordPacketConsumption(packetType);
        return true;
      }
      return false;
    }

    /**
     * Draw the compact event horizon and packet consumption bursts.
     */
    draw(ctx, now) {
      if (!this.config.enabled || !this.initialized || !ctx) return;
      const horizon = this.config.eventHorizonRadius;
      const pulse = 0.5 + Math.sin(now * 0.003 + this.phase) * 0.5;
      const visual = this.getLifecycleVisual(now);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.drawBursts(ctx);

      if (!this.isVisible()) {
        ctx.restore();
        return;
      }

      this.drawLifecycleRing(ctx, horizon, visual);

      ctx.globalCompositeOperation = "source-over";
      const alpha = visual.alpha;
      const effectiveHorizon = horizon * (0.25 + visual.scale * 0.75);
      this.drawGravitationalLensing(ctx, effectiveHorizon, alpha, pulse);
      ctx.shadowColor = `rgba(168, 85, 247, ${0.55 * alpha})`;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(168, 85, 247, ${(0.35 + pulse * 0.15) * alpha})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, effectiveHorizon + 6 * visual.scale + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();

      const core = ctx.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        effectiveHorizon + 5
      );
      core.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      core.addColorStop(0.68, `rgba(0, 0, 0, ${0.98 * alpha})`);
      core.addColorStop(1, `rgba(15, 23, 42, ${0.2 * alpha})`);
      ctx.shadowBlur = 14;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(this.x, this.y, effectiveHorizon + 4 * visual.scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    /**
     * Advance the sinkhole through cooldown, spawn, active, and despawn phases.
     */
    updateLifecycle(canvas, nodes, now) {
      if (now < this.lifecycleEndsAt) return;
      if (this.lifecycleState === "cooldown") {
        this.beginSpawn(canvas, nodes, now);
        return;
      }
      if (this.lifecycleState === "spawning") {
        this.beginActive(now);
        return;
      }
      if (this.lifecycleState === "active") {
        this.beginDespawn(now);
        return;
      }
      if (this.lifecycleState === "despawning") {
        this.beginCooldown(now, false);
      }
    }

    /**
     * Start the visible aperture-opening animation at a fresh anchor.
     */
    beginSpawn(canvas, nodes, now) {
      const center = this.pickAnchor(canvas, nodes);
      this.x = center.x;
      this.y = center.y;
      this.pickTarget(canvas, nodes, now);
      this.lifecycleState = "spawning";
      this.lifecycleStartedAt = now;
      this.lifecycleDuration = this.config.spawnDurationMs;
      this.lifecycleEndsAt = now + this.lifecycleDuration;
      this.logHazardEvent(
        this.firstSpawnAnnounced ? "🕳️ Sinkhole spawned." : "🚨 Network sinkhole anomaly detected!",
        { phase: "spawn" }
      );
      this.firstSpawnAnnounced = true;
    }

    /**
     * Enable packet capture after the aperture finishes opening.
     */
    beginActive(now) {
      this.lifecycleState = "active";
      this.lifecycleStartedAt = now;
      this.lifecycleDuration = this.randomDuration(
        this.config.activeMinMs,
        this.config.activeMaxMs
      );
      this.lifecycleEndsAt = now + this.lifecycleDuration;
    }

    /**
     * Stop new captures and play the aperture-closing animation.
     */
    beginDespawn(now) {
      this.lifecycleState = "despawning";
      this.lifecycleStartedAt = now;
      this.lifecycleDuration = this.config.despawnDurationMs;
      this.lifecycleEndsAt = now + this.lifecycleDuration;
      this.logHazardEvent("🕳️ Sinkhole despawning.", {
        consumedPackets: this.consumedPackets,
      });
    }

    /**
     * Hide the sinkhole until its next rare spawn window.
     */
    beginCooldown(now, initial) {
      this.lifecycleState = "cooldown";
      this.lifecycleStartedAt = now;
      this.lifecycleDuration = initial
        ? this.randomDuration(
            this.config.initialCooldownMinMs,
            this.config.initialCooldownMaxMs
          )
        : this.randomDuration(this.config.cooldownMinMs, this.config.cooldownMaxMs);
      this.lifecycleEndsAt = now + this.lifecycleDuration;
      this.captures = new WeakMap();
    }

    recordPacketConsumption(packetType) {
      this.consumedPackets += 1;
      if (this.consumedPackets < this.nextConsumptionLogAt) return;
      this.logHazardEvent("🕳️ Sinkhole consumption milestone.", {
        consumedPackets: this.consumedPackets,
        packetType: packetType || "unknown",
      });
      this.nextConsumptionLogAt += 100;
    }

    logHazardEvent(alert, details = {}) {
      this.config.logEvent("custom", { alert, details });
    }

    isVisible() {
      return (
        this.lifecycleState === "spawning" ||
        this.lifecycleState === "active" ||
        this.lifecycleState === "despawning"
      );
    }

    getLifecycleVisual(now) {
      const progress = this.clamp(
        (now - this.lifecycleStartedAt) / Math.max(1, this.lifecycleDuration),
        0,
        1
      );
      if (this.lifecycleState === "spawning") {
        const eased = 1 - Math.pow(1 - progress, 3);
        return { alpha: eased, scale: eased, progress };
      }
      if (this.lifecycleState === "despawning") {
        const eased = 1 - progress * progress;
        return { alpha: eased, scale: eased, progress };
      }
      if (this.lifecycleState === "active") {
        return { alpha: 1, scale: 1, progress: 1 };
      }
      return { alpha: 0, scale: 0, progress };
    }

    /**
     * Draw a collapsing spawn ring or expanding despawn ring around the aperture.
     */
    drawLifecycleRing(ctx, horizon, visual) {
      if (this.lifecycleState !== "spawning" && this.lifecycleState !== "despawning") return;
      const p = visual.progress;
      const opening = this.lifecycleState === "spawning";
      const ringRadius = opening
        ? horizon + 34 * (1 - p)
        : horizon + 38 * p;
      const alpha = opening ? p * (1 - p) * 2.4 : (1 - p) * 0.65;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
      ctx.lineWidth = opening ? 1.2 + p * 1.4 : 1.8;
      ctx.setLineDash(opening ? [2, 6] : [5, 5]);
      ctx.lineDashOffset = -this.phase * 8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawGravitationalLensing(ctx, horizon, alpha, pulse) {
      const outer = this.config.influenceRadius * (0.72 + pulse * 0.04);
      const inner = Math.max(horizon + 8, this.config.eventHorizonRadius * 1.7);
      const gradient = ctx.createRadialGradient(this.x, this.y, inner, this.x, this.y, outer);
      gradient.addColorStop(0, `rgba(34, 211, 238, ${0.16 * alpha})`);
      gradient.addColorStop(0.45, `rgba(168, 85, 247, ${0.08 * alpha})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) {
        const radius = inner + (outer - inner) * (0.35 + i * 0.18);
        const start = this.phase * (0.7 + i * 0.2) + i * 1.4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, start, start + Math.PI * (0.85 + pulse * 0.25));
        ctx.stroke();
      }
      ctx.restore();
    }

    initialize(canvas, nodes, now) {
      const center = this.pickAnchor(canvas, nodes);
      this.x = center.x;
      this.y = center.y;
      this.pickTarget(canvas, nodes, now);
      this.beginCooldown(now, true);
      this.initialized = true;
    }

    pickTarget(canvas, nodes, now) {
      const target = this.pickAnchor(canvas, nodes);
      this.targetX = target.x;
      this.targetY = target.y;
      this.nextRetargetAt =
        now +
        this.config.retargetMinMs +
        Math.random() *
          (this.config.retargetMaxMs - this.config.retargetMinMs);
    }

    pickAnchor(canvas, nodes) {
      const margin = this.config.offscreenMargin;
      const minX = -margin;
      const minY = -margin;
      const maxX = canvas.width + margin;
      const maxY = canvas.height + margin;
      const aliveNodes = (nodes || []).filter(
        (node) =>
          node &&
          node.state === "alive" &&
          node.parent !== null &&
          !node.isSatellite
      );
      if (aliveNodes.length > 0) {
        const node = aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
        const drift = 160 + Math.random() * 260;
        const angle = Math.random() * Math.PI * 2;
        return {
          x: this.clamp(
            node.x + Math.cos(angle) * drift,
            minX,
            maxX
          ),
          y: this.clamp(
            node.y + Math.sin(angle) * drift,
            minY,
            maxY
          ),
        };
      }
      // Match the route hijacker's fallback roaming area: the central half of the canvas.
      return {
        x: this.clamp(
          canvas.width * (0.25 + Math.random() * 0.5),
          minX,
          maxX
        ),
        y: this.clamp(
          canvas.height * (0.25 + Math.random() * 0.5),
          minY,
          maxY
        ),
      };
    }

    /** Keep active sinkhole motion within the same canvas bounds as the hijacker. */
    clampToCanvas(canvas) {
      const margin = this.config.offscreenMargin;
      this.x = this.clamp(this.x, -margin, canvas.width + margin);
      this.y = this.clamp(this.y, -margin, canvas.height + margin);
    }

    canAffectPacket(packet, packetType) {
      if (
        !packet ||
        !Number.isFinite(packet.x) ||
        !Number.isFinite(packet.y)
      ) {
        return false;
      }
      if (packetType === "immunity" && (packet.isAttached || packet.isAttaching)) {
        return false;
      }
      if ("active" in packet && packet.active === false) return false;
      if ("state" in packet && (packet.state === "finished" || packet.state === "fading")) {
        return false;
      }
      return true;
    }

    createConsumptionBurst(packet) {
      const color = this.getPacketColor(packet);
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 20;
        this.bursts.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          color,
          radius: 1 + Math.random() * 2,
        });
      }
    }

    updateBursts(deltaSeconds) {
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const burst = this.bursts[i];
        burst.life -= deltaSeconds;
        burst.x += burst.vx * deltaSeconds;
        burst.y += burst.vy * deltaSeconds;
        burst.vx *= 1 - Math.min(0.85, deltaSeconds * 2.5);
        burst.vy *= 1 - Math.min(0.85, deltaSeconds * 2.5);
        if (burst.life <= 0) {
          this.bursts.splice(i, 1);
        }
      }
    }

    drawBursts(ctx) {
      this.bursts.forEach((burst) => {
        const alpha = Math.max(0, burst.life / burst.maxLife);
        ctx.fillStyle = `rgba(${burst.color.r}, ${burst.color.g}, ${burst.color.b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, burst.radius * (1 + (1 - alpha)), 0, Math.PI * 2);
        ctx.fill();
      });
    }

    randomDuration(min, max) {
      return min + Math.random() * Math.max(0, max - min);
    }

    distanceToTarget() {
      return Math.hypot(this.targetX - this.x, this.targetY - this.y);
    }

    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    getPacketColor(packet) {
      if (packet.color) return packet.color;
      if (packet.colorRgb) {
        const parts = packet.colorRgb.split(",").map((part) => Number(part.trim()));
        if (parts.length === 3 && parts.every(Number.isFinite)) {
          return { r: parts[0], g: parts[1], b: parts[2] };
        }
      }
      return { r: 168, g: 85, b: 247 };
    }
  }

  window.NodeNet.SinkholeSystem = SinkholeSystem;
})();
