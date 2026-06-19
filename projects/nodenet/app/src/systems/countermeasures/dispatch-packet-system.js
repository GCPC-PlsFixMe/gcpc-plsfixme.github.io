/**
 * @module DispatchPacketSystem
 * @summary Dispatch packets — remediation delivery, guardian threat-hunting dispatches, path traversal, rendering.
 * @exports window.NodeNet.DispatchPacketSystem
 * @tags dispatch, remediation, guardian, threat-hunting, packets, defense, delivery
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    ctx: null,
    getNodes: () => [],
    getEdges: () => [],
    getPacketSpeedMultiplier: () => 1,
    getColors: () => ({}),
    buildNodePath: () => [],
    isNodeInDDOSBranch: () => false,
    getNodeDefenseBonus: () => 0,
    isGuardianVpnTunnelBetween: () => false,
    getPointAndPerpOnEdge: () => null,
    applySinkholeToPacket: () => false,
    incrementStat: () => {},
    logEvent: () => {},
    createPopParticles: () => {},
    getLogNodeRef: () => "",
  };

  let ctx = null;
  let nodes = [];
  let edges = [];
  let colors = {};
  let packetSpeedMultiplier = 1;

  function refreshRuntimeState() {
    ctx = dependencies.ctx;
    nodes = typeof dependencies.getNodes === "function"
      ? dependencies.getNodes()
      : [];
    edges = typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
    colors = typeof dependencies.getColors === "function"
      ? dependencies.getColors()
      : {};
    packetSpeedMultiplier =
      typeof dependencies.getPacketSpeedMultiplier === "function"
        ? dependencies.getPacketSpeedMultiplier()
        : 1;
  }

  function buildNodePath(origin, target) {
    return dependencies.buildNodePath(origin, target);
  }

  function isNodeInDDOSBranch(node) {
    return dependencies.isNodeInDDOSBranch(node);
  }

  function getNodeDefenseBonus(node) {
    return dependencies.getNodeDefenseBonus(node);
  }

  function isGuardianVpnTunnelBetween(nodeA, nodeB) {
    return dependencies.isGuardianVpnTunnelBetween(nodeA, nodeB);
  }

  function getPointAndPerpOnEdge(edge, t) {
    return dependencies.getPointAndPerpOnEdge(edge, t);
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
  // DISPATCH PACKET CLASS
  // --------------------------------------------------------------------------

  class DispatchPacket {
    constructor(targetNode, originNode = null) {
      this.origin = originNode || nodes[0];
      this.target = targetNode;
      this.path = buildNodePath(this.origin, targetNode);
      if (!this.path.length) {
        this.state = "finished";
        return;
      }
      this.progress = 0;
      // Standardized dispatch packet speed
      const baseSpeed = 0.006; // Consistent speed for all dispatch packets
      const pathLength = Math.max(1, this.path.length - 1); // Number of segments
      this.speed = (baseSpeed / pathLength) * packetSpeedMultiplier; // Longer paths = slower progress per frame
      this.radius = 2.5; // Dispatch packet size (reduced by 50%)
      this.x = this.path[0].x;
      this.y = this.path[0].y;
      this.state = "active";
      this.opacity = 1;
    }

    update() {
      if (this.state === "finished") return;

      if (this.state === "fading") {
        this.opacity -= 0.05;
        if (this.opacity <= 0) {
          this.state = "finished";
          this.target.isTargeted = false;
        }
        return;
      }

      // Apply DDOS slowdown if target node is in affected branch
      let effectiveSpeed = this.speed;
      if (this.target && isNodeInDDOSBranch(this.target)) {
        effectiveSpeed *= 0.15; // Dispatch packets severely slowed during DDOS
      }

      this.progress += effectiveSpeed;

      // First, check for successful arrival
      if (this.progress >= 1) {
        this.progress = 1;
        this.state = "finished";
        this.x = this.target.x;
        this.y = this.target.y;

        if (
          this.target.remediationState === "none" &&
          this.target.state === "alive" &&
          (this.target.status === "malware" ||
            this.target.status === "botnet" ||
            this.target.status === "commandControl")
        ) {
          // C&C nodes are hardest to remediate (40%), botnet (25%), regular malware (10%)
          let baseDefenseChance = 0.1;
          if (this.target.status === "botnet") baseDefenseChance = 0.25;
          if (this.target.status === "commandControl")
            baseDefenseChance = 0.4;

          // Apply size-based defense bonus
          const defenseBonus = getNodeDefenseBonus(this.target);
          const defenseCap = this.target.isGuardian ? 0.95 : 0.75;
          const defenseChance = Math.min(
            baseDefenseChance + defenseBonus,
            defenseCap
          );

          if (Math.random() < defenseChance) {
            this.target.isDefending = true;
            this.target.defenseStartTime = Date.now();
          } else {
            this.target.startRemediation();
            // Flag for post-remediation guardian promotion check
            this.target.pendingDispatchPromotionCheck = true;
            logEvent("dispatchSuccessful", { target: this.target });
          }
        }
        return;
      }

      // For packets still in transit, calculate position and check for abort conditions
      let totalLength = this.path.length - 1;
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

      // Update position before checking for failures to ensure pop happens at the right spot
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
      } else {
        // Fallback pop if path is somehow invalid
        this.state = "fading";
        return;
      }

      // Check for abort conditions
      const isPhysicallyBroken = this.path.some(
        (node) => node.state === "retracting"
      );
      const remainingPath = this.path.slice(currentSegmentIndex + 1);
      const isLogicallyBlocked = remainingPath.some(
        (node) => node.status === "red" || node.status === "yellow"
      );

      // NEW: Check if any node in the path has become infected (excluding root and target)
      // Only the first infected node in a chain should be targeted, so if any upstream
      // or intermediate node becomes infected, cancel this dispatch packet
      const intermediateNodes = this.path.slice(1, -1); // All nodes except root and target
      const hasUpstreamInfection = intermediateNodes.some(
        (node) =>
          node.status === "malware" ||
          node.status === "botnet" ||
          node.status === "commandControl"
      );

      if (
        isPhysicallyBroken ||
        isLogicallyBlocked ||
        hasUpstreamInfection
      ) {
        // Only create particles if path is blocked by infection or status, not retraction
        // Retraction happens during cleanup, so we silently remove the pulse
        if (!isPhysicallyBroken) {
          this.state = "fading";
          // Log dispatch blocked if it's due to infected nodes
          if (isLogicallyBlocked || hasUpstreamInfection) {
            logEvent("dispatchBlocked", { target: this.target });
          }
        } else {
          this.state = "finished";
          this.target.isTargeted = false; // Allow a new pulse to be sent
        }
        return;
      }
    }

    draw() {
      if (this.state === "finished") return;

      const c = colors;
      if (!c.gold || !c.red || !c.blue) return;

      // Orb color
      const goldColor = `rgba(${c.gold.r}, ${c.gold.g}, ${c.gold.b}, ${this.opacity})`;

      // Pulsing light effect
      const now = Date.now();
      const cycle = 1000; // Time in ms for a full red-blue pulse cycle
      const progress = (now % cycle) / cycle;

      let pulseColor, pulseRadius;

      const basePulseRadius = this.radius * 2.5;
      const pulseRange = this.radius * 2;

      if (progress < 0.5) {
        // First half: Red pulse expands and fades
        const redProgress = progress * 2;
        pulseColor = `rgba(${c.red.r}, ${c.red.g}, ${
          c.red.b
        }, ${0.7 * (1 - redProgress) * this.opacity})`;
        pulseRadius = basePulseRadius + pulseRange * redProgress;
      } else {
        // Second half: Blue pulse expands and fades
        const blueProgress = (progress - 0.5) * 2;
        pulseColor = `rgba(${c.blue.r}, ${c.blue.g}, ${
          c.blue.b
        }, ${0.7 * (1 - blueProgress) * this.opacity})`;
        pulseRadius = basePulseRadius + pulseRange * blueProgress;
      }

      ctx.save();

      // Draw the expanding pulse
      ctx.beginPath();
      ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = pulseColor;
      ctx.fill();

      // Draw the central dispatch packet
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = goldColor;
      ctx.fill();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // PACKET POOL
  // --------------------------------------------------------------------------

  let dispatchPackets = [];

  // --------------------------------------------------------------------------
  // GUARDIAN THREAT HUNTING
  // --------------------------------------------------------------------------

  let lastThreatScan = 0;
  const THREAT_SCAN_INTERVAL = 3000; // Scan every 3 seconds
  const GUARDIAN_DISPATCH_INTERVAL = 10000; // Guardians can send dispatch packets every 10 seconds
  const THREAT_SCAN_RADIUS = 200; // Detection radius

  function guardianThreatHunting() {
    const now = Date.now();
    if (now - lastThreatScan < THREAT_SCAN_INTERVAL) return;
    lastThreatScan = now;

    const guardians = nodes.filter(
      (n) => n.state === "alive" && n.isGuardian && n.status === "green"
    );

    guardians.forEach((guardian) => {
      // Guardian dispatch support – send remediation to closest reachable infected node
      if (
        now - guardian.guardianDispatchLastSent >=
        GUARDIAN_DISPATCH_INTERVAL
      ) {
        const infectedCandidates = nodes.filter(
          (n) =>
            n &&
            n !== guardian &&
            n.state === "alive" &&
            (n.status === "malware" ||
              n.status === "botnet" ||
              n.status === "commandControl") &&
            !n.isTargeted &&
            n.remediationState === "none"
        );

        let bestTarget = null;
        let bestDistanceSq = Infinity;
        let bestPath = null;

        infectedCandidates.forEach((candidate) => {
          const path = buildNodePath(guardian, candidate);
          if (!path || path.length < 2) return;

          const intermediateNodes = path.slice(1, -1);
          const pathClear = intermediateNodes.every(
            (node) =>
              node &&
              node.state === "alive" &&
              (node.status === "green" || node.status === "blue")
          );
          if (!pathClear) return;

          const dx = candidate.x - guardian.x;
          const dy = candidate.y - guardian.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestTarget = candidate;
            bestPath = path;
          }
        });

        if (bestTarget && bestPath) {
          const dispatch = new DispatchPacket(bestTarget, guardian);
          if (dispatch.state !== "finished") {
            dispatchPackets.push(dispatch);
            incrementStat("totalDispatchPackets");
            bestTarget.isTargeted = true;
            guardian.guardianDispatchLastSent = now;
            logEvent("custom", {
              alert: "🕶 Guardian dispatched remediation.",
              details: {
                guardian: getLogNodeRef(guardian),
                target: getLogNodeRef(bestTarget),
              },
            });
          }
        }
      }

      // Threat hunting: prioritize directly connected infected nodes
      const connectedInfected = nodes.filter((n) => {
        if (n.state !== "alive") return false;
        if (
          n.status !== "malware" &&
          n.status !== "botnet" &&
          n.status !== "commandControl"
        )
          return false;
        if (n.isTargeted) return false; // Skip if already being remediated

        // Check if directly connected to guardian
        const isDirectlyConnected = edges.some(
          (edge) =>
            (edge.from === guardian && edge.to === n) ||
            (edge.from === n && edge.to === guardian)
        );

        return isDirectlyConnected;
      });

      if (connectedInfected.length > 0) {
        // Target the first directly connected infected node
        const target = connectedInfected[0];

        // Build path to target for dispatch packet
        const path = buildNodePath(guardian, target);
        if (path && path.length >= 2) {
          // Visual scan pulse effect
          createPopParticles(guardian.x, guardian.y, {
            r: 96,
            g: 165,
            b: 250,
          });

          // Send dispatch packet for remediation
          const dispatch = new DispatchPacket(target, guardian);
          if (dispatch.state !== "finished") {
            dispatchPackets.push(dispatch);
            incrementStat("totalDispatchPackets");
            target.isTargeted = true;
            logEvent("custom", {
              alert: "🔍 Guardian hunting threat: dispatched remediation to connected node.",
              details: {
                guardian: getLogNodeRef(guardian),
                target: getLogNodeRef(target),
              },
            });
          }
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // MANAGE DISPATCH PACKETS
  // --------------------------------------------------------------------------

  function manageDispatchPackets() {
    const rootNode = nodes[0];
    // If the central node is compromised, it cannot send out remediation pulses.
    if (
      rootNode &&
      (rootNode.status === "malware" ||
        rootNode.status === "botnet" ||
        rootNode.status === "commandControl")
    ) {
      // Update and draw any pulses that were already in flight before the infection.
      dispatchPackets.forEach((dispatchPacket) => {
        dispatchPacket.update();
        const consumed = applySinkholeToPacket(dispatchPacket, "dispatch");
        if (!consumed) {
          dispatchPacket.draw();
        }
      });
      dispatchPackets = dispatchPackets.filter(
        (packet) => packet.state !== "finished"
      );
      return; // Stop here and don't create new pulses.
    }

    // Get all infected nodes that are eligible for dispatch
    const malwareNodes = nodes.filter(
      (n) =>
        (n.status === "malware" ||
          n.status === "botnet" ||
          n.status === "commandControl") &&
        n.infectedAt &&
        !n.isTargeted
    );

    // Prioritize directly connected infected nodes (children of central node)
    const directlyConnected = malwareNodes.filter(
      (n) => n.parent === rootNode
    );
    const indirectlyConnected = malwareNodes.filter(
      (n) => n.parent !== rootNode
    );

    // Process directly connected nodes first, then indirect ones
    const prioritizedNodes = [...directlyConnected, ...indirectlyConnected];

    for (const node of prioritizedNodes) {
      if (Date.now() > node.infectedAt + node.dispatchDelay) {
        // Build the path to the target node to check for obstructions
        const path = [];
        let currentNode = node;
        while (currentNode) {
          path.push(currentNode);
          currentNode = currentNode.parent;
        }
        path.reverse(); // Path is now [root, ..., target]

        // A path is clear if all intermediate nodes are green.
        // The root is blue, and the final node is malware, so we check the nodes in between.
        const isPathClear = path
          .slice(1, -1)
          .every((pathNode) => pathNode.status === "green");

        // Only send a pulse if the path is not blocked by a red/yellow node
        if (isPathClear) {
          // Check if central node has supercharged immunity packets (unless self-healing = unlimited)
          if (rootNode.isSelfHealing) {
            // During recovery, central node has unlimited supercharged packets
            dispatchPackets.push(new DispatchPacket(node));
            incrementStat("totalDispatchPackets");
            node.isTargeted = true;
          } else {
            // Check for available supercharged immunity packets
            const superchargedPackets =
              rootNode.attachedImmunityPackets.filter(
                (p) => p && p.isSupercharged
              );

            if (superchargedPackets.length > 0) {
              // Consume one supercharged immunity packet (1:1 ratio)
              const consumedPacket = superchargedPackets[0];
              consumedPacket.active = false;
              rootNode.attachedImmunityPackets =
                rootNode.attachedImmunityPackets.filter(
                  (p) => p !== consumedPacket
                );

              // Send dispatch packet
              dispatchPackets.push(new DispatchPacket(node));
              incrementStat("totalDispatchPackets");
              node.isTargeted = true;
            } else {
              // No supercharged packets available - cannot send dispatch
              // Stop processing to prevent checking more nodes when resources are depleted
              break;
            }
          }
        }
      }
    }

    dispatchPackets.forEach((dispatchPacket) => {
      dispatchPacket.update();
      const consumed = applySinkholeToPacket(dispatchPacket, "dispatch");
      if (!consumed) {
        dispatchPacket.draw();
      }
    });

    dispatchPackets = dispatchPackets.filter(
      (packet) => packet.state !== "finished"
    );
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  const DispatchPacketSystem = {
    /**
     * Connect app-owned state, draw context, and helper callbacks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    DispatchPacket,

    guardianThreatHunting() {
      refreshRuntimeState();
      guardianThreatHunting();
    },

    manageDispatchPackets() {
      refreshRuntimeState();
      manageDispatchPackets();
    },

    getDispatchPackets() {
      return dispatchPackets;
    },

    clearDispatchPackets() {
      dispatchPackets.length = 0;
    },
  };

  window.NodeNet.DispatchPacketSystem = DispatchPacketSystem;
})();
