/**
 * @module DataTrafficSystem
 * @summary Ordinary data packets — spawning, movement, protocol mix, rendering, and cleanup along edges.
 * @exports window.NodeNet.DataTrafficSystem
 * @tags data-traffic, packets, protocol, dns, http, routing, flow, edges
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    ctx: null,
    getEdges: () => [],
    getEdgesSet: () => new Set(),
    getDataPackets: () => [],
    getPacketSpeedMultiplier: () => 1,
    incrementStat: () => {},
    applyRouteHijackerToPacket: () => {},
    applySinkholeToPacket: () => false,
    getPointAndPerpOnEdge: () => null,
    isNodeInDDOSBranch: () => false,
    computeEdgeQualitySnapshot: () => null,
    selectPacketProtocol: () => ({
      name: "HTTP",
      profile: { speedMultiplier: 1, dropSensitivity: 1, jitterSensitivity: 1 },
    }),
    getProtocolProfile: () => ({
      speedMultiplier: 1,
      dropSensitivity: 1,
      jitterSensitivity: 1,
    }),
    clampValue: (value, min, max) => Math.max(min, Math.min(max, value)),
  };

  let ctx = null;
  let edges = [];
  let edgesSet = new Set();
  let dataPackets = [];
  let packetSpeedMultiplier = 1;

  function refreshRuntimeState() {
    ctx = dependencies.ctx;
    edges = typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
    edgesSet = typeof dependencies.getEdgesSet === "function"
      ? dependencies.getEdgesSet()
      : new Set();
    dataPackets = typeof dependencies.getDataPackets === "function"
      ? dependencies.getDataPackets()
      : [];
    packetSpeedMultiplier = typeof dependencies.getPacketSpeedMultiplier === "function"
      ? dependencies.getPacketSpeedMultiplier()
      : 1;
  }

  function incrementStat(statName) {
    dependencies.incrementStat(statName);
  }

  function applyRouteHijackerToPacket(packet) {
    dependencies.applyRouteHijackerToPacket(packet);
  }

  function applySinkholeToPacket(packet, packetType) {
    return dependencies.applySinkholeToPacket(packet, packetType);
  }

  function getPointAndPerpOnEdge(edge, progress) {
    return dependencies.getPointAndPerpOnEdge(edge, progress);
  }

  function isNodeInDDOSBranch(node) {
    return dependencies.isNodeInDDOSBranch(node);
  }

  function computeEdgeQualitySnapshot(edge, now) {
    return dependencies.computeEdgeQualitySnapshot(edge, now);
  }

  function selectPacketProtocol() {
    return dependencies.selectPacketProtocol();
  }

  function getProtocolProfile(protocolName) {
    return dependencies.getProtocolProfile(protocolName);
  }

  function clampValue(value, min, max) {
    return dependencies.clampValue(value, min, max);
  }

  class DataPacket {
    constructor(edge, direction = 1) {
      this.edge = edge;
      this.direction = direction; // 1 = from->to, -1 = to->from
      this.progress = direction === 1 ? 0 : 1;
      this.active = true;

      // Calculate initial position immediately to avoid (0,0) spawn
      const fromNode = edge.from;
      const toNode = edge.to;
      if (fromNode && toNode) {
        const sample = getPointAndPerpOnEdge(edge, this.progress);
        if (sample) {
          const lateralOffset = direction === 1 ? 3 : -3;
          this.x = sample.x + sample.perpX * lateralOffset;
          this.y = sample.y + sample.perpY * lateralOffset;
        } else {
          this.x = fromNode.x;
          this.y = fromNode.y;
        }
      } else {
        // Fallback if nodes are invalid
        this.x = 0;
        this.y = 0;
      }

      this.prevX = this.x;
      this.prevY = this.y;
      this.renderSeed = Math.random();
      this.protocol = null;
      this.protocolProfile = null;
      this.linkSnapshot = null;

      // Check if this is infected traffic between malware/botnet nodes
      const fromMalware =
        edge.from &&
        (edge.from.status === "malware" ||
          edge.from.status === "botnet" ||
          edge.from.status === "commandControl");
      const toMalware =
        edge.to &&
        (edge.to.status === "malware" ||
          edge.to.status === "botnet" ||
          edge.to.status === "commandControl");

      if (fromMalware && toMalware) {
        // Infected packet traveling between malware nodes
        this.type = "infected";
        this.protocol = "MALWARE";
        this.color = { r: 168, g: 85, b: 247 }; // Purple (malware color)
        this.radius = 2;
      } else {
        const protocolSelection = selectPacketProtocol();
        this.protocol = protocolSelection.name;
        this.protocolProfile = protocolSelection.profile;

        // Normal packet types: 'data', 'control', 'security'
        const rand = Math.random();
        if (rand < 0.6) {
          this.type = "data";
          this.color = { r: 100, g: 200, b: 255 }; // Light blue
          this.radius = 2;
        } else if (rand < 0.85) {
          this.type = "control";
          this.color = { r: 150, g: 255, b: 150 }; // Light green
          this.radius = 2;
        } else {
          this.type = "security";
          this.color = { r: 255, g: 200, b: 100 }; // Golden
          this.radius = 2;
        }
      }

      this.colorRgb = `${this.color.r}, ${this.color.g}, ${this.color.b}`;

      // Calculate edge length for speed normalization using base positions
      // Use baseX/baseY since nodes might still be animating to their final positions
      const dx = edge.to.baseX - edge.from.baseX;
      const dy = edge.to.baseY - edge.from.baseY;
      const edgeLength = Math.sqrt(dx * dx + dy * dy);

      // Normalize speed: longer edges = faster progress
      // Target: ~1.0 pixel per frame at 60fps for consistent visual velocity
      const PIXELS_PER_FRAME = 1.0;

      this.speedVariance = 0.85 + Math.random() * 0.3;

      // Base speed gives us the progress per frame
      // For consistent visual speed, adjust based on edge length
      this.baseSpeed =
        edgeLength > 0 ? (PIXELS_PER_FRAME * 4.0) / edgeLength : 0.003;
      this.speed = this.baseSpeed * this.speedVariance * packetSpeedMultiplier;
      this.opacity = 0.8;

      // Offset to side of line for bidirectional flow
      this.lateralOffset = direction === 1 ? 3 : -3;

      // Fading state for when packet is dropped
      this.isFading = false;
      this.jitterX = 0;
      this.jitterY = 0;

      // Drop check - only perform once per packet
      this.dropCheckPerformed = false;
    }

    update() {
      const now = Date.now();
      this.prevX = this.x;
      this.prevY = this.y;

      // Check if edge or nodes are invalid/removed
      const edgeExists = edgesSet.has(this.edge);
      const fromNodeValid =
        this.edge.from &&
        (this.edge.from.state === "alive" ||
          this.edge.from.state === "spawning");
      const toNodeValid =
        this.edge.to &&
        (this.edge.to.state === "alive" ||
          this.edge.to.state === "spawning");

      // Drop packet if edge removed or either node is retracting/drifting/dead
      if (!edgeExists || !fromNodeValid || !toNodeValid) {
        // Instantly despawn for: mesh edges, infected traffic, or migrating botnet nodes
        const isMeshEdge = this.edge.isBotnetMesh;
        const isInfectedTraffic = this.type === "infected";
        const fromMigrating =
          this.edge.from &&
          this.edge.from.botnetFormationTime &&
          now - this.edge.from.botnetFormationTime < 5000;
        const toMigrating =
          this.edge.to &&
          this.edge.to.botnetFormationTime &&
          now - this.edge.to.botnetFormationTime < 5000;

        if (
          isMeshEdge ||
          isInfectedTraffic ||
          fromMigrating ||
          toMigrating
        ) {
          this.active = false;
          return;
        }

        // Enter fading mode for packet drop
        if (!this.isFading) {
          this.isFading = true;

          // Count as dropped packet
          if (!this.dropCheckPerformed) {
            incrementStat("packetsDropped");
            this.dropCheckPerformed = true;
          }
        }

        // Continue fade out in place
        if (this.isFading) {
          this.opacity -= 0.06; // Faster fade out for dropped packets

          if (this.opacity <= 0) {
            this.active = false;
          }
        } else {
          this.active = false;
        }
        return;
      }

      // Adjust speed based on link status and packet type
      const fromNode = this.direction === 1 ? this.edge.from : this.edge.to;
      const toNode = this.direction === 1 ? this.edge.to : this.edge.from;
      const linkSnapshot =
        this.edge.linkQualitySnapshot ||
        computeEdgeQualitySnapshot(this.edge, now);
      this.linkSnapshot = linkSnapshot;

      // Don't adjust speed/opacity for fading packets - they're fading out
      if (!this.isFading) {
        // Immunity packets glow bright and move fast
        if (this.type === "immunity") {
          this.speed =
            this.baseSpeed * 1.5 * this.speedVariance * packetSpeedMultiplier; // Faster for infected traffic
          this.opacity = 0.8; // 80% opacity
        } else if (
          toNode.status === "red" ||
          toNode.status === "malware" ||
          toNode.status === "botnet" ||
          toNode.status === "commandControl"
        ) {
          this.speed =
            this.baseSpeed * 0.4 * this.speedVariance * packetSpeedMultiplier; // Slow when link is compromised
          this.opacity = 0.8; // 80% opacity
        } else if (toNode.status === "yellow") {
          this.speed =
            this.baseSpeed * 0.7 * this.speedVariance * packetSpeedMultiplier; // Moderate when stressed
          this.opacity = 0.8; // 80% opacity
        } else {
          this.speed =
            this.baseSpeed * this.speedVariance * packetSpeedMultiplier; // Normal speed when healthy
          this.opacity = 0.8; // 80% opacity
        }

        // Apply DDOS slowdown to packets in affected branches
        // Helper to check if node is in a branch under DDOS (fallback if isNodeInDDOSBranch misses it)
        const checkDDOS = (n) => {
          if (isNodeInDDOSBranch(n)) return true;
          let curr = n;
          while (curr) {
            if (curr.isUnderDDOS) return true;
            curr = curr.parent;
          }
          return false;
        };

        if (checkDDOS(toNode) || checkDDOS(fromNode)) {
          // Data packets are severely slowed during DDOS
          this.speed *= 0.15; // 85% slower
          this.opacity = 0.4; // Dim to show degraded service
        }

        // Protocol + link quality realism modifiers
        if (this.type !== "infected" && linkSnapshot) {
          const protocolProfile =
            this.protocolProfile || getProtocolProfile(this.protocol);
          const bandwidthFactor = clampValue(linkSnapshot.bandwidth, 0.2, 1);
          const protocolSpeedMultiplier =
            protocolProfile.speedMultiplier ?? 1;
          const latencyFactor = clampValue(
            1 - linkSnapshot.latencyMs / 450,
            0.45,
            1
          );

          this.speed *=
            bandwidthFactor * protocolSpeedMultiplier * latencyFactor;
          const minSpeed = this.baseSpeed * 0.08 * packetSpeedMultiplier;
          this.speed = Math.max(minSpeed, this.speed);

          this.opacity = clampValue(
            this.opacity * (0.75 + linkSnapshot.qualityScore * 0.35),
            0.25,
            1
          );
        }
      }

      // Calculate drop chance and jitter based on link status (only once per packet)
      if (!this.dropCheckPerformed) {
        this.dropCheckPerformed = true;

        let dropChance = 0;
        const isMalwarePacket = this.type === "infected";

        // Check link conditions
        const isDDOS =
          isNodeInDDOSBranch(toNode) || isNodeInDDOSBranch(fromNode);
        const isBotnetLink =
          toNode.status === "botnet" || fromNode.status === "botnet";
        const isMalwareLink =
          toNode.status === "malware" || fromNode.status === "malware";

        if (isDDOS && !isMalwarePacket) {
          dropChance = 0.75; // 75% drop chance during DDOS
        } else if (isBotnetLink && !isMalwarePacket) {
          dropChance = 0.5; // 50% drop chance on botnet links
        } else if (isMalwareLink && !isMalwarePacket) {
          dropChance = 0.25; // 25% drop chance on infected links
        }

        if (!isMalwarePacket && linkSnapshot) {
          const protocolProfile =
            this.protocolProfile || getProtocolProfile(this.protocol);
          const protocolDropSensitivity =
            protocolProfile.dropSensitivity ?? 1;
          const qualityPenalty = (1 - linkSnapshot.qualityScore) * 0.35;
          const reliabilityPenalty = (1 - linkSnapshot.reliability) * 0.6;
          dropChance +=
            (qualityPenalty + reliabilityPenalty) * protocolDropSensitivity;
          dropChance = clampValue(dropChance, 0, 0.95);
        }

        // Check for packet drop (one-time check)
        if (dropChance > 0 && Math.random() < dropChance) {
          // Packet dropped - enter fade mode
          this.isFading = true;
          incrementStat("packetsDropped");
          return;
        }
      }

      // If already fading, continue fading
      if (this.isFading) {
        this.opacity -= 0.04;
        if (this.opacity <= 0) {
          this.active = false;
        }
        return;
      }

      // Apply jitter for unstable links
      let hasJitter = false;
      const isMalwarePacket = this.type === "infected";
      const isDDOS =
        isNodeInDDOSBranch(toNode) || isNodeInDDOSBranch(fromNode);
      const isBotnetLink =
        toNode.status === "botnet" || fromNode.status === "botnet";
      const isMalwareLink =
        toNode.status === "malware" || fromNode.status === "malware";

      if (
        !isMalwarePacket &&
        (isDDOS ||
          isBotnetLink ||
          isMalwareLink ||
          (linkSnapshot && linkSnapshot.qualityScore < 0.55))
      ) {
        hasJitter = true;
      }

      // Apply jitter if link is unstable
      if (hasJitter) {
        const protocolProfile =
          this.protocolProfile || getProtocolProfile(this.protocol);
        const protocolJitterSensitivity =
          protocolProfile.jitterSensitivity ?? 1;
        const congestionBoost = linkSnapshot
          ? linkSnapshot.congestion * 4
          : 0;
        // Random jitter movement perpendicular to travel direction
        const jitterAmount =
          (2 + Math.random() * 3 + congestionBoost) *
          protocolJitterSensitivity;
        this.jitterX = (Math.random() - 0.5) * jitterAmount;
        this.jitterY = (Math.random() - 0.5) * jitterAmount;
      } else {
        this.jitterX = 0;
        this.jitterY = 0;
      }

      // Only update progress if not fading
      if (!this.isFading) {
        // Update progress
        if (this.direction === 1) {
          this.progress += this.speed;
          if (this.progress >= 1) {
            this.active = false;
            // Count as successfully received
            incrementStat("packetsReceived");
          }
        } else {
          this.progress -= this.speed;
          if (this.progress <= 0) {
            this.active = false;
            // Count as successfully received
            incrementStat("packetsReceived");
          }
        }
      }

      // Calculate position along the edge (reuse fromNode from above)
      // Skip if fading - stay in current position
      if (!this.isFading) {
        const sample = getPointAndPerpOnEdge(this.edge, this.progress);
        if (sample) {
          this.x =
            sample.x + sample.perpX * this.lateralOffset + this.jitterX;
          this.y =
            sample.y + sample.perpY * this.lateralOffset + this.jitterY;
        }
      }
    }

    draw() {
      if (!this.active) return;

      const packetCount = dataPackets.length;
      let lodLevel = 0;
      if (packetCount > 2500) lodLevel = 2;
      else if (packetCount > 1200) lodLevel = 1;

      if (lodLevel === 1 && this.renderSeed > 0.75) return;
      if (lodLevel === 2 && this.renderSeed > 0.45) return;

      ctx.save();

      if (this.routeHijackGlowAlpha > 0) {
        const glowColor = this.routeHijackGlowColor || this.color;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${this.routeHijackGlowAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        this.routeHijackGlowAlpha = Math.max(0, this.routeHijackGlowAlpha - 0.025);
      }

      ctx.fillStyle = `rgba(${this.colorRgb}, ${this.opacity})`;
      if (lodLevel === 2) {
        const d = this.radius * 2;
        ctx.fillRect(this.x - this.radius, this.y - this.radius, d, d);
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }


  function spawnDataPackets() {
    // Spawn packets on healthy edges
    // Control spawn rate to avoid overwhelming the visualization
    const SPAWN_CHANCE = 0.015; // 1.5% chance per frame to spawn on any given edge
    const incrementProtocolStat = (packet) => {
      if (!packet || !packet.protocol) return;
      switch (packet.protocol) {
        case "DNS":
          incrementStat("totalDnsPackets");
          break;
        case "HTTP":
          incrementStat("totalHttpPackets");
          break;
        case "HTTPS":
          incrementStat("totalHttpsPackets");
          break;
        case "TLS":
          incrementStat("totalTlsPackets");
          break;
        case "SMTP":
          incrementStat("totalSmtpPackets");
          break;
        case "SNMP":
          incrementStat("totalSnmpPackets");
          break;
        default:
          break;
      }
    };

    edges.forEach((edge) => {
      if (
        !edge.from ||
        !edge.to ||
        edge.from.state !== "alive" ||
        edge.to.state !== "alive"
      ) {
        return;
      }

      // Do not spawn packets on edges connected to down (red) nodes
      if (edge.from.status === "red" || edge.to.status === "red") {
        return;
      }

      // Skip spawning on edges connected to migrating botnet nodes (prevents trail artifacts)
      const now = Date.now();
      const MIGRATION_DURATION = 5000;
      const fromMigrating =
        edge.from.botnetFormationTime &&
        now - edge.from.botnetFormationTime < MIGRATION_DURATION;
      const toMigrating =
        edge.to.botnetFormationTime &&
        now - edge.to.botnetFormationTime < MIGRATION_DURATION;
      if (fromMigrating || toMigrating) {
        return;
      }

      // Higher spawn rate on healthy links, lower on compromised ones
      let spawnMultiplier = 1;
      if (edge.to.status === "green" && edge.from.status !== "red") {
        spawnMultiplier = 1.5;
      } else if (
        edge.to.status === "red" ||
        edge.to.status === "malware" ||
        edge.to.status === "botnet"
      ) {
        spawnMultiplier = 0.3;
      } else if (edge.to.status === "yellow") {
        spawnMultiplier = 0.7;
      }

      const linkSnapshot =
        edge.linkQualitySnapshot || computeEdgeQualitySnapshot(edge, now);
      if (linkSnapshot) {
        spawnMultiplier *= Math.max(0.15, linkSnapshot.qualityScore);
      }

      // Spawn packet traveling from parent to child (forward direction)
      if (Math.random() < SPAWN_CHANCE * spawnMultiplier) {
        const packet = new DataPacket(edge, 1);
        dataPackets.push(packet);
        // Track packet type for stats
        if (packet.type === "data") incrementStat("totalDataPackets");
        else if (packet.type === "control")
          incrementStat("totalControlPackets");
        else if (packet.type === "security")
          incrementStat("totalSecurityPackets");
        incrementProtocolStat(packet);
      }

      // Spawn packet traveling from child to parent (backward direction)
      // Less frequent backward traffic
      if (Math.random() < SPAWN_CHANCE * spawnMultiplier * 0.6) {
        const packet = new DataPacket(edge, -1);
        dataPackets.push(packet);
        // Track packet type for stats
        if (packet.type === "data") incrementStat("totalDataPackets");
        else if (packet.type === "control")
          incrementStat("totalControlPackets");
        else if (packet.type === "security")
          incrementStat("totalSecurityPackets");
        incrementProtocolStat(packet);
      }
    });
  }

  function manageDataPackets() {
    // Spawn new packets
    spawnDataPackets();

    // Update and draw existing packets
    for (let i = dataPackets.length - 1; i >= 0; i--) {
      const packet = dataPackets[i];
      packet.update();
      applyRouteHijackerToPacket(packet);
      const consumed = applySinkholeToPacket(packet, "data");
      if (!consumed) {
        packet.draw();
      }

      // Remove inactive packets
      if (!packet.active) {
        dataPackets.splice(i, 1);
      }
    }
  }

  const DataTrafficSystem = {
    /**
     * Connect app-owned arrays, draw context, stats, and hazard hooks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      refreshRuntimeState();
      return this;
    },

    DataPacket,

    spawnDataPackets() {
      refreshRuntimeState();
      spawnDataPackets();
    },

    manageDataPackets() {
      refreshRuntimeState();
      manageDataPackets();
    },
  };

  window.NodeNet.DataTrafficSystem = DataTrafficSystem;
})();
