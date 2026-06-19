/**
 * @module RouteHijackerSystem
 * @summary Rogue route hijacker hazard — bends data traffic through fake routes; may corrupt or null-route packets.
 * @description Class instantiated per-run by the coordinator. Leaves defensive and
 *   attack packet systems alone; only ordinary data traffic is deceived.
 * @exports window.NodeNet.RouteHijackerSystem
 * @tags route-hijacker, hazard, bgp, fake-route, detour, corruption, null-route, mitm
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /**
   * Moving corrupted-router beacon that creates visual packet detours.
   */
  class RouteHijackerSystem {
    constructor(config = {}) {
      this.config = {
        enabled: config.enabled !== false,
        influenceRadius: config.influenceRadius ?? 115,
        beaconRadius: config.beaconRadius ?? 13,
        driftSpeed: config.driftSpeed ?? 32,
        captureChancePerSecond: config.captureChancePerSecond ?? 0.32,
        detourDurationMin: config.detourDurationMin ?? 1.8,
        detourDurationMax: config.detourDurationMax ?? 3.4,
        fakeRouteRadiusMin: config.fakeRouteRadiusMin ?? 52,
        fakeRouteRadiusMax: config.fakeRouteRadiusMax ?? 96,
        branchBridgeChance: config.branchBridgeChance ?? 0.34,
        branchBridgeRadius: config.branchBridgeRadius ?? 145,
        branchBridgeMinSeparation: config.branchBridgeMinSeparation ?? 38,
        corruptionChance: config.corruptionChance ?? 0.018,
        dropChance: config.dropChance ?? 0.02,
        retargetMinMs: config.retargetMinMs ?? 9000,
        retargetMaxMs: config.retargetMaxMs ?? 17000,
        initialCooldownMinMs: config.initialCooldownMinMs ?? 3500,
        initialCooldownMaxMs: config.initialCooldownMaxMs ?? 8000,
        activeMinMs: config.activeMinMs ?? 18000,
        activeMaxMs: config.activeMaxMs ?? 28000,
        cooldownMinMs: config.cooldownMinMs ?? 12000,
        cooldownMaxMs: config.cooldownMaxMs ?? 22000,
        spawnDurationMs: config.spawnDurationMs ?? 900,
        despawnDurationMs: config.despawnDurationMs ?? 900,
        minNetworkNodes: config.minNetworkNodes ?? 50,
        logEvent: typeof config.logEvent === "function" ? config.logEvent : () => {},
      };
      this.x = 0;
      this.y = 0;
      this.targetX = 0;
      this.targetY = 0;
      this.phase = Math.random() * Math.PI * 2;
      this.nextRetargetAt = 0;
      this.initialized = false;
      this.edges = [];
      this.hijacks = new Map();
      this.bursts = [];
      this.tumbleYaw = Math.random() * Math.PI * 2;
      this.tumblePitch = Math.random() * Math.PI * 2;
      this.tumbleRoll = Math.random() * Math.PI * 2;
      this.tumbleYawVelocity = this.randomSigned(0.3, 0.65);
      this.tumblePitchVelocity = this.randomSigned(0.22, 0.55);
      this.tumbleRollVelocity = this.randomSigned(0.18, 0.48);
      this.tumbleTargetYawVelocity = this.tumbleYawVelocity;
      this.tumbleTargetPitchVelocity = this.tumblePitchVelocity;
      this.tumbleTargetRollVelocity = this.tumbleRollVelocity;
      this.beaconFlowPhase = Math.random();
      this.lifecycleState = "cooldown";
      this.lifecycleStartedAt = 0;
      this.lifecycleEndsAt = 0;
      this.lifecycleDuration = 0;
      this.firstSpawnAnnounced = false;
      this.impactedRoutes = 0;
      this.nextImpactLogAt = 100;
    }

    /**
     * Move the beacon toward useful links and age short visual bursts.
     */
    update({ canvas, edges, now, deltaSeconds }) {
      if (!this.config.enabled || !canvas || deltaSeconds <= 0) return;
      this.edges = edges || this.edges || [];
      const activeNodeIds = new Set();
      for (const edge of this.edges) {
        if (edge?.from?.state === "alive") activeNodeIds.add(edge.from.id);
        if (edge?.to?.state === "alive") activeNodeIds.add(edge.to.id);
      }
      const meetsSpawnThreshold = activeNodeIds.size >= this.config.minNetworkNodes;
      if (!meetsSpawnThreshold && (!this.initialized || this.lifecycleState === "cooldown")) {
        return;
      }
      if (!this.initialized) {
        this.initialize(canvas, this.edges, now);
      }

      this.updateLifecycle(canvas, this.edges, now);

      if (this.lifecycleState === "active") {
        if (now >= this.nextRetargetAt || this.distanceToTarget() < 10) {
          this.pickTarget(canvas, this.edges, now);
        }

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
          const step = Math.min(dist, this.config.driftSpeed * deltaSeconds);
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
        }
      }

      this.phase = (this.phase + deltaSeconds * 1.4) % (Math.PI * 2);
      this.updateBeaconTumble(deltaSeconds);
      this.updateBursts(deltaSeconds);
      this.pruneInactiveHijacks();
    }

    /**
     * Bend a packet onto a fake route. Returns event flags for stats wiring.
     */
    applyToPacket(packet, deltaSeconds) {
      if (
        !this.config.enabled ||
        !this.initialized ||
        deltaSeconds <= 0 ||
        !packet
      ) {
        return null;
      }

      const existing = this.hijacks.get(packet);
      if (existing) {
        return this.advanceHijack(packet, existing, deltaSeconds);
      }

      if (this.lifecycleState !== "active" || !this.canAffectPacket(packet)) {
        return null;
      }

      const dx = packet.x - this.x;
      const dy = packet.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > this.config.influenceRadius) return null;
      if (typeof packet.progress !== "number") return null;
      if (packet.progress < 0.08 || packet.progress > 0.92) return null;

      const chance = this.config.captureChancePerSecond * deltaSeconds;
      if (Math.random() > chance) return null;

      const blockChance = this.getBlockChance(packet);
      if (Math.random() < blockChance) {
        this.createBurst(packet.x, packet.y, { r: 34, g: 211, b: 238 }, 5);
        this.recordRouteImpact();
        return { blocked: true };
      }

      const hijack = this.createHijack(packet);
      packet.routeHijacked = true;
      this.hijacks.set(packet, hijack);
      this.createBurst(packet.x, packet.y, { r: 168, g: 85, b: 247 }, 4);
      this.recordRouteImpact();
      return { started: true };
    }

    /**
     * Draw the corrupted router beacon, route ghosts, and short-lived bursts.
     */
    draw(ctx, now) {
      if (!this.config.enabled || !this.initialized || !ctx) return;
      const radius = this.config.influenceRadius;
      const beaconRadius = this.config.beaconRadius;
      const pulse = 0.5 + Math.sin(now * 0.004 + this.phase) * 0.5;
      const visible = this.isVisible();
      const visual = this.getLifecycleVisual(now);
      const alpha = visual.alpha;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      this.drawHijackRoutes(ctx);

      if (visible) {
        const fieldRadius = radius * (0.45 + visual.scale * 0.55);
        const field = ctx.createRadialGradient(
          this.x,
          this.y,
          beaconRadius,
          this.x,
          this.y,
          fieldRadius
        );
        field.addColorStop(0, `rgba(168, 85, 247, ${(0.12 + pulse * 0.06) * alpha})`);
        field.addColorStop(0.55, `rgba(245, 158, 11, ${0.045 * alpha})`);
        field.addColorStop(1, "rgba(168, 85, 247, 0)");
        ctx.fillStyle = field;
        ctx.beginPath();
        ctx.arc(this.x, this.y, fieldRadius, 0, Math.PI * 2);
        ctx.fill();

        this.drawLifecycleRoutingNodes(ctx, beaconRadius, visual, now);

        ctx.strokeStyle = `rgba(245, 158, 11, ${(0.18 + pulse * 0.12) * alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 7]);
        ctx.lineDashOffset = -now * 0.018;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius * 0.62 * (0.35 + visual.scale * 0.65), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      this.drawBursts(ctx);

      if (visible) {
        this.drawBeacon(ctx, now, beaconRadius, pulse, visual);
      }

      ctx.restore();
    }

    /**
     * Draw the hijacker as a projected 3D routing cube with moving pipe flow.
     */
    drawBeacon(ctx, now, beaconRadius, pulse, visual = { alpha: 1, scale: 1 }) {
      const size = beaconRadius * 0.74;
      const cameraDistance = beaconRadius * 4.2;
      const vertices = this.getProjectedCubeVertices(size, cameraDistance);
      const edges = this.getCubeEdges(vertices);
      const flow = (now * 0.0008 + this.beaconFlowPhase) % 1;
      const alpha = visual.alpha;

      ctx.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(0.28 + visual.scale * 0.72, 0.28 + visual.scale * 0.72);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      edges
        .slice()
        .sort((a, b) => a.depth - b.depth)
        .forEach((edge) => {
          const depthAlpha = this.clamp((edge.depth / size + 1) * 0.5, 0, 1);
          ctx.beginPath();
          ctx.moveTo(edge.from.x, edge.from.y);
          ctx.lineTo(edge.to.x, edge.to.y);
          ctx.shadowColor = `rgba(245, 158, 11, ${0.65 * alpha})`;
          ctx.shadowBlur = 5 + depthAlpha * 6 + pulse * 3;
          ctx.strokeStyle = `rgba(245, 158, 11, ${(0.28 + depthAlpha * 0.5 + pulse * 0.08) * alpha})`;
          ctx.lineWidth = 0.85 + depthAlpha * 0.85;
          ctx.stroke();
        });

      ctx.shadowColor = `rgba(34, 211, 238, ${0.65 * alpha})`;
      ctx.shadowBlur = 7 + pulse * 3;
      this.getCubeConnectorPairs(vertices).forEach(([from, to], index) => {
        const flowT = (flow + index * 0.25) % 1;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = `rgba(34, 211, 238, ${(0.18 + pulse * 0.16) * alpha})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
        this.drawPipePacket(ctx, from, to, flowT, pulse, alpha);
      });

      ctx.shadowColor = `rgba(245, 158, 11, ${0.75 * alpha})`;
      ctx.shadowBlur = 8 + pulse * 5;
      ctx.beginPath();
      const haloRadius = beaconRadius * (0.85 + pulse * 0.08);
      ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(245, 158, 11, ${(0.12 + pulse * 0.08) * alpha})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.restore();
    }

    /**
     * Draw one tiny moving dash along a cube connector to suggest rerouted flow.
     */
    drawPipePacket(ctx, from, to, t, pulse, alpha = 1) {
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const depth = from.depth + (to.depth - from.depth) * t;
      const depthAlpha = this.clamp((depth / Math.max(1, Math.abs(depth) + 8) + 1) * 0.5, 0.35, 1);
      const radius = 0.95 + pulse * 0.22 + depthAlpha * 0.35;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = `rgba(34, 211, 238, ${0.9 * alpha})`;
      ctx.shadowBlur = 5;
      ctx.fillStyle = `rgba(34, 211, 238, ${(0.48 + depthAlpha * 0.26 + pulse * 0.1) * alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /**
     * Advance the hijacker through cooldown, spawn, active, and despawn phases.
     */
    updateLifecycle(canvas, edges, now) {
      if (now < this.lifecycleEndsAt) return;
      if (this.lifecycleState === "cooldown") {
        this.beginSpawn(canvas, edges, now);
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
     * Materialize the routing cube at a fresh route-adjacent anchor.
     */
    beginSpawn(canvas, edges, now) {
      const target = this.pickAnchor(canvas, edges);
      this.x = target.x;
      this.y = target.y;
      this.pickTarget(canvas, edges, now);
      this.lifecycleState = "spawning";
      this.lifecycleStartedAt = now;
      this.lifecycleDuration = this.config.spawnDurationMs;
      this.lifecycleEndsAt = now + this.lifecycleDuration;
      this.beaconFlowPhase = Math.random();
      this.logHazardEvent(
        this.firstSpawnAnnounced ? "🧭 Route hijacker spawned." : "🚨 Route hijacker detected on the network!",
        { phase: "spawn", minNetworkNodes: this.config.minNetworkNodes }
      );
      this.firstSpawnAnnounced = true;
    }

    /**
     * Enable packet hijacking after the cube finishes assembling.
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
     * Stop new hijacks and play the cube folding animation.
     */
    beginDespawn(now) {
      this.lifecycleState = "despawning";
      this.lifecycleStartedAt = now;
      this.lifecycleDuration = this.config.despawnDurationMs;
      this.lifecycleEndsAt = now + this.lifecycleDuration;
      this.logHazardEvent("🧭 Route hijacker despawning.", {
        impactedRoutes: this.impactedRoutes,
      });
    }

    recordRouteImpact() {
      this.impactedRoutes += 1;
      if (this.impactedRoutes < this.nextImpactLogAt) return;
      this.logHazardEvent("🧭 Route hijacker impact milestone.", {
        impactedRoutes: this.impactedRoutes,
      });
      this.nextImpactLogAt += 100;
    }

    logHazardEvent(alert, details = {}) {
      this.config.logEvent("custom", { alert, details });
    }

    /**
     * Hide the hijacker until the next cooldown window expires.
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
     * Draw four routing nodes assembling into, or dispersing away from, the cube.
     */
    drawLifecycleRoutingNodes(ctx, beaconRadius, visual, now) {
      if (this.lifecycleState !== "spawning" && this.lifecycleState !== "despawning") return;
      const p = visual.progress;
      const assembling = this.lifecycleState === "spawning";
      const travel = assembling ? 1 - p : p;
      const alpha = assembling ? p * (1 - p) * 2.2 : (1 - p) * 0.8;
      const spin = now * 0.0025 + this.phase;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "rgba(34, 211, 238, 0.85)";
      ctx.shadowBlur = 8;
      for (let i = 0; i < 4; i++) {
        const angle = spin + (i / 4) * Math.PI * 2;
        const radius = beaconRadius * (0.6 + travel * 2.1);
        const x = this.x + Math.cos(angle) * radius;
        const y = this.y + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.arc(x, y, 1.4 + visual.scale * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`;
        ctx.fill();
      }
      ctx.restore();
    }

    /**
     * Progress tumble angles and ease velocities toward the current target direction.
     */
    updateBeaconTumble(deltaSeconds) {
      const easing = Math.min(1, deltaSeconds * 0.9);
      this.tumbleYawVelocity +=
        (this.tumbleTargetYawVelocity - this.tumbleYawVelocity) * easing;
      this.tumblePitchVelocity +=
        (this.tumbleTargetPitchVelocity - this.tumblePitchVelocity) * easing;
      this.tumbleRollVelocity +=
        (this.tumbleTargetRollVelocity - this.tumbleRollVelocity) * easing;
      this.tumbleYaw += this.tumbleYawVelocity * deltaSeconds;
      this.tumblePitch += this.tumblePitchVelocity * deltaSeconds;
      this.tumbleRoll += this.tumbleRollVelocity * deltaSeconds;
    }

    /**
     * Pick new tumble velocity targets so the cube changes direction as it roves.
     */
    randomizeTumbleTargets() {
      this.tumbleTargetYawVelocity = this.randomSigned(0.22, 0.72);
      this.tumbleTargetPitchVelocity = this.randomSigned(0.18, 0.62);
      this.tumbleTargetRollVelocity = this.randomSigned(0.14, 0.54);
    }

    /**
     * Build projected cube vertices from continuous tumble angles.
     */
    getProjectedCubeVertices(size, cameraDistance) {
      const points = [
        { x: -1, y: -1, z: -1 },
        { x: 1, y: -1, z: -1 },
        { x: 1, y: 1, z: -1 },
        { x: -1, y: 1, z: -1 },
        { x: -1, y: -1, z: 1 },
        { x: 1, y: -1, z: 1 },
        { x: 1, y: 1, z: 1 },
        { x: -1, y: 1, z: 1 },
      ];
      return points.map((point) => this.projectCubePoint(point, size, cameraDistance));
    }

    /**
     * Rotate a 3D point by tumble angles and project it into the beacon plane.
     */
    projectCubePoint(point, size, cameraDistance) {
      let x = point.x * size;
      let y = point.y * size;
      let z = point.z * size;

      const yawCos = Math.cos(this.tumbleYaw);
      const yawSin = Math.sin(this.tumbleYaw);
      const yawX = x * yawCos + z * yawSin;
      const yawZ = -x * yawSin + z * yawCos;
      x = yawX;
      z = yawZ;

      const pitchCos = Math.cos(this.tumblePitch);
      const pitchSin = Math.sin(this.tumblePitch);
      const pitchY = y * pitchCos - z * pitchSin;
      const pitchZ = y * pitchSin + z * pitchCos;
      y = pitchY;
      z = pitchZ;

      const rollCos = Math.cos(this.tumbleRoll);
      const rollSin = Math.sin(this.tumbleRoll);
      const rollX = x * rollCos - y * rollSin;
      const rollY = x * rollSin + y * rollCos;
      x = rollX;
      y = rollY;

      const perspective = cameraDistance / Math.max(1, cameraDistance - z);
      return {
        x: x * perspective,
        y: y * perspective,
        depth: z,
        scale: perspective,
      };
    }

    /**
     * Return all wireframe cube edges with average depth for painter sorting.
     */
    getCubeEdges(vertices) {
      const pairs = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ];
      return pairs.map(([fromIndex, toIndex]) => {
        const from = vertices[fromIndex];
        const to = vertices[toIndex];
        return {
          from,
          to,
          depth: (from.depth + to.depth) * 0.5,
        };
      });
    }

    /**
     * Return depth-axis connector pipes used for moving reroute flow markers.
     */
    getCubeConnectorPairs(vertices) {
      return [
        [vertices[0], vertices[4]],
        [vertices[1], vertices[5]],
        [vertices[2], vertices[6]],
        [vertices[3], vertices[7]],
      ];
    }

    randomSigned(min, max) {
      const magnitude = min + Math.random() * (max - min);
      return magnitude * (Math.random() < 0.5 ? -1 : 1);
    }

    randomDuration(min, max) {
      return min + Math.random() * Math.max(0, max - min);
    }

    initialize(canvas, edges, now) {
      const target = this.pickAnchor(canvas, edges);
      this.x = target.x;
      this.y = target.y;
      this.pickTarget(canvas, edges, now);
      this.beginCooldown(now, true);
      this.initialized = true;
    }

    pickTarget(canvas, edges, now) {
      const target = this.pickAnchor(canvas, edges);
      this.targetX = target.x;
      this.targetY = target.y;
      this.randomizeTumbleTargets();
      this.nextRetargetAt =
        now +
        this.config.retargetMinMs +
        Math.random() *
          (this.config.retargetMaxMs - this.config.retargetMinMs);
    }

    pickAnchor(canvas, edges) {
      const candidates = (edges || []).filter(
        (edge) =>
          edge &&
          edge.from &&
          edge.to &&
          edge.from.state === "alive" &&
          edge.to.state === "alive" &&
          !edge.isDDOSAttack &&
          !edge.isBotnetMesh
      );
      if (candidates.length > 0) {
        const edge = candidates[Math.floor(Math.random() * candidates.length)];
        const midX = (edge.from.x + edge.to.x) / 2;
        const midY = (edge.from.y + edge.to.y) / 2;
        const angle = Math.atan2(edge.to.y - edge.from.y, edge.to.x - edge.from.x);
        const offset = 36 + Math.random() * 72;
        const side = Math.random() < 0.5 ? -1 : 1;
        return {
          x: midX + Math.cos(angle + Math.PI / 2) * offset * side,
          y: midY + Math.sin(angle + Math.PI / 2) * offset * side,
        };
      }
      return {
        x: canvas.width * (0.25 + Math.random() * 0.5),
        y: canvas.height * (0.25 + Math.random() * 0.5),
      };
    }

    canAffectPacket(packet) {
      if (
        !packet ||
        packet.active === false ||
        packet.isFading ||
        packet.consumedBySinkhole ||
        !Number.isFinite(packet.x) ||
        !Number.isFinite(packet.y)
      ) {
        return false;
      }
      if (packet.routeHijackCooldownFrames > 0) {
        packet.routeHijackCooldownFrames -= 1;
        return false;
      }
      return (
        packet.type === "data" ||
        packet.type === "control" ||
        packet.type === "security"
      );
    }

    /**
     * Find a nearby branch edge that can receive a bridged packet.
     *
     * The hijacker only bridges when it is geometrically between two usable
     * links: both links are close to the beacon, their closest points are
     * separated enough to read as distinct branches, and the target is not on
     * the same side of the beacon as the source link.
     */
    findBranchBridge(packet) {
      if (Math.random() > this.config.branchBridgeChance) return null;
      if (!this.isUsableTrafficEdge(packet.edge)) return null;

      const sourcePoint = this.getClosestPointOnEdge(packet.edge, this.x, this.y);
      if (!sourcePoint || sourcePoint.distance > this.config.branchBridgeRadius) {
        return null;
      }

      let best = null;
      const sourceVectorLength = Math.hypot(
        sourcePoint.x - this.x,
        sourcePoint.y - this.y
      );

      for (const edge of this.edges || []) {
        if (!this.isValidBridgeEdge(edge, packet.edge)) continue;

        const targetPoint = this.getClosestPointOnEdge(edge, this.x, this.y);
        if (!targetPoint) continue;
        if (targetPoint.progress < 0.12 || targetPoint.progress > 0.88) continue;
        if (targetPoint.distance > this.config.branchBridgeRadius) continue;

        const separation = Math.hypot(
          targetPoint.x - sourcePoint.x,
          targetPoint.y - sourcePoint.y
        );
        if (separation < this.config.branchBridgeMinSeparation) continue;

        const targetVectorLength = Math.hypot(
          targetPoint.x - this.x,
          targetPoint.y - this.y
        );
        const sideDot =
          sourceVectorLength > 5 && targetVectorLength > 5
            ? ((sourcePoint.x - this.x) * (targetPoint.x - this.x) +
                (sourcePoint.y - this.y) * (targetPoint.y - this.y)) /
              (sourceVectorLength * targetVectorLength)
            : 0;
        if (sideDot > 0.72) continue;

        const sharedNodePenalty = this.edgesShareNode(packet.edge, edge) ? 18 : 0;
        const sameBranchPenalty = this.sameTopLevelBranch(packet.edge, edge) ? 20 : 0;
        const angleBonus = (1 - sideDot) * 20;
        const distanceBalance = Math.abs(sourcePoint.distance - targetPoint.distance);
        const targetSeparationBias = Math.abs(separation - 82) * 0.15;
        const score =
          targetPoint.distance +
          distanceBalance * 0.35 +
          targetSeparationBias +
          sharedNodePenalty +
          sameBranchPenalty -
          angleBonus;

        if (!best || score < best.score) {
          best = { edge, point: targetPoint, score };
        }
      }

      if (!best) return null;

      return {
        edge: best.edge,
        progress: this.clamp(best.point.progress, 0.12, 0.88),
        direction: packet.direction === -1 ? -1 : 1,
        sourcePoint,
        targetPoint: best.point,
      };
    }

    /**
     * Keep branch-bridge arcs visually tied to the beacon instead of using the
     * wider random fake-route bend used by ordinary hijacks.
     */
    getBridgeControlPoint(packet, targetPoint, bridge) {
      const dx = targetPoint.x - packet.x;
      const dy = targetPoint.y - packet.y;
      const len = Math.hypot(dx, dy) || 1;
      const midpointX = (packet.x + targetPoint.x) * 0.5;
      const midpointY = (packet.y + targetPoint.y) * 0.5;
      const side =
        (bridge.sourcePoint.x - this.x) * (targetPoint.y - this.y) -
          (bridge.sourcePoint.y - this.y) * (targetPoint.x - this.x) <
        0
          ? -1
          : 1;
      const curve = Math.min(24, len * 0.18) * side;
      return {
        x: this.x * 0.72 + midpointX * 0.28 + (-dy / len) * curve,
        y: this.y * 0.72 + midpointY * 0.28 + (dx / len) * curve,
      };
    }

    /**
     * Limit branch bridges to ordinary, alive traffic links.
     */
    isUsableTrafficEdge(edge) {
      return (
        edge &&
        edge.from &&
        edge.to &&
        edge.from.state === "alive" &&
        edge.to.state === "alive" &&
        !edge.isDDOSAttack &&
        !edge.isBotnetMesh
      );
    }

    /**
     * Validate that a candidate bridge edge is separate from the packet's source.
     */
    isValidBridgeEdge(edge, sourceEdge) {
      return edge !== sourceEdge && this.isUsableTrafficEdge(edge);
    }

    /**
     * Detect whether two edges meet at a node; shared-node bridges are de-prioritized.
     */
    edgesShareNode(edgeA, edgeB) {
      if (!edgeA || !edgeB) return false;
      return (
        edgeA.from === edgeB.from ||
        edgeA.from === edgeB.to ||
        edgeA.to === edgeB.from ||
        edgeA.to === edgeB.to
      );
    }

    /**
     * Check whether both edges belong to the same top-level branch under the hub.
     */
    sameTopLevelBranch(edgeA, edgeB) {
      const branchA = this.getEdgeTopLevelBranch(edgeA);
      const branchB = this.getEdgeTopLevelBranch(edgeB);
      return branchA && branchB && branchA === branchB;
    }

    /**
     * Resolve the direct child branch that owns an edge in the tree topology.
     */
    getEdgeTopLevelBranch(edge) {
      if (!edge) return null;
      const fromBranch = this.getTopLevelBranch(edge.from);
      const toBranch = this.getTopLevelBranch(edge.to);
      if (fromBranch?.parent === null && toBranch) return toBranch;
      if (toBranch?.parent === null && fromBranch) return fromBranch;
      return toBranch || fromBranch;
    }

    /**
     * Walk from a node toward the hub until the direct branch child is found.
     */
    getTopLevelBranch(node) {
      let current = node;
      let guard = 0;
      while (current?.parent && current.parent.parent && guard < 80) {
        current = current.parent;
        guard += 1;
      }
      return current || null;
    }

    /**
     * Project a point onto an edge segment and return the nearest route progress.
     */
    getClosestPointOnEdge(edge, x, y) {
      if (!edge?.from || !edge?.to) return null;
      const dx = edge.to.x - edge.from.x;
      const dy = edge.to.y - edge.from.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq <= 0.0001) return null;

      const progress = this.clamp(
        ((x - edge.from.x) * dx + (y - edge.from.y) * dy) / lenSq,
        0,
        1
      );
      const pointX = edge.from.x + dx * progress;
      const pointY = edge.from.y + dy * progress;
      return {
        x: pointX,
        y: pointY,
        progress,
        distance: Math.hypot(pointX - x, pointY - y),
      };
    }

    createHijack(packet) {
      const branchBridge = this.findBranchBridge(packet);
      const detourAngle = Math.atan2(packet.y - this.y, packet.x - this.x);
      const detourRadius =
        this.config.fakeRouteRadiusMin +
        Math.random() *
          (this.config.fakeRouteRadiusMax - this.config.fakeRouteRadiusMin);
      const side = Math.random() < 0.5 ? -1 : 1;
      const phantomAngle = detourAngle + side * (0.7 + Math.random() * 0.8);
      const targetEdge = branchBridge?.edge || packet.edge;
      const targetProgress = branchBridge?.progress ?? packet.progress;
      const targetDirection = branchBridge?.direction ?? packet.direction;
      const targetPoint = branchBridge
        ? this.getEdgePoint(targetEdge, targetProgress, packet.lateralOffset || 0)
        : { x: packet.x, y: packet.y };
      const controlPoint = branchBridge
        ? this.getBridgeControlPoint(packet, targetPoint, branchBridge)
        : {
            x: this.x + Math.cos(phantomAngle) * detourRadius,
            y: this.y + Math.sin(phantomAngle) * detourRadius,
          };
      const corruptOnExit = Math.random() < this.config.corruptionChance;
      return {
        age: 0,
        duration:
          this.config.detourDurationMin +
          Math.random() *
            (this.config.detourDurationMax - this.config.detourDurationMin),
        startX: packet.x,
        startY: packet.y,
        phantomX: controlPoint.x,
        phantomY: controlPoint.y,
        currentX: packet.x,
        currentY: packet.y,
        endX: targetPoint.x,
        endY: targetPoint.y,
        sourceEdge: packet.edge,
        sourceDirection: packet.direction,
        routeProgress: packet.progress,
        destinationEdge: targetEdge,
        destinationDirection: targetDirection,
        destinationProgress: targetProgress,
        isBranchBridge: Boolean(branchBridge),
        originalColor: { ...packet.color },
        originalColorRgb: packet.colorRgb,
        originalRadius: packet.radius,
        corruptOnExit,
        dropOnExit: !corruptOnExit && Math.random() < this.config.dropChance,
      };
    }

    advanceHijack(packet, hijack, deltaSeconds) {
      if (!hijack.sourceEdge || !hijack.sourceEdge.from || !hijack.sourceEdge.to) {
        packet.routeHijacked = false;
        this.hijacks.delete(packet);
        return null;
      }
      if (hijack.isBranchBridge && !this.isUsableTrafficEdge(hijack.destinationEdge)) {
        hijack.isBranchBridge = false;
        hijack.destinationEdge = hijack.sourceEdge;
        hijack.destinationDirection = hijack.sourceDirection;
        hijack.destinationProgress = hijack.routeProgress;
      }

      hijack.age += deltaSeconds;
      const speed = Math.max(0.0005, packet.speed || 0.002);
      const direction = hijack.sourceDirection === -1 ? -1 : 1;
      hijack.routeProgress = this.clamp(
        hijack.routeProgress + speed * direction * deltaSeconds * 60 * 0.45,
        0.04,
        0.96
      );
      if (hijack.isBranchBridge) {
        const bridgeDirection = hijack.destinationDirection === -1 ? -1 : 1;
        hijack.destinationProgress = this.clamp(
          hijack.destinationProgress + speed * bridgeDirection * deltaSeconds * 60 * 0.45,
          0.04,
          0.96
        );
      }

      const endEdge = hijack.isBranchBridge
        ? hijack.destinationEdge
        : hijack.sourceEdge;
      const endProgress = hijack.isBranchBridge
        ? hijack.destinationProgress
        : hijack.routeProgress;
      packet.edge = hijack.sourceEdge;
      packet.direction = hijack.sourceDirection;
      packet.progress = hijack.routeProgress;

      const edgePoint = this.getEdgePoint(
        endEdge,
        endProgress,
        packet.lateralOffset || 0
      );
      hijack.endX = edgePoint.x;
      hijack.endY = edgePoint.y;
      const t = Math.min(1, hijack.age / hijack.duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const point = this.quadraticPoint(
        hijack.startX,
        hijack.startY,
        hijack.phantomX,
        hijack.phantomY,
        hijack.endX,
        hijack.endY,
        eased
      );

      hijack.currentX = point.x;
      hijack.currentY = point.y;
      packet.x = point.x;
      packet.y = point.y;
      if (typeof packet.opacity === "number") {
        packet.opacity = Math.max(0.42, packet.opacity * 0.992);
      }
      this.applyHijackVisual(packet, hijack, t);

      if (t < 1) return { active: true };

      this.hijacks.delete(packet);
      const wasBridged = hijack.isBranchBridge;
      const finalEdge = wasBridged ? hijack.destinationEdge : hijack.sourceEdge;
      const finalDirection = wasBridged
        ? hijack.destinationDirection
        : hijack.sourceDirection;
      const finalProgress = wasBridged
        ? hijack.destinationProgress
        : hijack.routeProgress;
      packet.x = hijack.endX;
      packet.y = hijack.endY;
      packet.edge = finalEdge;
      packet.direction = finalDirection;
      packet.progress = finalProgress;
      packet.routeHijacked = false;
      packet.routeHijackCooldownFrames = wasBridged ? 210 : 150;
      if (wasBridged) {
        this.refreshPacketBaseSpeed(packet, finalEdge);
      }

      if (hijack.dropOnExit) {
        this.createBurst(packet.x, packet.y, { r: 239, g: 68, b: 68 }, 7);
        packet.active = false;
        return { dropped: true, bridged: wasBridged, completed: true };
      }

      if (hijack.corruptOnExit) {
        packet.type = "infected";
        packet.protocol = "MALWARE";
        packet.protocolProfile = null;
        packet.color = { r: 168, g: 85, b: 247 };
        packet.colorRgb = "168, 85, 247";
        packet.radius = Math.max(hijack.originalRadius, 2.5);
        packet.routeHijackGlowColor = packet.color;
        packet.routeHijackGlowAlpha = 1;
        this.createBurst(packet.x, packet.y, packet.color, 6);
        return { corrupted: true, bridged: wasBridged, completed: true };
      }

      const exitColor = wasBridged
        ? { r: 34, g: 211, b: 238 }
        : { r: 245, g: 158, b: 11 };
      packet.color = hijack.originalColor;
      packet.colorRgb = hijack.originalColorRgb;
      packet.radius = hijack.originalRadius;
      packet.routeHijackGlowColor = exitColor;
      packet.routeHijackGlowAlpha = wasBridged ? 0.75 : 0.55;
      this.createBurst(packet.x, packet.y, exitColor, wasBridged ? 6 : 4);
      return { rerouted: true, bridged: wasBridged, completed: true };
    }

    /**
     * Match a bridged packet's progress speed to its new edge length.
     */
    refreshPacketBaseSpeed(packet, edge) {
      if (!packet || !edge?.from || !edge?.to) return;
      const fromX = Number.isFinite(edge.from.baseX) ? edge.from.baseX : edge.from.x;
      const fromY = Number.isFinite(edge.from.baseY) ? edge.from.baseY : edge.from.y;
      const toX = Number.isFinite(edge.to.baseX) ? edge.to.baseX : edge.to.x;
      const toY = Number.isFinite(edge.to.baseY) ? edge.to.baseY : edge.to.y;
      const length = Math.hypot(toX - fromX, toY - fromY);
      if (length <= 0.0001) return;
      packet.baseSpeed = 4.0 / length;
    }

    applyHijackVisual(packet, hijack, t) {
      if (hijack.corruptOnExit) {
        const mix = this.clamp((t - 0.45) / 0.55, 0, 1);
        const purple = { r: 168, g: 85, b: 247 };
        packet.color = this.mixColor(hijack.originalColor, purple, mix);
        packet.colorRgb = `${Math.round(packet.color.r)}, ${Math.round(
          packet.color.g
        )}, ${Math.round(packet.color.b)}`;
        packet.radius = hijack.originalRadius + mix * 0.7;
        packet.routeHijackGlowColor = purple;
        packet.routeHijackGlowAlpha = 0.25 + mix * 0.65;
        return;
      }

      if (hijack.isBranchBridge) {
        const pulse = Math.sin(t * Math.PI);
        const bridgeColor = { r: 34, g: 211, b: 238 };
        const mix = 0.18 + pulse * 0.24;
        packet.color = this.mixColor(hijack.originalColor, bridgeColor, mix);
        packet.colorRgb = `${Math.round(packet.color.r)}, ${Math.round(
          packet.color.g
        )}, ${Math.round(packet.color.b)}`;
        packet.radius = hijack.originalRadius + pulse * 0.45;
        packet.routeHijackGlowColor = bridgeColor;
        packet.routeHijackGlowAlpha = 0.35 + pulse * 0.3;
        return;
      }

      packet.routeHijackGlowColor = { r: 245, g: 158, b: 11 };
      packet.routeHijackGlowAlpha = 0.25;
    }

    getBlockChance(packet) {
      let chance = 0.06;
      if (packet.type === "control") chance += 0.14;
      if (packet.type === "security") chance += 0.58;
      const from = packet.edge?.from;
      const to = packet.edge?.to;
      if (from?.hasFirewall || to?.hasFirewall) chance += 0.12;
      if (from?.isGuardian || to?.isGuardian) chance += 0.2;
      if (from?.isDatacenter || to?.isDatacenter) chance += 0.18;
      return Math.min(0.88, chance);
    }

    pruneInactiveHijacks() {
      for (const [packet] of this.hijacks) {
        if (!packet || packet.active === false || packet.consumedBySinkhole) {
          if (packet) packet.routeHijacked = false;
          this.hijacks.delete(packet);
        }
      }
    }

    drawHijackRoutes(ctx) {
      for (const [, hijack] of this.hijacks) {
        const isBridge = hijack.isBranchBridge;
        const routeColor = isBridge ? "34, 211, 238" : "245, 158, 11";
        ctx.beginPath();
        ctx.moveTo(hijack.startX, hijack.startY);
        ctx.quadraticCurveTo(
          hijack.phantomX,
          hijack.phantomY,
          hijack.endX,
          hijack.endY
        );
        ctx.strokeStyle = `rgba(${routeColor}, ${isBridge ? 0.32 : 0.22})`;
        ctx.lineWidth = isBridge ? 1.7 : 1.4;
        ctx.setLineDash(isBridge ? [2, 5] : [4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (isBridge) {
          ctx.beginPath();
          ctx.arc(hijack.endX, hijack.endY, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(34, 211, 238, 0.55)";
          ctx.fill();
        }
      }
    }

    createBurst(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 12 + Math.random() * 34;
        this.bursts.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + Math.random() * 0.3,
          maxLife: 0.65,
          color,
          radius: 1 + Math.random() * 1.8,
        });
      }
    }

    updateBursts(deltaSeconds) {
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const burst = this.bursts[i];
        burst.life -= deltaSeconds;
        burst.x += burst.vx * deltaSeconds;
        burst.y += burst.vy * deltaSeconds;
        burst.vx *= 1 - Math.min(0.8, deltaSeconds * 3);
        burst.vy *= 1 - Math.min(0.8, deltaSeconds * 3);
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

    quadraticPoint(x0, y0, x1, y1, x2, y2, t) {
      const inv = 1 - t;
      return {
        x: inv * inv * x0 + 2 * inv * t * x1 + t * t * x2,
        y: inv * inv * y0 + 2 * inv * t * y1 + t * t * y2,
      };
    }

    getEdgePoint(edge, progress, lateralOffset = 0) {
      const x = edge.from.x + (edge.to.x - edge.from.x) * progress;
      const y = edge.from.y + (edge.to.y - edge.from.y) * progress;
      const dx = edge.to.x - edge.from.x;
      const dy = edge.to.y - edge.from.y;
      const len = Math.hypot(dx, dy) || 1;
      return {
        x: x + (-dy / len) * lateralOffset,
        y: y + (dx / len) * lateralOffset,
      };
    }

    mixColor(from, to, t) {
      return {
        r: from.r + (to.r - from.r) * t,
        g: from.g + (to.g - from.g) * t,
        b: from.b + (to.b - from.b) * t,
      };
    }

    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    distanceToTarget() {
      return Math.hypot(this.targetX - this.x, this.targetY - this.y);
    }
  }

  window.NodeNet.RouteHijackerSystem = RouteHijackerSystem;
})();
