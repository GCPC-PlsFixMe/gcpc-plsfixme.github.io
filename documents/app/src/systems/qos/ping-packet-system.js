/**
 * @module PingPacketSystem
 * @summary ICMP-style ping packets — Wake-on-LAN recovery pings, echo hops, rendering, cleanup.
 * @exports window.NodeNet.PingPacketSystem
 * @tags ping, icmp, wake-on-lan, recovery, echo, packets, qos
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    ctx: null,
    getNodes: () => [],
    getEdges: () => [],
    getPacketSpeedMultiplier: () => 1,
    applySinkholeToPacket: () => false,
    updateNodeStatus: () => {},
    createPopParticles: () => {},
    logEvent: () => {},
    incrementStat: () => {},
    getLogNodeRef: () => "",
  };

  let ctx = null;
  let nodes = [];
  let edges = [];
  let packetSpeedMultiplier = 1;

  function refreshRuntimeState() {
    ctx = dependencies.ctx;
    nodes = typeof dependencies.getNodes === "function"
      ? dependencies.getNodes()
      : [];
    edges = typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
    packetSpeedMultiplier =
      typeof dependencies.getPacketSpeedMultiplier === "function"
        ? dependencies.getPacketSpeedMultiplier()
        : 1;
  }

  function applySinkholeToPacket(packet, packetType) {
    return dependencies.applySinkholeToPacket(packet, packetType);
  }

  function updateNodeStatus(node, newStatus) {
    dependencies.updateNodeStatus(node, newStatus);
  }

  function createPopParticles(x, y, color) {
    dependencies.createPopParticles(x, y, color);
  }

  function logEvent(key, context) {
    dependencies.logEvent(key, context);
  }

  function incrementStat(statName) {
    dependencies.incrementStat(statName);
  }

  function getLogNodeRef(node) {
    return dependencies.getLogNodeRef(node);
  }

  class PingPacket {
    constructor(sourceNode, targetNode, hopCount = 0) {
      this.source = sourceNode;
      this.target = targetNode;
      this.hopCount = hopCount;
      this.maxHops = 3;
      this.path = this.findPath(sourceNode, targetNode);
      this.progress = 0;
      this.speed = 0.01 * packetSpeedMultiplier;
      this.radius = 2;
      this.x = sourceNode.x;
      this.y = sourceNode.y;
      this.state = "outbound";
      this.strobePhase = 0;
      this.sentTime = Date.now();
      this.latency = 0;
    }

    findPath(start, target) {
      if (start === target) return [start];
      const queue = [[start]];
      const visited = new Set([start.id]);
      while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        if (current === target) return path;
        const neighbors = edges
          .filter((e) =>
            (e.from === current || e.to === current) &&
            !e.isDDOSAttack &&
            !e.isBotnetMesh
          )
          .map((e) => (e.from === current ? e.to : e.from))
          .filter((n) => n && n.state === "alive" && !visited.has(n.id));
        for (const neighbor of neighbors) {
          visited.add(neighbor.id);
          queue.push([...path, neighbor]);
        }
      }
      return [];
    }

    update() {
      if (this.state === "finished") return;

      const targetInvalid =
        !this.target ||
        this.target.state !== "alive" ||
        this.target.state === "retracting";

      let isPathBroken = false;
      if (this.path && this.path.length > 0) {
        for (let i = 0; i < this.path.length - 1; i++) {
          const a = this.path[i];
          const b = this.path[i + 1];
          if (
            a.state === "retracting" ||
            a.state !== "alive" ||
            b.state === "retracting" ||
            b.state !== "alive"
          ) {
            isPathBroken = true;
            break;
          }
          const edgeExists = edges.some((e) =>
            (e.from === a && e.to === b) || (e.from === b && e.to === a)
          );
          if (!edgeExists) {
            isPathBroken = true;
            break;
          }
        }
        if (this.path.length === 1) {
          const a = this.path[0];
          if (a.state === "retracting" || a.state !== "alive") {
            isPathBroken = true;
          }
        }
      }

      if (targetInvalid || isPathBroken) {
        this.state = "fading";
      }

      if (this.state === "fading") {
        if (this.opacity === undefined) this.opacity = 1;
        this.opacity -= 0.05;
        if (this.opacity <= 0) {
          this.state = "finished";
        }
        return;
      }

      this.strobePhase += 0.3;
      if (!this.path || this.path.length === 0) {
        this.state = "finished";
        return;
      }

      this.progress += this.speed;
      const segmentCount = this.path.length - 1;
      const currentSegment = Math.min(
        Math.floor(this.progress * segmentCount),
        segmentCount - 1
      );

      if (currentSegment >= 0 && currentSegment < this.path.length - 1) {
        const fromNode = this.path[currentSegment];
        const toNode = this.path[currentSegment + 1];

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
      }

      const segmentProgress = (this.progress * segmentCount) % 1;
      if (currentSegment >= 0 && currentSegment < this.path.length - 1) {
        const fromNode = this.path[currentSegment];
        const toNode = this.path[currentSegment + 1];
        this.x = fromNode.x + (toNode.x - fromNode.x) * segmentProgress;
        this.y = fromNode.y + (toNode.y - fromNode.y) * segmentProgress;
      }

      if (this.state === "outbound" && this.progress >= 1) {
        this.progress = 1;
        this.x = this.target.x;
        this.y = this.target.y;
        if (this.target.status === "red" && this.target.state === "alive") {
          updateNodeStatus(this.target, "green");
          createPopParticles(this.target.x, this.target.y, {
            r: 255,
            g: 255,
            b: 255,
          });
          logEvent("custom", {
            alert: "💤 Wake-on-LAN restored down node.",
            details: { node: getLogNodeRef(this.target) },
          });
        }
        this.latency = Date.now() - this.sentTime;
        if (this.source.status === "green" || this.source.status === "blue") {
          this.source.lastPingLatency = this.latency;
        }

        if (this.hopCount < this.maxHops) {
          this.state = "echo";
          this.progress = 0;
          const temp = this.source;
          this.source = this.target;
          this.target = temp;
          this.path = this.findPath(this.source, this.target);
        } else {
          this.state = "finished";
        }
      } else if (this.state === "echo" && this.progress >= 1) {
        this.hopCount++;
        if (this.hopCount < this.maxHops) {
          this.state = "outbound";
          this.progress = 0;
          const temp = this.source;
          this.source = this.target;
          this.target = temp;
          this.path = this.findPath(this.source, this.target);
        } else {
          this.state = "finished";
        }
      }
    }

    draw() {
      if (this.state === "finished") return;
      ctx.save();

      if (this.state === "fading") {
        ctx.globalAlpha = this.opacity !== undefined ? this.opacity : 1;
      }

      const strobeIntensity = Math.abs(Math.sin(this.strobePhase));
      const alpha = 0.6 + strobeIntensity * 0.4;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

      if (this.state === "fading") {
        ctx.fillStyle = "rgba(255, 255, 255, 1)";
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      }

      ctx.fill();
      ctx.restore();
    }
  }

  let pingPackets = [];

  function managePingPackets() {
    const now = Date.now();
    const PING_COOLDOWN = 10000;

    nodes.forEach((node) => {
      if (node.state !== "alive" || node.isSatellite) return;

      if (!node.lastPingTime) node.lastPingTime = 0;
      if (!node.lastPingLatency) node.lastPingLatency = 0;

      if (now - node.lastPingTime < PING_COOLDOWN) return;

      const neighbors = edges
        .filter((e) =>
          (e.from === node || e.to === node) &&
          !e.isDDOSAttack &&
          !e.isBotnetMesh
        )
        .map((e) => (e.from === node ? e.to : e.from))
        .filter((n) => n && n.state === "alive");

      const downNeighbors = neighbors.filter((n) => n.status === "red");

      if (downNeighbors.length > 0) {
        const target =
          downNeighbors[Math.floor(Math.random() * downNeighbors.length)];
        const ping = new PingPacket(node, target, 0);
        if (ping.path.length > 0 && ping.path.length <= 4) {
          pingPackets.push(ping);
          node.lastPingTime = now;
          incrementStat("totalPingPackets");
        }
      } else if (
        (node.status === "green" || node.status === "blue") &&
        neighbors.length > 0
      ) {
        const validTargets = neighbors.filter((n) => {
          const p = new PingPacket(node, n, 0);
          return p.path.length > 0 && p.path.length <= 4;
        });

        if (validTargets.length > 0 && Math.random() < 0.05) {
          const target =
            validTargets[Math.floor(Math.random() * validTargets.length)];
          const ping = new PingPacket(node, target, 0);
          if (ping.path.length > 0) {
            pingPackets.push(ping);
            node.lastPingTime = now;
            incrementStat("totalPingPackets");
          }
        }
      }
    });

    for (let i = pingPackets.length - 1; i >= 0; i--) {
      const ping = pingPackets[i];
      ping.update();
      const consumed = applySinkholeToPacket(ping, "ping");
      if (!consumed) {
        ping.draw();
      }
      if (ping.state === "finished") {
        pingPackets.splice(i, 1);
      }
    }
  }

  const PingPacketSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    PingPacket,

    managePingPackets() {
      refreshRuntimeState();
      managePingPackets();
    },

    getPingPackets() {
      return pingPackets;
    },

    clearPingPackets() {
      pingPackets.length = 0;
    },
  };

  window.NodeNet.PingPacketSystem = PingPacketSystem;
})();
