/**
 * @module CounterStrikeSystem
 * @summary Guardian counter-strike packets — chase attackers, downgrade their attacks, render the retaliation.
 * @exports window.NodeNet.CounterStrikeSystem
 * @tags counter-strike, retaliation, guardian, defense, attack-downgrade, packets
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    ctx: null,
    getEdges: () => [],
    getPacketSpeedMultiplier: () => 1,
    isGuardianVpnTunnelBetween: () => false,
    getPointAndPerpOnEdge: () => null,
    applySinkholeToPacket: () => false,
    incrementStat: () => {},
    logEvent: () => {},
    createPopParticles: () => {},
    getLogNodeRef: () => "",
  };

  let ctx = null;
  let edges = [];
  let packetSpeedMultiplier = 1;

  function refreshRuntimeState() {
    ctx = dependencies.ctx;
    edges = typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
    packetSpeedMultiplier =
      typeof dependencies.getPacketSpeedMultiplier === "function"
        ? dependencies.getPacketSpeedMultiplier()
        : 1;
  }

  function isGuardianVpnTunnelBetween(nodeA, nodeB) {
    return dependencies.isGuardianVpnTunnelBetween(nodeA, nodeB);
  }

  function getPointAndPerpOnEdge(edge, progress) {
    return dependencies.getPointAndPerpOnEdge(edge, progress);
  }

  function applySinkholeToPacket(packet, packetType) {
    return dependencies.applySinkholeToPacket(packet, packetType);
  }

  function incrementStat(statName) {
    dependencies.incrementStat(statName);
  }

  function logEvent(key, context) {
    dependencies.logEvent(key, context);
  }

  function createPopParticles(x, y, color) {
    dependencies.createPopParticles(x, y, color);
  }

  function getLogNodeRef(node) {
    return dependencies.getLogNodeRef(node);
  }

  // --------------------------------------------------------------------------
  // COUNTER-STRIKE PACKET CLASS
  // --------------------------------------------------------------------------

  class CounterStrikePacket {
    constructor(guardianNode, targetNode, attackPath) {
      this.guardian = guardianNode;
      this.target = targetNode;
      // Reverse the attack path for traceback
      this.path = attackPath ? [...attackPath].reverse() : null;
      this.progress = 0;
      this.speed = 0.012 * packetSpeedMultiplier; // Standardized counter-strike speed
      this.radius = 5;
      this.x = guardianNode.x;
      this.y = guardianNode.y;
      this.state = "active";
      this.color = { r: 96, g: 165, b: 250 }; // Bright blue
      this.lightning = []; // Electric arc effects
      this.lightningUpdateCounter = 0;
    }

    update() {
      refreshRuntimeState();

      if (this.state === "finished") return;
      if (this.state === "fading") {
        if (this.opacity === undefined) this.opacity = 1;
        this.opacity -= 0.05;
        if (this.opacity <= 0) {
          this.state = "finished";
        }
        return;
      }

      if (!this.path || this.path.length === 0) {
        this.state = "finished";
        return;
      }

      this.progress += this.speed;

      // Check for arrival at target
      if (this.progress >= 1) {
        this.progress = 1;
        this.state = "finished";
        this.x = this.target.x;
        this.y = this.target.y;

        // Apply counter-strike effect on arrival
        if (this.target.state === "alive") {
          const previousStatus = this.target.status;

          // Downgrade the infected node
          if (this.target.status === "commandControl") {
            this.target.status = "botnet";
            logEvent("custom", {
              alert: "⚡ Counter-strike downgraded C&C node.",
              details: {
                node: getLogNodeRef(this.target),
                from: previousStatus,
                to: "botnet",
              },
            });
          } else if (this.target.status === "botnet") {
            this.target.status = "malware";
            logEvent("custom", {
              alert: "⚡ Counter-strike downgraded botnet.",
              details: {
                node: getLogNodeRef(this.target),
                from: previousStatus,
                to: "malware",
              },
            });
          } else if (this.target.status === "malware") {
            this.target.status = "green";
            this.target.isImmunityHealing = false;
            this.target.attachedImmunityPackets = [];
            incrementStat("totalRecoveries");
            logEvent("custom", {
              alert: "⚡ Counter-strike cleansed node.",
              details: {
                node: getLogNodeRef(this.target),
                from: previousStatus,
                to: "green",
              },
            });
          }

          this.target.statusChangeTime = Date.now();

          // Visual feedback
          createPopParticles(this.target.x, this.target.y, this.color);
        }
        return;
      }

      // Calculate position along path
      const totalLength = this.path.length - 1;
      if (totalLength <= 0) {
        this.state = "finished";
        return;
      }

      const currentSegmentIndex = Math.floor(this.progress * totalLength);
      const segmentProgress =
        this.progress * totalLength - currentSegmentIndex;
      const fromNode = this.path[currentSegmentIndex];
      const toNode = this.path[currentSegmentIndex + 1];

      // Validate current segment nodes and edge are still valid
      if (
        !fromNode ||
        !toNode ||
        fromNode.state === "retracting" ||
        fromNode.state === "drifting" ||
        toNode.state === "retracting" ||
        toNode.state === "drifting"
      ) {
        this.state = "fading";
        return;
      }

      const edgeExists = edges.some((e) =>
        (e.from === fromNode && e.to === toNode) ||
        (e.from === toNode && e.to === fromNode)
      );

      if (!edgeExists) {
        this.state = "fading";
        return;
      }

      if (fromNode && toNode) {
        const isVpnSegment = isGuardianVpnTunnelBetween(fromNode, toNode);
        const sample = getPointAndPerpOnEdge(
          { from: fromNode, to: toNode, isGuardianVpnTunnel: isVpnSegment },
          segmentProgress
        );

        if (sample) {
          this.x = sample.x;
          this.y = sample.y;
        } else {
          this.x = fromNode.x + (toNode.x - fromNode.x) * segmentProgress;
          this.y = fromNode.y + (toNode.y - fromNode.y) * segmentProgress;
        }

        // Generate lightning effect periodically
        this.lightningUpdateCounter++;
        if (this.lightningUpdateCounter % 3 === 0) {
          this.lightning = [];
          for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = this.radius + Math.random() * 15;
            this.lightning.push({
              x: this.x + Math.cos(angle) * dist,
              y: this.y + Math.sin(angle) * dist,
            });
          }
        }
      }
    }

    draw() {
      if (this.state === "finished") return;

      ctx.save();

      if (this.state === "fading") {
        ctx.globalAlpha = this.opacity !== undefined ? this.opacity : 1;
      }

      // Draw lightning arcs
      ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.4)`;
      ctx.lineWidth = 1.5;
      this.lightning.forEach((bolt) => {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(bolt.x, bolt.y);
        ctx.stroke();
      });

      // Draw main packet with simple flat fill
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 1)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw inner white core
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // PACKET POOL
  // --------------------------------------------------------------------------

  let counterStrikePackets = [];

  // --------------------------------------------------------------------------
  // MANAGE COUNTER-STRIKES
  // --------------------------------------------------------------------------

  function manageCounterStrikes() {
    // Update and draw all counter-strike packets
    counterStrikePackets.forEach((strike) => {
      strike.update();
      const consumed = applySinkholeToPacket(strike, "counterStrike");
      if (!consumed) {
        strike.draw();
      }
    });

    // Remove finished counter-strikes
    counterStrikePackets = counterStrikePackets.filter(
      (strike) => strike.state !== "finished"
    );
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  const CounterStrikeSystem = {
    /**
     * Connect app-owned state, draw context, and helper callbacks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    CounterStrikePacket,

    manageCounterStrikes() {
      refreshRuntimeState();
      manageCounterStrikes();
    },

    createCounterStrike(guardianNode, targetNode, attackPath) {
      const strike = new CounterStrikePacket(guardianNode, targetNode, attackPath);
      counterStrikePackets.push(strike);
      return strike;
    },

    getCounterStrikePackets() {
      return counterStrikePackets;
    },

    clearCounterStrikePackets() {
      counterStrikePackets.length = 0;
    },
  };

  window.NodeNet.CounterStrikeSystem = CounterStrikeSystem;
})();
