/**
 * @module PingOfDeathSystem
 * @summary Ping-of-death attack — C&C spawns lethal pings, BFS traversal, firewall blocking, node takedown.
 * @exports window.NodeNet.PingOfDeathSystem
 * @tags ping-of-death, attack, ddos, command-control, bfs, firewall-block, takedown, hazard
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
    isGuardianVpnTunnelBetween: () => false,
    getPointAndPerpOnEdge: () => null,
    applySinkholeToPacket: () => false,
    isNodeInDDOSBranch: () => false,
    updateNodeStatus: () => {},
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

  // --------------------------------------------------------------------------
  // CACHED GRADIENTS
  // --------------------------------------------------------------------------

  const pingOfDeathGradients = {
    shockwave: null,
    innerGlow: null,
    radius: 0,
  };

  // --------------------------------------------------------------------------
  // PING OF DEATH PACKET CLASS
  // --------------------------------------------------------------------------

  class PingOfDeath {
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
      this.checkedFirewallNodes = new Set();

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
      if (this.state === "finished") return;

      if (this.state === "fading") {
        this.spikeRotation += 0.1;
        this.electricArcs.forEach((arc) => {
          arc.length += arc.speed;
          if (arc.length > arc.maxLength) {
            arc.length = 0;
            arc.angle = Math.random() * Math.PI * 2;
          }
        });
        return;
      }

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
        if (this.source.activePingOfDeath === this) {
          this.source.activePingOfDeath = null;
        }
        return;
      }

      this.progress += this.speed;

      let totalLength = this.path.length - 1;
      if (totalLength > 0) {
        const currentSegmentIndex = Math.floor(this.progress * totalLength);
        const safeSegmentIndex = Math.min(currentSegmentIndex, totalLength - 1);

        const fromNode = this.path[safeSegmentIndex];
        const toNode = this.path[safeSegmentIndex + 1];

        if (fromNode && toNode) {
          const edgeExists = edges.some((e) =>
            (e.from === fromNode && e.to === toNode) ||
            (e.from === toNode && e.to === fromNode)
          );

          if (!edgeExists) {
            this.state = "fading";
            return;
          }
        }
      }

      // Check for arrival
      if (this.progress >= 1) {
        this.progress = 1;
        this.state = "finished";
        this.x = this.target.x;
        this.y = this.target.y;

        if (this.source.activePingOfDeath === this) {
          this.source.activePingOfDeath = null;
        }

        if (this.target.state === "alive" && this.target.parent !== null) {
          const targetType = this.target.isGuardian
            ? "Guardian"
            : this.target.isDatacenter
            ? "Datacenter"
            : this.target.hasFirewall
            ? "Firewall node"
            : "node";

          if (
            this.target.isDatacenter &&
            Math.random() < (config.datacenter?.pingArrivalBlockChance ?? 0.72)
          ) {
            logEvent("firewallBlockedPing", { firewallNode: this.target });
            incrementStat("totalDefenses");
            this.target.isDefending = true;
            this.target.defenseStartTime = Date.now();
            const colors = getColors();
            createPopParticles(this.target.x, this.target.y, colors.datacenter || { r: 0, g: 224, b: 255 });
            return;
          }

          logEvent("pingOfDeathHit", { target: this.target, targetType });
          incrementStat("pingDeaths");

          updateNodeStatus(this.target, "red");

          this.target.hitByPingOfDeath = true;
          this.target.pingOfDeathTime = Date.now();

          createPopParticles(this.target.x, this.target.y, {
            r: 220,
            g: 38,
            b: 38,
          });
        }
        return;
      }

      // Calculate position along path
      totalLength = this.path.length - 1;
      if (totalLength <= 0) {
        this.state = "finished";
        if (this.source.activePingOfDeath === this) {
          this.source.activePingOfDeath = null;
        }
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

      this.lastSegmentIndex = currentSegmentIndex;

      // Check for firewall blocking
      if (
        fromNode &&
        fromNode.hasFirewall &&
        fromNode.status === "green" &&
        !this.checkedFirewallNodes.has(fromNode.id) &&
        fromNode !== this.source
      ) {
        this.checkedFirewallNodes.add(fromNode.id);

        const pingBlockChance = fromNode.isGuardian
          ? 0.9
          : fromNode.isDatacenter
          ? (config.datacenter?.pingBlockChance ?? 0.88)
          : 0.5;

        if (Math.random() < pingBlockChance) {
          logEvent("firewallBlockedPing", { firewallNode: fromNode });
          incrementStat("totalDefenses");

          fromNode.isDefending = true;
          fromNode.defenseStartTime = Date.now();

          const attackAngle = Math.atan2(
            this.source.y - fromNode.y,
            this.source.x - fromNode.x
          );
          fromNode.triggerForcefieldImpact(attackAngle);

          const colors = getColors();
          createPopParticles(fromNode.x, fromNode.y, colors.neonGreen || { r: 57, g: 255, b: 20 });

          this.state = "finished";
          if (this.source.activePingOfDeath === this) {
            this.source.activePingOfDeath = null;
          }
          return;
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
          if (this.source.activePingOfDeath === this) {
            this.source.activePingOfDeath = null;
          }
          return;
        }
      } else {
        this.opacity = 1;
      }

      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.translate(this.x, this.y);

      if (pingOfDeathGradients.radius !== this.radius) {
        const shockwaveRadius = this.radius * 3;
        pingOfDeathGradients.shockwave = ctx.createRadialGradient(0, 0, 0, 0, 0, shockwaveRadius);
        pingOfDeathGradients.shockwave.addColorStop(0, "rgba(220, 38, 38, 0.4)");
        pingOfDeathGradients.shockwave.addColorStop(0.5, "rgba(139, 0, 0, 0.3)");
        pingOfDeathGradients.shockwave.addColorStop(1, "rgba(0, 0, 0, 0)");

        pingOfDeathGradients.innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.5);
        pingOfDeathGradients.innerGlow.addColorStop(0, "rgba(255, 70, 70, 1)");
        pingOfDeathGradients.innerGlow.addColorStop(1, "rgba(220, 38, 38, 0.8)");

        pingOfDeathGradients.radius = this.radius;
      }

      const shockwaveRadius = this.radius * 3;
      ctx.fillStyle = pingOfDeathGradients.shockwave;
      ctx.beginPath();
      ctx.arc(0, 0, shockwaveRadius, 0, Math.PI * 2);
      ctx.fill();

      this.electricArcs.forEach((arc) => {
        const arcProgress = arc.length / arc.maxLength;
        const arcOpacity = Math.sin(arcProgress * Math.PI) * 0.9;
        const endX = Math.cos(arc.angle) * arc.length;
        const endY = Math.sin(arc.angle) * arc.length;

        ctx.strokeStyle = `rgba(220, 38, 38, ${arcOpacity})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      });

      ctx.rotate(this.spikeRotation);
      ctx.fillStyle = "rgba(139, 0, 0, 0.95)";

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

      ctx.fillStyle = pingOfDeathGradients.innerGlow;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // PACKET POOL
  // --------------------------------------------------------------------------

  let pingOfDeathPackets = [];

  // --------------------------------------------------------------------------
  // MANAGE PING OF DEATH
  // --------------------------------------------------------------------------

  function managePingOfDeath() {
    const nodes = getNodes();
    const ccNodes = nodes.filter(
      (n) =>
        n.status === "commandControl" &&
        n.state === "alive" &&
        n.parent !== null
    );

    ccNodes.forEach((ccNode) => {
      const now = Date.now();

      const connectedGreenNodes = [];
      edges.forEach((edge) => {
        if (edge.isBotnetMesh) {
          let otherNode = null;
          if (
            edge.from === ccNode &&
            edge.to.state === "alive" &&
            edge.to.status === "green"
          ) {
            otherNode = edge.to;
          } else if (
            edge.to === ccNode &&
            edge.from.state === "alive" &&
            edge.from.status === "green"
          ) {
            otherNode = edge.from;
          }
          if (
            otherNode &&
            !otherNode.isSatellite &&
            !otherNode.isGroundStation &&
            !connectedGreenNodes.includes(otherNode)
          ) {
            connectedGreenNodes.push(otherNode);
          }
        }
      });

      const hasConnectedGreenNodes = connectedGreenNodes.length > 0;

      const ddosSpeedBoost = ccNode.ddosState === "active" ? 2.0 : 1.0;
      const PING_COOLDOWN =
        (hasConnectedGreenNodes ? 4000 : 8000) /
        attackFreqMultiplier /
        ddosSpeedBoost;
      const baseAttackChance =
        (hasConnectedGreenNodes ? 0.4 : 0.15) * attackFreqMultiplier;
      const attackChance = baseAttackChance * ddosSpeedBoost;

      if (ccNode.isSelfInflictedDDOS) return;

      if (
        ccNode.activePingOfDeath ||
        now - ccNode.lastPingTime < PING_COOLDOWN
      ) {
        return;
      }

      if (Math.random() < Math.min(1, attackChance)) {
        let target;

        if (ccNode.ddosState === "active" && ccNode.ddosTargetBranch) {
          const branchTargets = nodes.filter(
            (n) =>
              n.state === "alive" &&
              n.parent !== null &&
              n !== ccNode &&
              !n.isSatellite &&
              !n.isGroundStation &&
              isNodeInDDOSBranch(n)
          );
          if (branchTargets.length > 0) {
            target =
              branchTargets[
                Math.floor(Math.random() * branchTargets.length)
              ];
          }
        } else {
          if (connectedGreenNodes.length > 0 && Math.random() < 0.9) {
            target =
              connectedGreenNodes[
                Math.floor(Math.random() * connectedGreenNodes.length)
              ];
            logEvent("commandControlAggressiveAttack", { ccNode, target });
          } else {
            const validTargets = nodes.filter(
              (n) =>
                n.state === "alive" &&
                n.parent !== null &&
                n !== ccNode &&
                !n.isCommandControl &&
                !n.isSatellite &&
                !n.isGroundStation
            );

            if (validTargets.length > 0) {
              const nonLeafNodes = validTargets.filter(
                (n) => n.children && n.children.length > 0
              );
              if (nonLeafNodes.length > 0 && Math.random() < 0.7) {
                target =
                  nonLeafNodes[
                    Math.floor(Math.random() * nonLeafNodes.length)
                  ];
              } else {
                target =
                  validTargets[
                    Math.floor(Math.random() * validTargets.length)
                  ];
              }
            }
          }
        }

        if (target) {
          const ping = new PingOfDeath(ccNode, target);

          if (ping.path && ping.path.length > 0) {
            pingOfDeathPackets.push(ping);
            ccNode.activePingOfDeath = ping;
            ccNode.lastPingTime = now;
            const targetType =
              target.children && target.children.length > 0
                ? "branch"
                : "leaf";
            logEvent("pingOfDeathSent", {
              ccNode,
              target,
              targetType,
              pathLength: ping.path.length,
            });
            incrementStat("totalAttacks");
            incrementStat("totalPingPackets");
          } else {
            logEvent("pingOfDeathFailed", { ccNode });
          }
        }
      }
    });

    pingOfDeathPackets.forEach((ping) => {
      ping.update();
      const consumed = applySinkholeToPacket(ping, "pingOfDeath");
      if (!consumed) {
        ping.draw();
      }
    });

    pingOfDeathPackets = pingOfDeathPackets.filter(
      (ping) => ping.state !== "finished"
    );
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  const PingOfDeathSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    managePingOfDeath() {
      refreshRuntimeState();
      managePingOfDeath();
    },

    getPingOfDeathPackets() {
      return pingOfDeathPackets;
    },

    clearPingOfDeathPackets() {
      pingOfDeathPackets.length = 0;
    },
  };

  window.NodeNet.PingOfDeathSystem = PingOfDeathSystem;
})();
