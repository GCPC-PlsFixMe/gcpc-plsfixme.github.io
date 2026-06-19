/**
 * @module PhishPacketSystem
 * @summary Phishing attack — C&C phish packets, BFS traversal, infection attempts, defender blocking, counter-strike + guardian promotion.
 * @exports window.NodeNet.PhishPacketSystem
 * @tags phishing, attack, infection, command-control, bfs, defender-block, guardian, counter-strike
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    ctx: null,
    config: {},
    getNodes: () => [],
    getEdges: () => [],
    getPacketSpeedMultiplier: () => 1,
    getAttackFreqMultiplier: () => 1,
    getColors: () => ({}),
    counterStrikeSystem: null,
    isGuardianVpnTunnelBetween: () => false,
    getPointAndPerpOnEdge: () => null,
    applySinkholeToPacket: () => false,
    isNodeInDDOSBranch: () => false,
    updateNodeStatus: () => {},
    trySpawnGuardian: () => {},
    incrementStat: () => {},
    logEvent: () => {},
    getLogNodeRef: () => "",
    createPopParticles: () => {},
  };

  let ctx = null;
  let config = {};
  let edges = [];
  let packetSpeedMultiplier = 1;
  let attackFreqMultiplier = 1;

  function refreshRuntimeState() {
    ctx = dependencies.ctx;
    config = dependencies.config || {};
    edges = typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
    packetSpeedMultiplier =
      typeof dependencies.getPacketSpeedMultiplier === "function"
        ? dependencies.getPacketSpeedMultiplier()
        : 1;
    attackFreqMultiplier =
      typeof dependencies.getAttackFreqMultiplier === "function"
        ? dependencies.getAttackFreqMultiplier()
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

  function isGuardianVpnTunnelBetween(nodeA, nodeB) {
    return dependencies.isGuardianVpnTunnelBetween(nodeA, nodeB);
  }

  function getPointAndPerpOnEdge(edge, progress) {
    return dependencies.getPointAndPerpOnEdge(edge, progress);
  }

  function applySinkholeToPacket(packet, packetType) {
    return dependencies.applySinkholeToPacket(packet, packetType);
  }

  function isNodeInDDOSBranch(node) {
    return dependencies.isNodeInDDOSBranch(node);
  }

  function updateNodeStatus(node, status) {
    dependencies.updateNodeStatus(node, status);
  }

  function trySpawnGuardian(node) {
    dependencies.trySpawnGuardian(node);
  }

  function incrementStat(statName) {
    dependencies.incrementStat(statName);
  }

  function logEvent(key, context) {
    dependencies.logEvent(key, context);
  }

  function getLogNodeRef(node) {
    return dependencies.getLogNodeRef(node);
  }

  function createPopParticles(x, y, color) {
    dependencies.createPopParticles(x, y, color);
  }

  function getCounterStrikeSystem() {
    return dependencies.counterStrikeSystem;
  }

  // --------------------------------------------------------------------------
  // CACHED GRADIENTS
  // --------------------------------------------------------------------------

  const phishPacketGradients = {
    shockwave: null,
    innerGlow: null,
    radius: 0,
  };

  // --------------------------------------------------------------------------
  // PHISH PACKET CLASS
  // --------------------------------------------------------------------------

  class PhishPacket {
    constructor(sourceNode, targetNode) {
      this.source = sourceNode;
      this.target = targetNode;
      this.path = this.findPath(sourceNode, targetNode);
      this.progress = 0;
      this.speed = 0.008 * packetSpeedMultiplier;
      this.radius = 6;
      this.x = sourceNode.x;
      this.y = sourceNode.y;
      this.state = "active";
      this.spikes = 8;
      this.spikeRotation = 0;
      this.electricArcs = [];
      this.lastSegmentIndex = -1;

      for (let i = 0; i < 3; i++) {
        this.electricArcs.push({
          angle: Math.random() * Math.PI * 2,
          length: 0,
          maxLength: this.radius * 2,
          speed: 0.3 + Math.random() * 0.3,
        });
      }
    }

    findPath(start, target) {
      if (start === target) return [start];

      const queue = [[start]];
      const visited = new Set([start.id]);

      while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];

        const neighbors = [...current.children];
        if (current.parent) neighbors.push(current.parent);

        edges.forEach((edge) => {
          if (edge.isBotnetMesh) {
            if (edge.from === current && !neighbors.includes(edge.to)) {
              neighbors.push(edge.to);
            } else if (
              edge.to === current &&
              !neighbors.includes(edge.from)
            ) {
              neighbors.push(edge.from);
            }
          }
        });

        for (const neighbor of neighbors) {
          if (!neighbor || neighbor.state !== "alive") continue;
          if (visited.has(neighbor.id)) continue;

          visited.add(neighbor.id);
          const newPath = [...path, neighbor];

          if (neighbor === target) {
            return newPath;
          }

          queue.push(newPath);
        }
      }

      return null;
    }

    update() {
      if (this.state !== "active") return;

      if (
        !this.source ||
        !this.target ||
        this.source.state === "retracting" ||
        this.source.state === "drifting" ||
        this.target.state === "retracting" ||
        this.target.state === "drifting"
      ) {
        this.state = "fading";
        return;
      }

      this.spikeRotation += 0.1;

      this.electricArcs.forEach((arc) => {
        arc.length += arc.speed;
        if (arc.length > arc.maxLength) {
          arc.length = 0;
          arc.angle = Math.random() * Math.PI * 2;
        }
      });

      if (!this.path || this.path.length === 0) {
        this.state = "finished";
        return;
      }

      this.progress += this.speed;

      // Check for arrival
      if (this.progress >= 1) {
        this.progress = 1;
        this.state = "finished";
        this.x = this.target.x;
        this.y = this.target.y;

        if (
          this.target.state === "alive" &&
          this.target.parent !== null &&
          this.target.status === "green"
        ) {
          let blocked = false;
          let defenderType = "";
          if (this.target.isGuardian) {
            blocked = Math.random() < 0.5;
            defenderType = "Guardian";
          } else if (this.target.isDatacenter) {
            blocked = Math.random() < (config.datacenter?.phishingBlockChance ?? 0.80);
            defenderType = "Datacenter Firewall";
          } else if (
            this.target.hasFirewall &&
            this.target.shieldStrength > 0
          ) {
            blocked = Math.random() < 0.25;
            defenderType = "Firewall";
          }

          if (blocked) {
            logEvent("phishingBlocked", {
              node: this.target,
              defender: defenderType,
            });
            incrementStat("totalDefenses");

            if (this.target.hasFirewall || this.target.isGuardian || this.target.isDatacenter) {
              const phishAngle = Math.atan2(
                this.source.y - this.target.y,
                this.source.x - this.target.x
              );
              this.target.triggerForcefieldImpact(phishAngle);
            }

            const colors = getColors();
            createPopParticles(
              this.target.x,
              this.target.y,
              colors.malware || { r: 168, g: 85, b: 247 }
            );

            // Guardian Counter-Strike: 50% chance to traceback
            if (this.target.isGuardian && Math.random() < 0.5) {
              const cs = getCounterStrikeSystem();
              if (cs && cs.createCounterStrike) {
                cs.createCounterStrike(
                  this.target,
                  this.source,
                  this.path
                );
              }
              logEvent("custom", {
                alert: "⚡ Guardian launched counter-strike traceback!",
                details: {
                  guardian: getLogNodeRef(this.target),
                  target: getLogNodeRef(this.source),
                },
              });
            }
          } else {
            this.target.isDefending = true;
            this.target.defenseStartTime = Date.now();
            const colors = getColors();
            createPopParticles(
              this.target.x,
              this.target.y,
              colors.malware || { r: 168, g: 85, b: 247 }
            );
            logEvent("phishingDefended", { node: this.target });

            trySpawnGuardian(this.target);

            updateNodeStatus(this.target, "malware");
            logEvent("phishingSuccess", { target: this.target });
            incrementStat("phishSuccess");
            incrementStat("totalInfections");
          }
        }
        return;
      }

      // Calculate position along path
      const totalLength = this.path.length - 1;
      if (totalLength <= 0) {
        this.state = "finished";
        return;
      }

      const clampedProgress = this.progress;
      const currentSegmentIndex = Math.floor(clampedProgress * totalLength);
      const segmentProgress =
        clampedProgress * totalLength - currentSegmentIndex;
      const fromNode = this.path[currentSegmentIndex];
      const toNode = this.path[currentSegmentIndex + 1];

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

      this.lastSegmentIndex = currentSegmentIndex;

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
      }

      // Check for abort conditions
      const targetInvalid =
        !this.target ||
        this.target.state !== "alive" ||
        this.target.state === "retracting";

      const isPathBroken = this.path.some(
        (node) => node.state === "retracting" || node.state !== "alive"
      );

      let isEdgeBroken = false;
      if (fromNode && toNode) {
        isEdgeBroken = !edges.some((e) =>
          (e.from === fromNode && e.to === toNode) ||
          (e.from === toNode && e.to === fromNode)
        );
      }

      if (targetInvalid || isPathBroken || isEdgeBroken) {
        this.state = "fading";
      }
    }

    draw() {
      if (this.state === "finished") return;

      if (this.state === "fading") {
        if (this.opacity === undefined) this.opacity = 1;
        this.opacity -= 0.05;
        if (this.opacity <= 0) {
          this.state = "finished";
          return;
        }
      } else {
        this.opacity = 1;
      }

      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.translate(this.x, this.y);

      if (phishPacketGradients.radius !== this.radius) {
        const shockwaveRadius = this.radius * 3;
        phishPacketGradients.shockwave = ctx.createRadialGradient(0, 0, 0, 0, 0, shockwaveRadius);
        phishPacketGradients.shockwave.addColorStop(0, "rgba(168, 85, 247, 0.4)");
        phishPacketGradients.shockwave.addColorStop(0.5, "rgba(124, 58, 237, 0.3)");
        phishPacketGradients.shockwave.addColorStop(1, "rgba(0, 0, 0, 0)");

        phishPacketGradients.innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.5);
        phishPacketGradients.innerGlow.addColorStop(0, "rgba(192, 132, 252, 1)");
        phishPacketGradients.innerGlow.addColorStop(1, "rgba(168, 85, 247, 0.8)");

        phishPacketGradients.radius = this.radius;
      }

      const shockwaveRadius = this.radius * 3;
      ctx.fillStyle = phishPacketGradients.shockwave;
      ctx.beginPath();
      ctx.arc(0, 0, shockwaveRadius, 0, Math.PI * 2);
      ctx.fill();

      this.electricArcs.forEach((arc) => {
        const arcProgress = arc.length / arc.maxLength;
        const arcOpacity = Math.sin(arcProgress * Math.PI) * 0.9;
        const endX = Math.cos(arc.angle) * arc.length;
        const endY = Math.sin(arc.angle) * arc.length;

        ctx.strokeStyle = `rgba(168, 85, 247, ${arcOpacity})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      });

      ctx.rotate(this.spikeRotation);
      ctx.fillStyle = "rgba(124, 58, 237, 0.95)";

      ctx.beginPath();
      for (let i = 0; i < this.spikes; i++) {
        const angle = (i / this.spikes) * Math.PI * 2;
        const nextAngle = ((i + 1) / this.spikes) * Math.PI * 2;

        const innerRadius = this.radius * 0.6;
        const innerX = Math.cos(angle) * innerRadius;
        const innerY = Math.sin(angle) * innerRadius;

        const midAngle = (angle + nextAngle) / 2;
        const outerX = Math.cos(midAngle) * this.radius * 1.5;
        const outerY = Math.sin(midAngle) * this.radius * 1.5;

        if (i === 0) {
          ctx.moveTo(innerX, innerY);
        } else {
          ctx.lineTo(innerX, innerY);
        }
        ctx.lineTo(outerX, outerY);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = phishPacketGradients.innerGlow;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // PACKET POOL
  // --------------------------------------------------------------------------

  let phishPackets = [];

  // --------------------------------------------------------------------------
  // MANAGE PHISH PACKETS
  // --------------------------------------------------------------------------

  function managePhishPackets() {
    const nodes = getNodes();
    const ccNodes = nodes.filter(
      (n) =>
        n.status === "commandControl" &&
        n.state === "alive" &&
        n.parent !== null
    );

    ccNodes.forEach((ccNode) => {
      if (ccNode.isSelfInflictedDDOS) return;

      const ddosSpeedBoost = ccNode.ddosState === "active" ? 2.0 : 1.0;
      const PHISH_BURST_COOLDOWN =
        15000 / attackFreqMultiplier / ddosSpeedBoost;
      const now = Date.now();

      if (!ccNode.lastPhishBurstTime) {
        ccNode.lastPhishBurstTime = 0;
      }

      if (now - ccNode.lastPhishBurstTime < PHISH_BURST_COOLDOWN) {
        return;
      }

      const baseChance = 0.1 * attackFreqMultiplier;
      const attackChance = baseChance * ddosSpeedBoost;

      if (Math.random() < Math.min(1, attackChance)) {
        let validTargets = nodes.filter(
          (n) =>
            n.state === "alive" &&
            n.parent !== null &&
            n !== ccNode &&
            n.status === "green" &&
            !n.isCommandControl &&
            !n.isSatellite &&
            !n.isGroundStation
        );

        if (ccNode.ddosState === "active" && ccNode.ddosTargetBranch) {
          const branchTargets = validTargets.filter((n) =>
            isNodeInDDOSBranch(n)
          );
          if (branchTargets.length > 0) {
            validTargets = branchTargets;
          } else {
            validTargets = [];
          }
        }

        if (validTargets.length > 0) {
          const burstSize = Math.min(3, Math.floor(Math.random() * 3) + 1);

          for (let i = 0; i < burstSize; i++) {
            const target =
              validTargets[Math.floor(Math.random() * validTargets.length)];
            const phish = new PhishPacket(ccNode, target);

            if (phish.path && phish.path.length > 0) {
              phishPackets.push(phish);
              incrementStat("totalAttacks");
              incrementStat("totalPhishPackets");
            }
          }

          ccNode.lastPhishBurstTime = now;
          logEvent("commandControlPhishBurst", { ccNode, burstSize });
        }
      }
    });

    phishPackets.forEach((phish) => {
      phish.update();
      const consumed = applySinkholeToPacket(phish, "phish");
      if (!consumed) {
        phish.draw();
      }
    });

    phishPackets = phishPackets.filter(
      (phish) => phish.state !== "finished"
    );
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  const PhishPacketSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    managePhishPackets() {
      refreshRuntimeState();
      managePhishPackets();
    },

    getPhishPackets() {
      return phishPackets;
    },

    clearPhishPackets() {
      phishPackets.length = 0;
    },
  };

  window.NodeNet.PhishPacketSystem = PhishPacketSystem;
})();
