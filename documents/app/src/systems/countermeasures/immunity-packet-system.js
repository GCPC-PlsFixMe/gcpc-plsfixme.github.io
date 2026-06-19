/**
 * @module ImmunityPacketSystem
 * @summary Immunity packets — spawning, movement, attachment to nodes, healing, and rendering.
 * @exports window.NodeNet.ImmunityPacketSystem
 * @tags immunity, healing, defense, packets, attachment, bot-defense, cure
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    config: window.NodeNetConfig || {},
    ctx: null,
    getNodes: () => [],
    getEdges: () => [],
    getEdgesSet: () => new Set(),
    getImmunityPackets: () => [],
    getPacketSpeedMultiplier: () => 1,
    getGlobalDeltaSeconds: () => 0.016,
    getImmunityOrbitAngle: () => 0,
    getCentralImpactShakeOffsetX: () => 0,
    getCentralImpactShakeOffsetY: () => 0,
    getColors: () => ({}),
    incrementStat: () => {},
    logEvent: () => {},
    getPointAndPerpOnEdge: () => null,
    isNodeInDDOSBranch: () => false,
    applySinkholeToPacket: () => false,
    getHealSpeedMultiplier: () => 1,
  };

  const CONFIG = new Proxy(
    {},
    {
      get(_target, property) {
        return (dependencies.config || window.NodeNetConfig || {})[property];
      },
    }
  );

  function getNodes() {
    return typeof dependencies.getNodes === "function"
      ? dependencies.getNodes()
      : [];
  }

  function getEdges() {
    return typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
  }

  function getEdgesSet() {
    return typeof dependencies.getEdgesSet === "function"
      ? dependencies.getEdgesSet()
      : new Set();
  }

  function getImmunityPackets() {
    return typeof dependencies.getImmunityPackets === "function"
      ? dependencies.getImmunityPackets()
      : [];
  }

  function getCtx() {
    return dependencies.ctx;
  }

  function getColors() {
    return typeof dependencies.getColors === "function"
      ? dependencies.getColors()
      : {};
  }

  function getColor(name, fallback = { r: 255, g: 255, b: 255 }) {
    const c = getColors()[name];
    return c || fallback;
  }

  function getPacketSpeedMultiplier() {
    return typeof dependencies.getPacketSpeedMultiplier === "function"
      ? dependencies.getPacketSpeedMultiplier()
      : 1;
  }

  function getGlobalDeltaSeconds() {
    return typeof dependencies.getGlobalDeltaSeconds === "function"
      ? dependencies.getGlobalDeltaSeconds()
      : 0.016;
  }

  function getImmunityOrbitAngle() {
    return typeof dependencies.getImmunityOrbitAngle === "function"
      ? dependencies.getImmunityOrbitAngle()
      : 0;
  }

  function getCentralImpactShakeOffsetX() {
    return typeof dependencies.getCentralImpactShakeOffsetX === "function"
      ? dependencies.getCentralImpactShakeOffsetX()
      : 0;
  }

  function getCentralImpactShakeOffsetY() {
    return typeof dependencies.getCentralImpactShakeOffsetY === "function"
      ? dependencies.getCentralImpactShakeOffsetY()
      : 0;
  }

  function getHealSpeedMultiplier() {
    return typeof dependencies.getHealSpeedMultiplier === "function"
      ? dependencies.getHealSpeedMultiplier()
      : 1;
  }

  function incrementStat(statName) {
    dependencies.incrementStat(statName);
  }

  function logEvent(key, context = {}) {
    dependencies.logEvent(key, context);
  }

  function getPointAndPerpOnEdge(edge, t) {
    return dependencies.getPointAndPerpOnEdge(edge, t);
  }

  function isNodeInDDOSBranch(node) {
    return dependencies.isNodeInDDOSBranch(node);
  }

  function applySinkholeToPacket(packet, packetType) {
    return dependencies.applySinkholeToPacket(packet, packetType);
  }

  class ImmunityPacket {
    constructor(edge, direction = 1) {
      this.edge = edge;
      this.direction = direction; // 1 = from->to, -1 = to->from
      this.progress = direction === 1 ? 0 : 1;
      this.x = 0;
      this.y = 0;
      this.active = true;
      this.color = { ...getColor("white") };
      this.radius = 1.5;
      this.baseSpeed = 0.003; // Standardized immunity packet speed
      this.speed = this.baseSpeed * getPacketSpeedMultiplier();
      this.opacity = 0.9;
      this.lateralOffset = direction === 1 ? 5 : -5;

      // Attachment state
      this.isAttached = false;
      this.attachedNode = null;
      this.attachmentAngle = 0; // Angle around the node
      this.attachmentDistance = 0; // Distance from node center

      // Smooth slot angle transition for fluid repositioning when packet count changes
      this.slotAngle = 0; // Fixed slot position around the circle (smoothly interpolates)
      this.targetSlotAngle = 0; // Target slot angle
      this.lastPacketIndex = -1; // Track index to detect position changes
      this.lastTotalPackets = 0; // Track total to detect count changes

      // Smooth attachment transition
      this.isAttaching = false; // Transitioning to attached state
      this.attachTransitionProgress = 0; // 0 to 1 during attachment
      this.attachStartX = 0; // Starting position for smooth transition
      this.attachStartY = 0;

      // Seeking behavior
      this.targetNode = null; // Infected node to seek
      this.isSeeking = false;

      // Supercharged property (for burst packets from central node)
      this.isSupercharged = false;
      this.pulsePhase = Math.random() * Math.PI * 2; // Random starting phase for pulse

      // Emergency lights effect (red/white alternating like fire truck/ambulance)
      this.flashPhase = Math.random() * Math.PI * 2; // Random starting phase for variety
    }

    update() {
      const globalDeltaSeconds = getGlobalDeltaSeconds();
      const immunityOrbitAngle = getImmunityOrbitAngle();
      const centralImpactShakeOffsetX = getCentralImpactShakeOffsetX();
      const centralImpactShakeOffsetY = getCentralImpactShakeOffsetY();
      const edgesSet = getEdgesSet();
      const nodes = getNodes();
      const edges = getEdges();

      // Handle fade-out animation (must be first to ensure fading packets fade regardless of state)
      if (this.isFading) {
        this.opacity = Math.max(0, this.opacity - 3.6 * globalDeltaSeconds);
        if (this.opacity <= 0) {
          this.active = false;
        }
        return; // Don't process other logic while fading
      }

      // Handle smooth attachment transition
      if (this.isAttaching && this.attachedNode) {
        const isCentralNode = this.attachedNode.parent === null;
        const isInfected =
          this.attachedNode.status === "malware" ||
          this.attachedNode.status === "botnet" ||
          this.attachedNode.status === "commandControl";

        // Check if node can still hold packets
        if (!isInfected && !isCentralNode) {
          this.active = false;
          return;
        }

        // Smoothly transition to attached position
        this.attachTransitionProgress += Math.min(1, globalDeltaSeconds * 4.8);

        if (this.attachTransitionProgress >= 1) {
          // Transition complete
          this.isAttaching = false;
          this.isAttached = true;
          this.attachTransitionProgress = 1;
        }

        // Calculate slot position based on current index
        const packetIndex =
          this.attachedNode.attachedImmunityPackets.indexOf(this);
        const totalPackets =
          this.attachedNode.attachedImmunityPackets.length;

        // Initialize slot on first frame of attachment
        if (packetIndex !== -1 && this.lastPacketIndex === -1) {
          this.slotAngle = (packetIndex / totalPackets) * Math.PI * 2;
          this.targetSlotAngle = this.slotAngle;
          this.lastPacketIndex = packetIndex;
          this.lastTotalPackets = totalPackets;
        }

        // Shared orbit phase preserves radial symmetry while staying FPS-independent.
        this.attachmentAngle = this.slotAngle + immunityOrbitAngle;

        const ringGap = isCentralNode
          ? Math.max(7, this.attachedNode.radius * 0.22)
          : 5;
        const distance = this.attachedNode.radius + ringGap;

        // Include shake offset for central node
        const shakeOffsetX = isCentralNode ? centralImpactShakeOffsetX : 0;
        const shakeOffsetY = isCentralNode ? centralImpactShakeOffsetY : 0;

        const targetX =
          this.attachedNode.x +
          shakeOffsetX +
          Math.cos(this.attachmentAngle) * distance;
        const targetY =
          this.attachedNode.y +
          shakeOffsetY +
          Math.sin(this.attachmentAngle) * distance;

        // Ease-out interpolation for smooth deceleration
        const easeProgress =
          1 - Math.pow(1 - this.attachTransitionProgress, 3);
        this.x =
          this.attachStartX + (targetX - this.attachStartX) * easeProgress;
        this.y =
          this.attachStartY + (targetY - this.attachStartY) * easeProgress;
        return;
      }

      // If attached to a node, cling to its perimeter
      if (this.isAttached && this.attachedNode) {
        const isCentralNode = this.attachedNode.parent === null;
        const isInfected =
          this.attachedNode.status === "malware" ||
          this.attachedNode.status === "botnet" ||
          this.attachedNode.status === "commandControl";

        // Check if node can still hold packets
        if (!isInfected && !isCentralNode) {
          // Node is healed (regular node) or no longer valid, packet should pop
          this.active = false;
          return;
        }

        // Calculate current slot position based on index in array
        const packetIndex =
          this.attachedNode.attachedImmunityPackets.indexOf(this);
        const totalPackets =
          this.attachedNode.attachedImmunityPackets.length;

        // Update target slot angle when position or total changes
        if (packetIndex !== -1) {
          const newTargetSlot = (packetIndex / totalPackets) * Math.PI * 2;

          // Check if index or total changed
          if (
            packetIndex !== this.lastPacketIndex ||
            totalPackets !== this.lastTotalPackets
          ) {
            this.targetSlotAngle = newTargetSlot;
            this.lastPacketIndex = packetIndex;
            this.lastTotalPackets = totalPackets;
          }
        }

        // Smoothly interpolate slot angle toward target (fluid repositioning)
        const slotDiff = this.targetSlotAngle - this.slotAngle;
        // Handle angle wrap-around for shortest path
        let adjustedSlotDiff = slotDiff;
        if (slotDiff > Math.PI) adjustedSlotDiff = slotDiff - Math.PI * 2;
        if (slotDiff < -Math.PI) adjustedSlotDiff = slotDiff + Math.PI * 2;
        // Frame-rate-independent lerp: converges in ~0.67s at any fps
        this.slotAngle += adjustedSlotDiff * Math.min(1, globalDeltaSeconds * 6);

        // Final angle = slot position + shared orbit phase (mod 2PI).
        this.attachmentAngle = this.slotAngle + immunityOrbitAngle;

        // Cling to the node perimeter, with extra spacing for a larger central node.
        const ringGap = isCentralNode
          ? Math.max(7, this.attachedNode.radius * 0.22)
          : 5;
        const distance = this.attachedNode.radius + ringGap;

        // Include shake offset for central node so packets shake with the node
        const shakeOffsetX = isCentralNode ? centralImpactShakeOffsetX : 0;
        const shakeOffsetY = isCentralNode ? centralImpactShakeOffsetY : 0;

        this.x =
          this.attachedNode.x +
          shakeOffsetX +
          Math.cos(this.attachmentAngle) * distance;
        this.y =
          this.attachedNode.y +
          shakeOffsetY +
          Math.sin(this.attachmentAngle) * distance;
        return;
      }

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

      if (!edgeExists || !fromNodeValid || !toNodeValid) {
        // Visual feedback for dropped immunity packet
        if (!this.isFading) {
          this.isFading = true;
        }

        if (this.isFading) {
          this.opacity = Math.max(
            0,
            this.opacity - 3.6 * globalDeltaSeconds
          );
          if (this.opacity <= 0) {
            this.active = false;
          }
        }
        return;
      }

      // Check for nearby infected nodes to attach to
      const fromNode = this.edge.from;
      const toNode = this.edge.to;

      // Calculate current position first
      // Skip if fading - stay in current position
      if (!this.isFading) {
        const sample = getPointAndPerpOnEdge(this.edge, this.progress);
        if (sample) {
          const offset = this.isSupercharged ? 0 : this.lateralOffset;
          this.x = sample.x + sample.perpX * offset;
          this.y = sample.y + sample.perpY * offset;
        }
      }

      // Check if we're near a node that can collect immunity packets
      const checkNode = (node) => {
        if (node.isGuardian) {
          return false; // Guardians let immunity packets pass through
        }
        const isCentralNode = node.parent === null;
        const isInfected =
          node.status === "malware" ||
          node.status === "botnet" ||
          node.status === "commandControl";

        // If seeking a specific target, only attach to that target
        if (this.isSeeking && this.targetNode) {
          if (node !== this.targetNode) {
            // Supercharged packets no longer roam - they must hit their target
            // If they encounter a firewall node, it absorbs them
            if (
              this.isSupercharged &&
              node.hasFirewall &&
              node.status === "green" &&
              node.state === "alive"
            ) {
              // Firewall absorbs the missed supercharged packet
              return true; // Attach to firewall and stop
            }
            return false; // Not our target, skip
          } else {
            // Target must be infected to attach
            if (!isInfected || node.state !== "alive") {
              // Target is no longer valid
              // Supercharged packets are absorbed by first firewall they encounter
              if (this.isSupercharged) {
                // Find first firewall node to absorb
                const firewallNode = nodes.find(
                  (n) =>
                    n.hasFirewall &&
                    n.status === "green" &&
                    n.state === "alive" &&
                    Math.sqrt((this.x - n.x) ** 2 + (this.y - n.y) ** 2) <
                      200
                );
                if (firewallNode) {
                  this.targetNode = firewallNode;
                  return false; // Continue seeking firewall
                }
              }
              this.isSeeking = false;
              this.targetNode = null;
              return false;
            }
          }
        } else {
          // Normal collection logic
          // Central node can collect when healthy (blue) or infected
          // Regular nodes can only collect when infected
          const canCollect =
            node.state === "alive" &&
            ((isCentralNode && (node.status === "blue" || isInfected)) ||
              (!isCentralNode && isInfected));

          if (!canCollect) {
            return false;
          }
        }

        // Check if node already has maximum packets (20 for central node, 20 for infected nodes, 10 for healthy nodes)
        const maxPackets = isCentralNode || isInfected ? 20 : 10;
        if (node.attachedImmunityPackets.length >= maxPackets) {
          return false; // Node is full, can't attach
        }

        const distToNode = Math.sqrt(
          (this.x - node.x) ** 2 + (this.y - node.y) ** 2
        );
        if (distToNode < node.radius + 15) {
          // Start smooth attachment transition
          this.isAttaching = true;
          this.isAttached = false; // Will become true after transition
          this.attachedNode = node;
          this.isSeeking = false; // Clear seeking state
          this.targetNode = null;
          this.attachTransitionProgress = 0;
          this.attachStartX = this.x;
          this.attachStartY = this.y;

          // Add to node's attached packets
          if (!node.attachedImmunityPackets.includes(this)) {
            node.attachedImmunityPackets.push(this);

            // Calculate initial slot angle based on position in array
            const packetIndex = node.attachedImmunityPackets.length - 1;
            const totalPackets = node.attachedImmunityPackets.length;
            const initialSlotAngle =
              (packetIndex / totalPackets) * Math.PI * 2;

            // Initialize both slot angle and attachment angle
            this.slotAngle = initialSlotAngle;
            this.targetSlotAngle = initialSlotAngle;
            this.lastPacketIndex = packetIndex;
            this.lastTotalPackets = totalPackets;

            if (isCentralNode) {
              this.isSupercharged = true;
              this.radius = Math.max(this.radius, 2);
            }

            // Compounding logic for infected nodes (not central node)
            if (!isCentralNode && isInfected) {
              const currentCount = node.attachedImmunityPackets.length;

              // Once we have more than 10 packets, convert a regular packet to supercharged
              if (currentCount > 10 && currentCount <= 20) {
                // Find the first regular (non-supercharged) packet to upgrade
                const regularPacket = node.attachedImmunityPackets.find(
                  (p) => !p.isSupercharged
                );
                if (regularPacket) {
                  regularPacket.isSupercharged = true;
                  regularPacket.radius = Math.max(regularPacket.radius, 2);
                  logEvent("immunityPacketUpgraded", {
                    node,
                    totalPackets: currentCount,
                    superchargedCount: node.attachedImmunityPackets.filter(
                      (p) => p.isSupercharged
                    ).length,
                  });
                }
              }
            }

            // Start healing if infected and not already healing
            if (isInfected && !node.isImmunityHealing) {
              node.isImmunityHealing = true;
              node.immunityHealingStartTime = Date.now();
              logEvent("immunityHealingStarted", {
                node,
                packetCount: node.attachedImmunityPackets.length,
              });
            }
          }
          return true;
        }
        return false;
      };

      // If seeking, check target node first
      if (this.isSeeking && this.targetNode && checkNode(this.targetNode)) {
        return;
      }

      // Otherwise check nearby nodes
      if (checkNode(fromNode) || checkNode(toNode)) {
        return;
      }

      // Apply DDOS slowdown to immunity packets in affected branches
      const currentFromNode = this.edge.from;
      const currentToNode = this.edge.to;
      let effectiveSpeed = this.speed;
      if (
        isNodeInDDOSBranch(currentToNode) ||
        isNodeInDDOSBranch(currentFromNode)
      ) {
        effectiveSpeed *= 0.15; // Severely slowed during DDOS
      }

      // Normal movement along edge
      // Only update progress if not fading
      if (!this.isFading) {
        if (this.direction === 1) {
          this.progress += effectiveSpeed;
          if (this.progress >= 1) {
            const endNode = this.edge.to;

            // Check if node is dead/invalid
            if (!endNode || endNode.state !== "alive") {
              this.isFading = true;
              return;
            }

            // All packets try to continue forward on random routes
            // Central node consumes all packets (don't bounce back)
            if (endNode.parent === null) {
              // Packet reached central node, fade out gracefully
              // It will be collected via the checkNode logic above
              this.isFading = true;
            } else {
              // Try to find available edges to continue (children or siblings)
              const availableEdges = edges.filter(
                (edge) =>
                  edge.from === endNode &&
                  edge.to.state === "alive" &&
                  edge.to !== this.edge.from // Don't go back immediately
              );

              if (availableEdges.length > 0) {
                // Pick a random edge and continue
                const randomEdge =
                  availableEdges[
                    Math.floor(Math.random() * availableEdges.length)
                  ];
                this.edge = randomEdge;
                this.progress = 0;
                this.direction = 1;
                // Keep same lateral offset direction
              } else {
                // No available paths forward, drop the packet
                this.isFading = true;
              }
            }
          }
        } else {
          this.progress -= effectiveSpeed;
          if (this.progress <= 0) {
            const startNode = this.edge.from;

            // Check if node is dead/invalid
            if (!startNode || startNode.state !== "alive") {
              this.isFading = true;
              return;
            }

            // At central node, consume the packet (don't bounce back)
            if (startNode.parent === null) {
              // Packet reached central node, fade out gracefully
              this.isFading = true;
            } else {
              // Try to find available edges (parent or siblings)
              const availableEdges = edges.filter(
                (edge) =>
                  edge.from === startNode &&
                  edge.to.state === "alive" &&
                  edge.to !== this.edge.to // Don't go back immediately
              );

              if (availableEdges.length > 0) {
                // Pick a random edge and continue
                const randomEdge =
                  availableEdges[
                    Math.floor(Math.random() * availableEdges.length)
                  ];
                this.edge = randomEdge;
                this.progress = 0;
                this.direction = 1;
              } else {
                // No available paths, drop the packet
                this.isFading = true;
              }
            }
          }
        }
      }
    }

    draw() {
      if (!this.active) return;

      // Hide packet during early attachment transition to prevent flash at center
      if (this.isAttaching && this.attachTransitionProgress < 0.2) {
        return; // Don't draw until 20% through transition
      }

      const ctx = getCtx();
      if (!ctx) return;

      ctx.save();

      // Calculate fade-in opacity during attachment transition
      let fadeMultiplier = 1.0;
      if (this.isAttaching && this.attachTransitionProgress < 0.5) {
        // Fade in from 20% to 50% of transition
        fadeMultiplier = (this.attachTransitionProgress - 0.2) / 0.3;
        fadeMultiplier = Math.max(0, Math.min(1, fadeMultiplier));
      }

      // Check if attached to central node
      const isAttachedToCentral =
        (this.isAttached || this.isAttaching) &&
        this.attachedNode &&
        this.attachedNode.parent === null;

      // Supercharged packets OR packets attached to central node pulse with neon yellow
      if (this.isSupercharged || isAttachedToCentral) {
        // Always update pulse phase for smooth animation
        if (!this.pulsePhase) this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulsePhase += 0.15; // Faster pulsing
        const pulseFactor = 0.5 + Math.sin(this.pulsePhase) * 0.5; // Oscillates 0-1

        // Pulsing bright neon yellow for high visibility
        const brightYellow = { r: 255, g: 255, b: 0 }; // Pure bright yellow
        const neonYellow = { r: 255, g: 255, b: 100 }; // Slightly greenish yellow for variety
        const r =
          brightYellow.r + (neonYellow.r - brightYellow.r) * pulseFactor;
        const g =
          brightYellow.g + (neonYellow.g - brightYellow.g) * pulseFactor;
        const b =
          brightYellow.b + (neonYellow.b - brightYellow.b) * pulseFactor;

        // Draw with pulsing neon yellow (with fade-in)
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${
          this.opacity * fadeMultiplier
        })`;
        ctx.fill();
      } else {
        // Emergency lights effect - alternate between bright red and white smoothly
        this.flashPhase += 0.15; // Fast flashing speed

        // Use sine wave to create smooth red-white-red transitions
        // Sine oscillates between -1 and 1, we map to 0-1
        const flashValue = (Math.sin(this.flashPhase) + 1) / 2; // 0 = red, 1 = white

        // Interpolate between bright pure red and white for high visibility
        const brightRed = { r: 255, g: 0, b: 0 }; // Pure bright red
        const brightWhite = { r: 255, g: 255, b: 255 }; // Pure white
        const r = brightRed.r + (brightWhite.r - brightRed.r) * flashValue;
        const g = brightRed.g + (brightWhite.g - brightRed.g) * flashValue;
        const b = brightRed.b + (brightWhite.b - brightRed.b) * flashValue;

        // Draw emergency light packet (with fade-in)
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${
          this.opacity * fadeMultiplier
        })`;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function isValidImmunitySource(node) {
    if (!node || node.state !== "alive" || node.status !== "green") return false;
    if (node.isGuardian) return true;
    if (!node.hasFirewall) return false;
    // Exclude special node types that carry firewall for shield rendering only
    return (
      !node.isGroundStation &&
      !node.isDatacenter &&
      !node.isSatellite &&
      !node.isHoneypot
    );
  }

  function spawnImmunityPackets() {
    const edges = getEdges();
    const immunityPackets = getImmunityPackets();
    const SPAWN_CHANCE = 0.001; // Very rare spawn rate (reduced by half)

    edges.forEach((edge) => {
      if (
        !edge.from ||
        !edge.to ||
        edge.from.state !== "alive" ||
        edge.to.state !== "alive"
      ) {
        return;
      }

      // Do not spawn immunity packets on edges connected to down (red) nodes
      if (edge.from.status === "red" || edge.to.status === "red") {
        return;
      }

      // Only spawn from edges where at least one node is a valid immunity source.
      // Packets always travel outbound from the firewalled/guardian node.
      const fromIsHealthyFirewalled = isValidImmunitySource(edge.from);
      const toIsHealthyFirewalled = isValidImmunitySource(edge.to);

      if (fromIsHealthyFirewalled && Math.random() < SPAWN_CHANCE) {
        immunityPackets.push(new ImmunityPacket(edge, 1)); // outbound from edge.from
        incrementStat("totalImmunityPackets");
      }

      if (toIsHealthyFirewalled && Math.random() < SPAWN_CHANCE) {
        immunityPackets.push(new ImmunityPacket(edge, -1)); // outbound from edge.to
        incrementStat("totalImmunityPackets");
      }
    });
  }

  function spawnCentralImmunityPackets(centralNode) {
    const edges = getEdges();
    const immunityPackets = getImmunityPackets();

    // Bot Defense Mode spawns SUPERCHARGED immunity packets (infinite during mode)
    // These packets will return to central node and become part of defense buffer
    if (!centralNode || centralNode.parent !== null) return;

    edges.forEach((edge) => {
      // Check if this edge is connected to the central node
      const connectedToCentral =
        edge.from === centralNode || edge.to === centralNode;
      if (!connectedToCentral) return;

      // Make sure the other node is alive and not down
      const otherNode = edge.from === centralNode ? edge.to : edge.from;
      if (!otherNode || otherNode.state !== "alive" || otherNode.status === "red") return;

      // Spawn SUPERCHARGED immunity packets during Bot Defense Mode
      // Spawn 2-3 packets per edge for a noticeable response
      const packetCount = 2 + Math.floor(Math.random() * 2); // 2-3 packets

      for (let i = 0; i < packetCount; i++) {
        // Spawn going away from central (direction based on edge orientation)
        const direction = edge.from === centralNode ? 1 : -1;
        const packet = new ImmunityPacket(edge, direction);
        packet.isSupercharged = true; // Bot Defense Mode creates supercharged packets
        packet.radius = Math.max(packet.radius, 3); // Larger radius for supercharged
        packet.progress = 0.05 + i * 0.1; // Stagger slightly
        immunityPackets.push(packet);
        incrementStat("totalImmunityPackets");
      }
    });
  }

  function redistributeImmunityPackets(centralNode) {
    const edges = getEdges();

    // Get all attached immunity packets from central node
    const packetsToRedistribute = [...centralNode.attachedImmunityPackets];

    if (packetsToRedistribute.length > 0) {
      logEvent("immunitySupercharged", {
        packetCount: packetsToRedistribute.length,
      });
    }

    // Clear the central node's attached packets
    centralNode.attachedImmunityPackets = [];
    centralNode.isImmunityHealing = false;
    centralNode.immunityHealingStartTime = 0;

    // Find all healthy edges to redistribute packets to
    const healthyEdges = edges.filter(
      (edge) =>
        edge.from &&
        edge.to &&
        edge.from.state === "alive" &&
        edge.to.state === "alive" &&
        (edge.from.status === "green" || edge.to.status === "green")
    );

    if (healthyEdges.length === 0) {
      // No healthy edges, deactivate all packets
      packetsToRedistribute.forEach((packet) => {
        packet.active = false;
        packet.isAttached = false;
        packet.attachedNode = null;
      });
      return;
    }

    // Redistribute each packet to a random healthy edge
    packetsToRedistribute.forEach((packet) => {
      const randomEdge =
        healthyEdges[Math.floor(Math.random() * healthyEdges.length)];

      // Detach from central node
      packet.isAttached = false;
      packet.attachedNode = null;

      // Assign to new edge with random direction and progress
      packet.edge = randomEdge;
      packet.direction = Math.random() < 0.5 ? 1 : -1;
      packet.progress = Math.random(); // Random position along edge
      packet.lateralOffset = packet.direction === 1 ? 5 : -5;
    });
  }

  function spawnGuardianImmunityStreams() {
    const now = Date.now();
    const healSpeedMultiplier = getHealSpeedMultiplier();
    const GUARDIAN_STREAM_INTERVAL = 2500 / healSpeedMultiplier; // Reduced spawn rate (was 1200)
    const IMMUNITY_STREAM_SPEED = 0.006;
    const nodes = getNodes();
    const edges = getEdges();
    const immunityPackets = getImmunityPackets();

    nodes.forEach((node) => {
      if (!node.isGuardian || node.state !== "alive") return;

      if (now - node.guardianImmunityLastSpawn < GUARDIAN_STREAM_INTERVAL) {
        return;
      }

      node.guardianImmunityLastSpawn = now;

      const connectedEdges = edges.filter(
        (edge) => edge.from === node || edge.to === node
      );
      const outwardDirections =
        connectedEdges.length > 0
          ? connectedEdges
          : [{ from: node, to: node.parent }];

      outwardDirections.forEach((connection) => {
        if (!connection || (!connection.from && !connection.to)) return;

        let edge = connection;
        if (!edge.from || !edge.to) {
          const sibling = node.parent;
          if (!sibling) return;
          edge = { from: node, to: sibling };
        }

        if (
          !edge.from ||
          !edge.to ||
          edge.from.state !== "alive" ||
          edge.to.state !== "alive" ||
          edge.from.status === "red" ||
          edge.to.status === "red"
        )
          return;

        const direction = edge.from === node ? 1 : -1;
        const packet = new ImmunityPacket(edge, direction);
        node.guardianStreamCount = (node.guardianStreamCount + 1) % 10;

        if (node.guardianStreamCount === 0) {
          packet.isSupercharged = true;
          packet.radius = 3;
        }

        packet.baseSpeed = IMMUNITY_STREAM_SPEED;
        packet.speed = IMMUNITY_STREAM_SPEED * getPacketSpeedMultiplier();
        packet.opacity = 1;
        packet.lateralOffset = direction === 1 ? 6 : -6;
        immunityPackets.push(packet);
        incrementStat("totalImmunityPackets");
      });
    });
  }

  function evaluateBotDefenseMode() {
    const nodes = getNodes();
    const central = nodes[0];
    if (!central || central.parent !== null) return;
    const now = Date.now();
    const botDefense = CONFIG.botDefense || {};
    const BOT_DEFENSE_DURATION = botDefense.duration || 10000;
    const BOT_DEFENSE_COOLDOWN = botDefense.cooldown || 20000;

    // If central is compromised, disable mode and clear
    if (
      central.status === "malware" ||
      central.status === "botnet" ||
      central.status === "commandControl" ||
      central.state !== "alive"
    ) {
      central.botDefenseModeActive = false;
      central.botDefenseTargets = [];
      central.botDefenseLastBurst = 0;
      return;
    }

    // Count infected direct children (branches)
    const infectedBranches = (central.children || []).filter(
      (ch) =>
        ch &&
        ch.state === "alive" &&
        (ch.status === "malware" ||
          ch.status === "botnet" ||
          ch.status === "commandControl")
    );
    if (central.botDefenseModeActive) {
      // End if duration elapsed or not enough infected branches
      if (
        now - central.botDefenseModeStart >= BOT_DEFENSE_DURATION ||
        infectedBranches.length < 3
      ) {
        central.botDefenseModeActive = false;
        central.botDefenseTargets = [];
        central.botDefenseLastBurst = 0;
        central.botDefenseCooldownUntil = now + BOT_DEFENSE_COOLDOWN;
      } else {
        central.botDefenseTargets = infectedBranches;
      }
      return;
    }
    // Not active: can we start?
    if (
      infectedBranches.length >= 3 &&
      now >= (central.botDefenseCooldownUntil || 0) &&
      Math.random() < 0.5
    ) {
      central.botDefenseModeActive = true;
      central.botDefenseModeStart = now;
      central.botDefenseTargets = infectedBranches;
      central.botDefenseLastBurst = 0;
      // aura will render in draw()
    }
  }

  function getInfectedNodesUnder(branch) {
    const result = [];
    const stack = [branch];
    while (stack.length) {
      const n = stack.pop();
      if (!n || n.state !== "alive") continue;
      if (
        n !== branch &&
        (n.status === "malware" ||
          n.status === "botnet" ||
          n.status === "commandControl")
      ) {
        result.push(n);
      }
      if (n.children && n.children.length) {
        for (const c of n.children) stack.push(c);
      }
    }
    // If none deeper, allow branch itself if infected
    if (
      result.length === 0 &&
      (branch.status === "malware" ||
        branch.status === "botnet" ||
        branch.status === "commandControl")
    ) {
      result.push(branch);
    }
    return result;
  }

  function createBotDefensePacket(centralNode, branchNode, targetNode) {
    const edges = getEdges();
    const immunityPackets = getImmunityPackets();

    // Find direct edge between central and branch
    const connection = edges.find(
      (e) =>
        (e.from === centralNode && e.to === branchNode) ||
        (e.to === centralNode && e.from === branchNode)
    );
    if (!connection) return;
    const direction = connection.from === centralNode ? 1 : -1;
    const packet = new ImmunityPacket(connection, direction);
    packet.progress =
      direction === 1 ? Math.random() * 0.2 : 1 - Math.random() * 0.2;
    packet.lateralOffset = direction === 1 ? 6 : -6;
    packet.isSupercharged = true;
    packet.isSeeking = true;
    packet.targetNode = targetNode;
    packet.speed = packet.baseSpeed * 2.5 * getPacketSpeedMultiplier();
    packet.opacity = 1;
    packet.radius = 3;
    immunityPackets.push(packet);
    incrementStat("totalImmunityPackets");
  }

  function handleBotDefenseBursts() {
    // REMOVED: Supercharged immunity packet bursts from central node's Bot Defense Mode
    // Central node now only sends supercharged packets to first infected parent nodes in each branch
    // during recovery (unlimited) or via consumed packets for dispatch
    return;
  }

  function manageImmunityPackets() {
    handleBotDefenseBursts();
    // Spawn new immunity packets
    spawnImmunityPackets();
    spawnGuardianImmunityStreams();

    const immunityPackets = getImmunityPackets();

    // Update and draw existing packets (except those attached to central node)
    for (let i = immunityPackets.length - 1; i >= 0; i--) {
      const packet = immunityPackets[i];
      packet.update();
      const consumed = applySinkholeToPacket(packet, "immunity");

      // Only draw if NOT attached to central node (will draw those later on top)
      const isAttachedToCentral =
        packet.isAttached &&
        packet.attachedNode &&
        packet.attachedNode.parent === null;
      if (!consumed && !isAttachedToCentral) {
        packet.draw();
      }

      // Remove inactive packets
      if (!packet.active) {
        // Remove from attached node's list if it was attached
        if (packet.attachedNode) {
          const idx =
            packet.attachedNode.attachedImmunityPackets.indexOf(packet);
          if (idx !== -1) {
            packet.attachedNode.attachedImmunityPackets.splice(idx, 1);
          }
        }
        immunityPackets.splice(i, 1);
      }
    }
  }

  const ImmunityPacketSystem = {
    /**
     * Connect app-owned state, draw context, and helper callbacks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    ImmunityPacket,

    spawnImmunityPackets,
    spawnCentralImmunityPackets,
    redistributeImmunityPackets,
    spawnGuardianImmunityStreams,
    evaluateBotDefenseMode,
    getInfectedNodesUnder,
    createBotDefensePacket,
    handleBotDefenseBursts,
    manageImmunityPackets,
  };

  window.NodeNet.ImmunityPacketSystem = ImmunityPacketSystem;
})();
