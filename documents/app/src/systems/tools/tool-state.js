/**
 * @module ToolState
 * @summary Interactive tools — active tool selection, node-type dropdown, button wiring, and applying tools to clicked nodes.
 * @description Covers sprout, prune, infect, cure, harden, link, and drag; delegates
 *   visual/heal/promote effects to the systems injected via `configure(deps)`.
 * @exports window.NodeNet.ToolState
 * @tags tools, sprout, prune, infect, cure, harden, link, drag, interaction, node-picking, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getCanvas: () => ({ style: {} }),
    getViewState: () => ({ isSidePanelOpen: false, sidePanelWidth: 300, scale: 1, offsetX: 0, offsetY: 0 }),
    getNodes: () => [],
  };

  // Tool state (was global in nodenet-app.js)
  let activeTool = null;
  let linkSourceNode = null; // For linking tool
  let selectedNodeType = "normal"; // For sprout tool

  const ToolState = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    /** Get the currently selected tool name or null. */
    getActiveTool() {
      return activeTool;
    },

    /** Set the active tool (or null to deactivate). */
    setActiveTool(tool) {
      activeTool = tool;
      return this;
    },

    /** Get the node type selected in the sprout dropdown. */
    getSelectedNodeType() {
      return selectedNodeType;
    },

    /** Get the source node for the link tool, or null. */
    getLinkSourceNode() {
      return linkSourceNode;
    },

    /** Set the link source node. */
    setLinkSourceNode(node) {
      linkSourceNode = node;
      return this;
    },

    /** Clear active tool and link source. */
    clear() {
      activeTool = null;
      linkSourceNode = null;
      return this;
    },

    /**
     * Get node at mouse position (mapped from screen to world coordinates).
     * @param {number} screenX - Mouse X relative to canvas
     * @param {number} screenY - Mouse Y relative to canvas
     * @returns {Object|null} The node under the cursor, or null
     */
    getNodeAtPosition(screenX, screenY) {
      const viewState = dependencies.getViewState();
      const canvas = dependencies.getCanvas();
      const nodes = dependencies.getNodes();
      const panelOffset = viewState.isSidePanelOpen
        ? viewState.sidePanelWidth
        : 0;
      const visualCx = (canvas.width - panelOffset) / 2;
      const visualCy = canvas.height / 2;
      const worldCx = canvas.width / 2;
      const worldCy = canvas.height / 2;

      const worldX = (screenX - visualCx) / viewState.scale + worldCx - viewState.offsetX;
      const worldY = (screenY - visualCy) / viewState.scale + worldCy - viewState.offsetY;

      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.state !== "alive") continue;

        const dx = worldX - node.x;
        const dy = worldY - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const hitMargin = 5 / Math.min(1, viewState.scale);
        if (distance < node.radius + hitMargin) {
          return node;
        }
      }
      return null;
    },

    /**
     * Initialize tool button handlers.
     * Binds click events on .tool-btn elements and the sprout node type dropdown.
     */
    initializeToolButtons() {
      const toolButtons = document.querySelectorAll(".tool-btn");
      const sproutSelector = document.getElementById("sprout-type-selector");
      const nodeTypeDropdown = document.getElementById("sprout-node-type");

      // Node type dropdown change handler
      if (nodeTypeDropdown) {
        nodeTypeDropdown.addEventListener("change", (e) => {
          selectedNodeType = e.target.value;
          console.log("Node type changed to:", selectedNodeType);
        });
      }

      toolButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const tool = btn.dataset.tool;

          // Toggle tool selection
          if (activeTool === tool) {
            activeTool = null;
            linkSourceNode = null;
            btn.classList.remove("active");
            // Hide sprout selector
            if (sproutSelector) sproutSelector.style.display = "none";
          } else {
            // Deactivate all other tools
            toolButtons.forEach((b) => b.classList.remove("active"));
            activeTool = tool;
            linkSourceNode = null;
            btn.classList.add("active");

            // Show/hide sprout selector based on tool
            if (sproutSelector) {
              sproutSelector.style.display = tool === "sprout" ? "block" : "none";
            }
          }

          // Update cursor style
          const canvas = dependencies.getCanvas();
          if (canvas && canvas.style) {
            canvas.style.cursor = activeTool ? "crosshair" : "default";
          }
        });
      });
    },
  

    applyTool(node) {
      if (!this.getActiveTool() || !node) return;

      switch (this.getActiveTool()) {
        case "sprout":
          this.sproutNode(node);
          break;
        case "infect":
          this.infectNode(node);
          break;
        case "cure":
          this.cureNode(node);
          break;
        case "harden":
          this.hardenNode(node);
          break;
        case "link":
          this.linkNodes(node);
          break;
        case "prune":
          this.pruneNode(node);
          break;
        case "drag":
          // Drag is handled by mousedown/mousemove/mouseup listeners
          break;
        default:
          console.warn(`Unknown tool: ${this.getActiveTool()}`);
      }
    },

    pruneBranch(node) {
      // Collect all descendants
      const toRemove = [];
      const stack = [node];

      while (stack.length > 0) {
        const curr = stack.pop();
        toRemove.push(curr);
        if (curr.children) {
          for (const child of curr.children) {
            stack.push(child);
          }
        }
        // Also include satellites if this is a ground station
        if (curr.isGroundStation && curr.satelliteChain) {
          for (const sat of curr.satelliteChain) {
            stack.push(sat);
          }
        }
      }

      // Remove from parent's children list
      if (node.parent) {
        const idx = node.parent.children.indexOf(node);
        if (idx !== -1) {
          node.parent.children.splice(idx, 1);
        }
      }

      // Remove from global nodes and edges
      // Using a Set for faster lookup
      const toRemoveSet = new Set(toRemove);

      // Filter nodes in place (iterate backwards)
      let removedCount = 0;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (toRemoveSet.has(n)) {
          // Add visual effect before removing
          dependencies.createPopParticles(n.x, n.y, dependencies.getColors().line);

          // --- Robust Cleanup ---
          // Clear attached immunity packets
          if (
            n.attachedImmunityPackets &&
            n.attachedImmunityPackets.length > 0
          ) {
            n.attachedImmunityPackets.forEach((packet) => {
              packet.active = false;
              packet.isAttached = false;
              packet.attachedNode = null;
            });
            n.attachedImmunityPackets = [];
            n.isImmunityHealing = false;
          }

          // Clear targeting flags
          n.isTargeted = false;

          // Mark as dead so other systems (packets) know to stop tracking/targeting it
          n.state = "dead";

          nodes.splice(i, 1);
          removedCount++;
        }
      }

      // Filter edges
      for (let i = edges.length - 1; i >= 0; i--) {
        const edge = edges[i];
        if (toRemoveSet.has(edge.from) || toRemoveSet.has(edge.to)) {
          edges.splice(i, 1);
        }
      }

      // Filter pulses (DispatchPackets) that target removed nodes
      if (typeof pulses !== "undefined") {
        pulses = pulses.filter((p) => !toRemoveSet.has(p.target));
      }

      return removedCount;
    },

    pruneNode(node) {
      if (!node) return;

      // If central node, prune all branches (keep central node)
      if (node.parent === null) {
        // Identify all direct children
        const children = node.children ? [...node.children] : [];
        let count = 0;
        children.forEach((child) => {
          count += this.pruneBranch(child);
        });

        node.children = []; // Clear children of central node

        dependencies.logEvent("custom", {
          message: `✂️ Pruned all ${count} nodes from the central node!`,
        });
        dependencies.createPopParticles(node.x, node.y, dependencies.getColors().red);
        return;
      }

      // If branch node, prune it and its subtree
      const count = this.pruneBranch(node);
      dependencies.logEvent("custom", {
        alert: `✂️ Branch pruned.`,
        details: { branch: dependencies.getLogNodeRef(node), removed: count },
      });
    },

    linkNodes(node) {
      if (node.state !== "alive") return;

      if (!this.getLinkSourceNode()) {
        // First node selected
        ToolState.setLinkSourceNode(node);
        dependencies.logEvent("custom", {
          alert: `🔗 Link source selected. Click another node to complete the link.`,
          details: { source: dependencies.getLogNodeRef(node) },
        });

        // Visual feedback
        dependencies.createPopParticles(node.x, node.y, dependencies.getColors().blue);
      } else {
        // Second node selected - create link
        if (this.getLinkSourceNode() === node) {
          dependencies.logEvent("custom", { message: `⚠️ Cannot link a node to itself!` });
          ToolState.setLinkSourceNode(null);
          return;
        }

        // Check if edge already exists
        const edgeExists = edges.some(
          (e) =>
            (e.from === this.getLinkSourceNode() && e.to === node) ||
            (e.from === node && e.to === this.getLinkSourceNode())
        );

        if (edgeExists) {
          dependencies.logEvent("custom", {
            alert: `⚠️ Nodes are already connected.`,
            details: {
              from: dependencies.getLogNodeRef(this.getLinkSourceNode()),
              to: dependencies.getLogNodeRef(node),
            },
          });
        } else {
          edges.push({
            from: linkSourceNode,
            to: node,
            natural: false,
            userCreated: true,
          });
          dependencies.logEvent("custom", {
            alert: `🔗 Link created.`,
            details: {
              from: dependencies.getLogNodeRef(this.getLinkSourceNode()),
              to: dependencies.getLogNodeRef(node),
            },
          });

          // Visual feedback
          dependencies.createPopParticles(this.getLinkSourceNode().x, this.getLinkSourceNode().y, dependencies.getColors().blue);
          dependencies.createPopParticles(node.x, node.y, dependencies.getColors().blue);
        }

        linkSourceNode = null;
      }
    },

    hardenNode(node) {
      if (node.state !== "alive") return;

      // Special handling for central node - activate all defense modes
      if (node.parent === null) {
        const now = Date.now();
        let modesActivated = [];

        // 1. Activate Recovery Shield (15 seconds, 99% resistance)
        if (!node.hasRecoveryShield) {
          node.hasRecoveryShield = true;
          node.recoveryShieldStartTime = now;
          node.shieldActive = true;
          node.shieldOpacity = 0; // Will fade in
          modesActivated.push("🛡️ Recovery Shield (15s, 99% resistance)");
          dependencies.logEvent("recoveryShieldActivated", { node });
        }

        // 2. Activate Bot Defense Mode (10 seconds, spawns immunity packets)
        if (
          !node.botDefenseModeActive &&
          now >= (node.botDefenseCooldownUntil || 0)
        ) {
          node.botDefenseModeActive = true;
          node.botDefenseModeStart = now;
          // Get infected branches for targeting
          const infectedBranches = (node.children || []).filter(
            (ch) =>
              ch &&
              ch.state === "alive" &&
              (ch.status === "malware" ||
                ch.status === "botnet" ||
                ch.status === "commandControl")
          );
          node.botDefenseTargets = infectedBranches;
          modesActivated.push(
            "⚔️ Bot Defense Mode (10s, spawns immunity packets)"
          );
        }

        // 3. Self-Healing mode is only activated when infected, so skip it here

        if (modesActivated.length > 0) {
          dependencies.logEvent("custom", {
            message: `🌟 Central Node Defense Modes Activated:\n${modesActivated.join(
              "\n"
            )}`,
          });
          dependencies.createPopParticles(node.x, node.y, dependencies.getColors().blue);
        } else {
          dependencies.logEvent("custom", {
            message: `⚠️ Central node defense modes are already active or on cooldown!`,
          });
        }
        return;
      }

      // Satellites cannot be hardened - they are just bridges
      if (node.isSatellite) {
        dependencies.logEvent("custom", {
          message: `ℹ️ Satellites are bridges and cannot be hardened.`,
        });
        return;
      }

      // Regular node hardening (firewall → guardian progression)
      if (!node.hasFirewall) {
        node.hasFirewall = true;
        dependencies.logEvent("custom", {
          alert: `🛡️ Firewall activated.`,
          details: { node: dependencies.getLogNodeRef(node) },
        });
      } else if (!node.isGuardian) {
        node.isGuardian = true;
        dependencies.logEvent("custom", {
          alert: `🌟 Promoted to Guardian status.`,
          details: { node: dependencies.getLogNodeRef(node) },
        });
      } else {
        dependencies.logEvent("custom", {
          alert: `⚠️ Node is already fully hardened.`,
          details: { node: dependencies.getLogNodeRef(node) },
        });
        return;
      }

      // Visual feedback
      dependencies.createPopParticles(node.x, node.y, dependencies.getColors().blue);
    },

    cureNode(node) {
      if (node.state !== "alive") return;

      const isInfected =
        node.status === "malware" ||
        node.status === "botnet" ||
        node.status === "commandControl" ||
        node.status === "red";
      const isHealthy = node.status === "green";

      if (!isInfected && !isHealthy) return;

      if (isInfected) {
        const previousStatus = node.status;
        dependencies.updateNodeStatus(node, "green");
        node.isImmunityHealing = false;
        node.attachedImmunityPackets = [];
        node.remediationState = "none";

        dependencies.logEvent("custom", {
          alert: `💊 Node instantly cured.`,
          details: { node: dependencies.getLogNodeRef(node), from: previousStatus, to: "green" },
        });

        // Visual feedback
        dependencies.createPopParticles(node.x, node.y, dependencies.getColors().green);
        return;
      }

      // Healthy node reinforcement: grant firewall or promote to guardian if already fortified
      // Satellites cannot receive firewalls - they are just bridges
      if (!node.hasFirewall && !node.isSatellite) {
        node.hasFirewall = true;
        node.shieldActive = true;
        node.shieldOpacity = Math.min(1, node.shieldOpacity + 0.5);
        dependencies.logEvent("custom", {
          alert: `🛡️ Firewall reinforced by tool.`,
          details: { node: dependencies.getLogNodeRef(node) },
        });
        dependencies.createPopParticles(node.x, node.y, dependencies.getColors().blue);
        return;
      }

      if (!node.isGuardian) {
        const promoted = dependencies.promoteToGuardian(node, null);
        if (promoted) {
          dependencies.logEvent("custom", {
            alert: `🕶 Promoted to Guardian by tool.`,
            details: { node: dependencies.getLogNodeRef(node) },
          });
        } else {
          dependencies.logEvent("custom", {
            alert: `ℹ️ Could not be promoted to Guardian.`,
            details: { node: dependencies.getLogNodeRef(node) },
          });
        }
      } else {
        dependencies.logEvent("custom", {
          alert: `ℹ️ Node is already a Guardian defender.`,
          details: { node: dependencies.getLogNodeRef(node) },
        });
      }
    },

    infectNode(node) {
      if (node.state !== "alive") return;

      const previousStatus = node.status;
      let particleColor = dependencies.getColors().malware;

      const details = {
        node: dependencies.getLogNodeRef(node),
        from: previousStatus,
      };

      let alert = "";

      // Remove any immunity packets attached to the node
      if (
        node.attachedImmunityPackets &&
        node.attachedImmunityPackets.length > 0
      ) {
        const packetCount = node.attachedImmunityPackets.length;
        node.attachedImmunityPackets.forEach((packet) => {
          if (packet.active) {
            packet.active = false;
            packet.isAttached = false;
            packet.attachedNode = null;
          }
        });
        node.attachedImmunityPackets = [];
        node.isImmunityHealing = false;
        node.immunityHealingStartTime = 0;
        details.strippedImmunityPackets = packetCount;
      }

      // Escalate infection based on current status
      if (node.status === "commandControl") {
        // Already at max infection level
        alert = `☣️ Infection tool used: already Command & Control.`;
        details.to = "commandControl";
      } else if (node.status === "botnet") {
        // Escalate to C&C
        dependencies.updateNodeStatus(node, "commandControl");
        alert = `☣️ Infection escalated to Command & Control.`;
        particleColor = dependencies.getColors().commandControl;
        details.to = "commandControl";
      } else if (node.status === "malware") {
        // Escalate to botnet
        dependencies.updateNodeStatus(node, "botnet");
        alert = `☣️ Infection escalated to botnet.`;
        particleColor = dependencies.getColors().botnet;
        details.to = "botnet";
      } else if (
        node.status === "green" ||
        node.status === "blue" ||
        node.status === "red" ||
        node.status === "yellow"
      ) {
        // Initial infection
        dependencies.updateNodeStatus(node, "malware");
        alert = `☣️ Node infected with malware.`;
        particleColor = dependencies.getColors().malware;
        details.to = "malware";
      } else {
        return; // Unknown status, do nothing
      }

      dependencies.logEvent("custom", { alert, details });

      // Visual feedback
      dependencies.createPopParticles(node.x, node.y, particleColor);
    },

    sproutNode(parentNode) {
      if (parentNode.state !== "alive") return;

      // Create a new child node
      // IMPROVED: Sprout outward from center
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      let baseAngle;

      if (parentNode.parent === null) {
        // Central node: random angle
        baseAngle = Math.random() * Math.PI * 2;
      } else {
        // Branch node: sprout away from center
        baseAngle = Math.atan2(
          parentNode.y - centerY,
          parentNode.x - centerX
        );
      }

      // Add organic variance (+/- 60 degrees)
      const angleVariance = (Math.random() - 0.5) * (Math.PI / 1.5);
      const angle = baseAngle + angleVariance;

      // IMPROVED: Match physics engine ideal distances
      // If parent is central node, this is 1st gen -> 160px
      // If parent is branch, this is 2nd+ gen -> 80px
      const isFirstGen = parentNode.parent === null;
      const idealDist = isFirstGen ? 160 : 80;
      const distance = idealDist + (Math.random() * 20 - 10);

      const targetX = parentNode.x + Math.cos(angle) * distance;
      const targetY = parentNode.y + Math.sin(angle) * distance;

      const newNode = new Node(
        Date.now() + Math.random(),
        targetX,
        targetY,
        parentNode
      );
      parentNode.children.push(newNode);
      nodes.push(newNode);
      edges.push({
        from: parentNode,
        to: newNode,
        natural: true,
      });

      // Apply node type based on selection
      let nodeTypeEmoji = "🟢";
      let nodeTypeName = "node";

      console.log("Sprouting node with type:", ToolState.getSelectedNodeType());

      switch (ToolState.getSelectedNodeType()) {
        case "firewall":
          newNode.hasFirewall = true;
          newNode.shieldActive = true;
          newNode.shieldOpacity = 0.8;
          nodeTypeEmoji = "🛡️";
          nodeTypeName = "firewall node";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().blue);
          break;

        case "guardian":
          // Manually set guardian properties (bypass eligibility checks for manual creation)
          newNode.isGuardian = true;
          newNode.hasFirewall = true;
          newNode.shieldActive = true;
          newNode.shieldOpacity = 0.8;
          newNode.shieldStrength = 0.8;
          newNode.currentColor = { ...dependencies.getColors().white };
          newNode.targetRadius = newNode.baseRadius * 1.15;
          newNode.guardianStreamCount = 0;
          newNode.lastGuardianBridgeUpdate = 0;
          newNode.lastGuardianFirewallAttempt = 0;
          nodeTypeEmoji = "🕶️";
          nodeTypeName = "guardian node";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().white);
          break;

        case "groundstation":
          if (parentNode.parent === null) {
            dependencies.logEvent("custom", { message: `⚠️ Cannot create ground station as child of central node.` });
            // Remove the node we just created
            const idx = parentNode.children.indexOf(newNode);
            if (idx !== -1) parentNode.children.splice(idx, 1);
            const nodeIdx = nodes.indexOf(newNode);
            if (nodeIdx !== -1) nodes.splice(nodeIdx, 1);
            const edgeIdx = edges.findIndex(e => e.to === newNode);
            if (edgeIdx !== -1) edges.splice(edgeIdx, 1);
            return;
          }
          // Manually set ground station properties
          newNode.isGroundStation = true;
          newNode.isHoneypot = false;
          newNode.groundStationEstablishedAt = Date.now();
          newNode.lastSatelliteLaunch = null;
          newNode.groundStationCountdown = 10000;
          newNode.groundStationCountdownStartedAt = Date.now();
          newNode.groundStationCountdownDuration = newNode.groundStationCountdown;
          newNode.launchAnimationUntil = 0;
          newNode.launchStatusText = null;
          newNode.baseRadius = 24;
          newNode.targetRadius = newNode.baseRadius;
          newNode.shieldStrength = 0.65;
          newNode.currentColor = { ...dependencies.getColors().groundStation };
          newNode.hasFirewall = true;
          nodeTypeEmoji = "📡";
          nodeTypeName = "ground station";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().blue);
          dependencies.logEvent("groundStationEstablished", { node: newNode });
          break;

        case "datacenter":
          // Manually set datacenter properties (bypass eligibility checks)
          newNode.isDatacenter = true;
          newNode.datacenterFormedAt = Date.now();
          newNode.lastDatacenterFortifyAt = 0;
          newNode.hasFirewall = true;
          newNode.shieldStrength = 1.0;
          newNode.currentColor = { ...dependencies.getColors().datacenter };
          nodeTypeEmoji = "🏢";
          nodeTypeName = "datacenter";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().datacenter);
          dependencies.logEvent("datacenterFormed", { node: newNode, clusterSize: 0 });
          break;

        case "honeypot":
          newNode.isHoneypot = true;
          newNode.hasFirewall = false;
          newNode.shieldActive = true;
          newNode.shieldOpacity = 0.8;
          nodeTypeEmoji = "🍯";
          nodeTypeName = "honeypot";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().neonGreen);
          break;

        case "malware":
          dependencies.updateNodeStatus(newNode, "malware");
          nodeTypeEmoji = "☣️";
          nodeTypeName = "infected node (malware)";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().malware);
          break;

        case "botnet":
          dependencies.updateNodeStatus(newNode, "malware");
          // Wait a frame then upgrade to botnet
          setTimeout(() => {
            if (newNode.state === "alive") {
              dependencies.updateNodeStatus(newNode, "botnet");
            }
          }, 100);
          nodeTypeEmoji = "🧟";
          nodeTypeName = "infected node (botnet)";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().botnet);
          break;

        case "commandcontrol":
          dependencies.updateNodeStatus(newNode, "malware");
          // Wait a frame then upgrade to botnet, then C&C
          setTimeout(() => {
            if (newNode.state === "alive") {
              dependencies.updateNodeStatus(newNode, "botnet");
              setTimeout(() => {
                if (newNode.state === "alive") {
                  dependencies.updateNodeStatus(newNode, "commandControl");
                }
              }, 100);
            }
          }, 100);
          nodeTypeEmoji = "💀";
          nodeTypeName = "infected node (C&C)";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().commandControl);
          break;

        default: // "normal"
          nodeTypeEmoji = "🟢";
          nodeTypeName = "node";
          dependencies.createPopParticles(newNode.x, newNode.y, dependencies.getColors().green);
          break;
      }

      dependencies.logEvent("custom", {
        alert: `🌱 New ${nodeTypeName} sprouted.`,
        details: {
          node: dependencies.getLogNodeRef(newNode),
          parent: dependencies.getLogNodeRef(parentNode),
        },
      });
    },

};

  window.NodeNet.ToolState = ToolState;
})();
