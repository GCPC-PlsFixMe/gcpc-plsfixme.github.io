/**
 * @module HealingSystem
 * @summary Network recovery — status transitions, tree propagation, direct healing of yellow nodes, and red-node adoption.
 * @description Public API: `configure(deps)`, `updateNodeStatus()` (transition
 *   gatekeeper), `propagateStatus()` (recursive cascade), `healNetwork()`
 *   (3-strategy coordinator), `adoptRedNodes()` (re-parent red under healthy).
 * @exports window.NodeNet.HealingSystem
 * @tags healing, recovery, status, propagation, adoption, defense, health
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────── */
  let nodes = [];
  let edges = [];
  let getNodes = () => nodes;
  let getEdges = () => edges;
  let canvasRef = null;
  let healSpeedMultiplier = () => 1;
  let logEventFn = () => {};
  let incrementStatFn = () => {};
  let redistributeImmunityPacketsFn = () => {};
  let demoteGuardianFn = () => {};
  let demoteDatacenterFn = () => {};
  let hasWirelessPathToHealthyBranchFn = () => false;
  let isDescendantFn = () => false;
  let getNodeDepthFn = () => 0;
  let MAX_BRANCH_DEPTH = 8;
  let getMaxBranchDepth = () => MAX_BRANCH_DEPTH;
  let STATUS_LOG_KEYS = {};

  /* ── helpers ────────────────────────────────────────────────────────── */
  function refresh() {
    nodes = getNodes();
    edges = getEdges();
  }

  /* ── status log keys (fallback) ─────────────────────────────────────── */
  const DEFAULT_STATUS_LOG_KEYS = {
    green: "statusRecovered",
    yellow: "statusImpacted",
    red: "statusDown",
    malware: "statusMalware",
    botnet: "statusBotnet",
    blue: "statusBlue",
  };

  /* ══════════════════════════════════════════════════════════════════════
     updateNodeStatus  —  state transition gatekeeper
     ══════════════════════════════════════════════════════════════════════ */

  function updateNodeStatus(node, newStatus) {
    if (!node || node.state !== "alive" || node.status === newStatus) return;
    if (node.isSatellite) return;

    // Prevent ground stations from going down or getting infected during launch countdown
    if (
      node.isGroundStation &&
      node.groundStationCountdown > 0 &&
      (newStatus === "red" || newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl")
    ) {
      return;
    }

    // Prevent infection of ground stations and down nodes
    if (
      node.isGroundStation &&
      (newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl")
    ) {
      return;
    }
    if (
      node.status === "red" &&
      (newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl")
    ) {
      return;
    }

    const previousStatus = node.status;
    const isRoot = node.parent === null;

    if (
      isRoot &&
      (newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl")
    ) {
      logEventFn("centralCompromised", { node });
      node.isSelfHealing = false;
      node.hasRecoveryShield = false;
      node.botDefenseModeActive = false;
      node.botDefenseTargets = [];
      node.botDefenseLastBurst = 0;

      if (node.attachedImmunityPackets && node.attachedImmunityPackets.length > 0) {
        redistributeImmunityPacketsFn(node);
      }
    }

    if (
      node.isGuardian &&
      (newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl")
    ) {
      demoteGuardianFn(node, "guardianDemoted");
      newStatus = "malware";
    }

    if (
      node.isDatacenter &&
      (newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl")
    ) {
      demoteDatacenterFn(node, "status changed");
    }

    node.status = newStatus;
    node.statusChangedAt = Date.now();
    node.isHealing = false;

    // Clear immunity healing state when node changes status
    if (newStatus !== "malware" && newStatus !== "botnet" && newStatus !== "commandControl") {
      node.isImmunityHealing = false;
      node.immunityHealingStartTime = 0;
      node.attachedImmunityPackets.forEach((packet) => {
        packet.isAttached = false;
        packet.attachedNode = null;
      });
      node.attachedImmunityPackets = [];
    }

    if (newStatus === "malware" || newStatus === "botnet" || newStatus === "commandControl") {
      if (!node.infectedAt) {
        node.infectedAt = Date.now();
        node.dispatchDelay = 2000 + Math.random() * 4000;
        node.spreadDelay = 500 + Math.random() * 2500;
        node.canSpread = Math.random() > 0.05;
      }
    } else if (newStatus === "green" || (isRoot && newStatus === "blue")) {
      node.infectedAt = null;
      node.spreadDelay = 0;
      node.canSpread = true;
      node.isTargeted = false;

      if (
        previousStatus === "malware" ||
        previousStatus === "botnet" ||
        previousStatus === "red" ||
        previousStatus === "yellow"
      ) {
        incrementStatFn("totalRecoveries");
      }

      if (!node.hasFirewall && !node.isSatellite && Math.random() < 0.25) {
        node.hasFirewall = true;
        logEventFn("firewallGained", { node });
      }
    }

    const keys = STATUS_LOG_KEYS || DEFAULT_STATUS_LOG_KEYS;
    const statusLogKey = keys[newStatus];
    if (statusLogKey) {
      logEventFn(statusLogKey, { node, previousStatus, isGroundStation: node.isGroundStation });
    }

    if (newStatus === "red" || newStatus === "malware" || newStatus === "botnet")
      propagateStatus(node, "yellow", true);
    if (newStatus === "green" || (isRoot && newStatus === "blue"))
      propagateStatus(node, "green", true);
  }

  /* ══════════════════════════════════════════════════════════════════════
     propagateStatus  —  recursive tree status cascade
     ══════════════════════════════════════════════════════════════════════ */

  function propagateStatus(parentNode, status, preserveMalware = false) {
    for (const child of parentNode.children) {
      if (!child || child.isSatellite) continue;

      if (
        preserveMalware &&
        (child.status === "malware" || child.status === "botnet" || child.status === "commandControl")
      ) {
        propagateStatus(child, status, preserveMalware);
        continue;
      }

      if (status === "yellow" && hasWirelessPathToHealthyBranchFn(child)) {
        if (child.status !== "green") {
          child.status = "green";
        }
        propagateStatus(child, "green", preserveMalware);
        continue;
      }

      child.status = status;
      propagateStatus(child, status, preserveMalware);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     healNetwork  —  3-strategy healing coordinator
     ══════════════════════════════════════════════════════════════════════ */

  function healNetwork() {
    refresh();
    const hsm = healSpeedMultiplier();
    const HEAL_DELAY = 2000 / hsm;
    const SELF_HEAL_DELAY = 3000 / hsm;

    // Strategy 1: yellow nodes with healthy parents self-heal
    const yellowNodesWithHealthyParent = nodes.filter(
      (n) =>
        n.status === "yellow" && n.parent && n.state === "alive" && !n.isSatellite &&
        (n.parent.status === "green" || (n.parent.parent === null && n.parent.status === "blue")) &&
        Date.now() > n.statusChangedAt + SELF_HEAL_DELAY
    );

    if (yellowNodesWithHealthyParent.length > 0) {
      yellowNodesWithHealthyParent.forEach((n) => updateNodeStatus(n, "green"));
      return;
    }

    // Strategy 2: yellow nodes with wireless paths heal via satellite
    const yellowNodesWithWirelessPath = nodes.filter(
      (n) =>
        n.status === "yellow" && n.state === "alive" && !n.isSatellite &&
        hasWirelessPathToHealthyBranchFn(n) &&
        Date.now() > n.statusChangedAt + SELF_HEAL_DELAY
    );

    if (yellowNodesWithWirelessPath.length > 0) {
      yellowNodesWithWirelessPath.forEach((n) => updateNodeStatus(n, "green"));
      return;
    }

    // Strategy 3: yellow nodes with red parents get adopted by nearby green nodes
    const yellowNodes = nodes.filter(
      (n) =>
        n.status === "yellow" && n.parent && n.parent.status === "red" &&
        !n.isHealing && Date.now() > n.parent.statusChangedAt + HEAL_DELAY
    );
    if (yellowNodes.length === 0) return;

    const targetNode = yellowNodes[0];

    const potentialHealers = nodes.filter((n) => {
      if (n.status !== "green" || n.state !== "alive") return false;
      if (n.id === targetNode.id) return false;
      if (n.isSatellite) return false;
      if (isDescendantFn(targetNode, n)) return false;
      if (getNodeDepthFn(n) >= getMaxBranchDepth()) return false;
      return true;
    });

    if (potentialHealers.length === 0) return;

    const canvas = canvasRef;
    if (!canvas) return;
    const centerX = canvas.width / 2;
    let closestHealer = null;
    let minCost = Infinity;

    potentialHealers.forEach((healer) => {
      const dx = healer.x - targetNode.x;
      const dy = targetNode.y - healer.y;
      const distanceSq = dx * dx + dy * dy;

      let penalty = 0;
      if ((targetNode.x > centerX && healer.x < centerX) || (targetNode.x < centerX && healer.x > centerX)) {
        penalty = 300 * 300;
      }

      const cost = distanceSq + penalty;
      if (cost < minCost) {
        minCost = cost;
        closestHealer = healer;
      }
    });

    if (closestHealer) {
      const dx = closestHealer.x - targetNode.x;
      const dy = closestHealer.y - targetNode.y;
      if (dx * dx + dy * dy >= 75 * 75) return;

      targetNode.isHealing = true;

      const oldParent = targetNode.parent;
      edges = edges.filter((edge) => !(edge.from === oldParent && edge.to === targetNode));
      oldParent.children = oldParent.children.filter((child) => child.id !== targetNode.id);

      targetNode.parent = closestHealer;
      closestHealer.children.push(targetNode);
      edges.push({ from: closestHealer, to: targetNode });

      updateNodeStatus(targetNode, "green");
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     adoptRedNodes  —  re-parent red nodes with children under green nodes
     ══════════════════════════════════════════════════════════════════════ */

  function adoptRedNodes() {
    refresh();
    const hsm = healSpeedMultiplier();
    const ADOPTION_DELAY = 2000 / hsm;

    const redNodesToAdopt = nodes.filter(
      (n) =>
        n.status === "red" && n.parent && !n.isHealing &&
        n.children.length > 0 && Date.now() > n.statusChangedAt + ADOPTION_DELAY
    );

    if (redNodesToAdopt.length === 0) return;

    const targetNode = redNodesToAdopt[0];

    const potentialAdopters = nodes.filter((n) => {
      if (n.status !== "green" || n.state !== "alive") return false;
      if (n.id === targetNode.id) return false;
      if (n.isSatellite) return false;
      if (n.parent === targetNode) return false;
      if (targetNode.parent && targetNode.parent.id === n.id) return false;
      if (isDescendantFn(targetNode, n)) return false;
      if (getNodeDepthFn(n) >= getMaxBranchDepth()) return false;
      return true;
    });

    if (potentialAdopters.length === 0) return;

    const canvas = canvasRef;
    if (!canvas) return;
    const centerX = canvas.width / 2;
    let closestAdopter = null;
    let minCost = Infinity;

    potentialAdopters.forEach((adopter) => {
      const dx = adopter.x - targetNode.x;
      const dy = adopter.y - targetNode.y;
      const distanceSq = dx * dx + dy * dy;

      let penalty = 0;
      if ((targetNode.x > centerX && adopter.x < centerX) || (targetNode.x < centerX && adopter.x > centerX)) {
        penalty = 300 * 300;
      }

      const cost = distanceSq + penalty;
      if (cost < minCost) {
        minCost = cost;
        closestAdopter = adopter;
      }
    });

    if (closestAdopter) {
      const dx = closestAdopter.x - targetNode.x;
      const dy = closestAdopter.y - targetNode.y;
      if (dx * dx + dy * dy >= 75 * 75) return;

      targetNode.isHealing = true;

      const oldParent = targetNode.parent;
      if (oldParent) {
        edges = edges.filter((edge) => !(edge.from === oldParent && edge.to === targetNode));
        oldParent.children = oldParent.children.filter((c) => c !== targetNode);
      }

      targetNode.parent = closestAdopter;
      closestAdopter.children.push(targetNode);
      edges.push({ from: closestAdopter, to: targetNode });

      updateNodeStatus(targetNode, "green");
    }
  }

  function getNodeDefenseBonus(node) {
    if (!node) return 0;
    if (node.isGuardian) return 0.75;
    if (node.parent === null) return 0; // Central node uses different logic

    const descendantCount =
      typeof window.NodeNet !== 'undefined' &&
      window.NodeNet.TreeUtils &&
      window.NodeNet.TreeUtils.countDescendants
        ? window.NodeNet.TreeUtils.countDescendants(node)
        : 0;

    if (descendantCount >= 6) return 0.15; // 15% bonus
    if (descendantCount >= 4) return 0.1;  // 10% bonus
    if (descendantCount >= 2) return 0.05; // 5% bonus
    return 0; // No bonus
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  const HealingSystem = {
    configure(deps = {}) {
      if (deps.getNodes !== undefined) getNodes = deps.getNodes;
      if (deps.getEdges !== undefined) getEdges = deps.getEdges;
      if (deps.canvas !== undefined) canvasRef = deps.canvas;
      if (deps.getHealSpeedMultiplier !== undefined) healSpeedMultiplier = deps.getHealSpeedMultiplier;
      if (deps.logEvent !== undefined) logEventFn = deps.logEvent;
      if (deps.incrementStat !== undefined) incrementStatFn = deps.incrementStat;
      if (deps.redistributeImmunityPackets !== undefined) redistributeImmunityPacketsFn = deps.redistributeImmunityPackets;
      if (deps.demoteGuardian !== undefined) demoteGuardianFn = deps.demoteGuardian;
      if (deps.demoteDatacenter !== undefined) demoteDatacenterFn = deps.demoteDatacenter;
      if (deps.hasWirelessPathToHealthyBranch !== undefined) hasWirelessPathToHealthyBranchFn = deps.hasWirelessPathToHealthyBranch;
      if (deps.isDescendant !== undefined) isDescendantFn = deps.isDescendant;
      if (deps.getNodeDepth !== undefined) getNodeDepthFn = deps.getNodeDepth;
      if (deps.MAX_BRANCH_DEPTH !== undefined) MAX_BRANCH_DEPTH = deps.MAX_BRANCH_DEPTH;
      if (deps.getMaxBranchDepth !== undefined) getMaxBranchDepth = deps.getMaxBranchDepth;
      if (deps.STATUS_LOG_KEYS !== undefined) STATUS_LOG_KEYS = deps.STATUS_LOG_KEYS;
      return this;
    },

    updateNodeStatus,
    propagateStatus,
    healNetwork,
    adoptRedNodes,
    getNodeDefenseBonus,
  };

  window.NodeNet.HealingSystem = HealingSystem;
})();