/**
 * @module HoneypotSystem
 * @summary Honeypot trap nodes — spawns/manages traps that lure and capture attackers.
 * @exports window.NodeNet.HoneypotSystem
 * @tags honeypot, trap, lure, attacker-capture, conversion, defense, hazard
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ───────────────────────────────────────── */
  let nodes = [];
  let CONFIG = null;
  let colors = null;
  let ParticleSystem = null;
  let logEvent = () => {};

  function configure(deps = {}) {
    if (deps.nodes !== undefined) nodes = deps.nodes;
    if (deps.CONFIG !== undefined) CONFIG = deps.CONFIG;
    if (deps.colors !== undefined) colors = deps.colors;
    if (deps.ParticleSystem !== undefined) ParticleSystem = deps.ParticleSystem;
    if (deps.logEvent !== undefined) logEvent = deps.logEvent;
    return this;
  }

  /**
   * Count current active honeypots in the network
   */
  function countActiveHoneypots() {
    return nodes.filter(
      (n) => n.isHoneypot && n.state === "alive" && n.status === "green"
    ).length;
  }

  /**
   * Convert a node to a honeypot
   * @param {Node} node - The node to convert
   */
  function convertToHoneypot(node) {
    if (!node || node.state !== "alive") return false;
    if (node.parent === null) return false; // Can't convert central node
    if (node.isSatellite || node.isGroundStation) return false;
    if (node.status === "malware" || node.status === "botnet" || node.status === "commandControl") return false;
    if (node.isHoneypot) return false; // Already a honeypot
    if (node.isDatacenter || node.isGuardian) return false; // Don't convert special nodes
    if (node.status !== "green") return false; // Only healthy nodes

    node.isHoneypot = true;
    node.honeypotConversions = 0;
    node.honeypotCreatedAt = Date.now();
    node.hasFirewall = false; // Honeypot resistance is intrinsic, not a visible firewall.
    node.currentColor = { ...colors.honeypot };

    ParticleSystem.createPopParticles(node.x, node.y, colors.honeypot);
    logEvent("honeypotCreated", { node });

    return true;
  }

  /**
   * Spawn honeypots near datacenters
   * Each datacenter has a chance to spawn a honeypot on a nearby healthy node
   */
  function spawnHoneypotsNearDatacenters() {
    const cfg = CONFIG.honeypot;
    const currentHoneypots = countActiveHoneypots();

    if (currentHoneypots >= cfg.maxHoneypots) return;

    // Find all active datacenters
    const datacenters = nodes.filter(
      (n) => n.isDatacenter && n.state === "alive" && n.status === "green"
    );

    if (datacenters.length === 0) return;

    for (const dc of datacenters) {
      if (currentHoneypots >= cfg.maxHoneypots) break;
      if (Math.random() > cfg.spawnChanceNearDatacenter) continue;

      // Find eligible nodes near this datacenter (within 2 hops)
      const eligibleNodes = [];

      // Check parent
      if (dc.parent && isHoneypotEligible(dc.parent)) {
        eligibleNodes.push(dc.parent);
      }

      // Check children
      dc.children.forEach((child) => {
        if (isHoneypotEligible(child)) {
          eligibleNodes.push(child);
        }
        // Check grandchildren
        child.children?.forEach((grandchild) => {
          if (isHoneypotEligible(grandchild)) {
            eligibleNodes.push(grandchild);
          }
        });
      });

      // Check siblings (other children of parent)
      if (dc.parent) {
        dc.parent.children.forEach((sibling) => {
          if (sibling !== dc && isHoneypotEligible(sibling)) {
            eligibleNodes.push(sibling);
          }
        });
      }

      if (eligibleNodes.length > 0) {
        const chosenNode =
          eligibleNodes[Math.floor(Math.random() * eligibleNodes.length)];
        if (convertToHoneypot(chosenNode)) {
          break; // Only spawn one honeypot per evaluation cycle
        }
      }
    }
  }

  /**
   * Check if a node is eligible to become a honeypot
   */
  function isHoneypotEligible(node) {
    if (!node || node.state !== "alive") return false;
    if (node.parent === null) return false; // Not central node
    if (node.status !== "green") return false;
    if (node.status === "malware" || node.status === "botnet" || node.status === "commandControl") return false;
    if (node.isHoneypot || node.isDatacenter || node.isGuardian) return false;
    if (node.isSatellite || node.isGroundStation) return false;
    return true;
  }

  /**
   * Random honeypot spawning - medium-low chance per tick
   */
  function tryRandomHoneypotSpawn() {
    const cfg = CONFIG.honeypot;
    const currentHoneypots = countActiveHoneypots();

    if (currentHoneypots >= cfg.maxHoneypots) return;
    if (Math.random() > cfg.randomSpawnChance) return;

    // Find all eligible nodes
    const eligibleNodes = nodes.filter((n) => isHoneypotEligible(n));

    if (eligibleNodes.length === 0) return;

    // Prefer nodes with more children (more likely to be attacked)
    const weighted = eligibleNodes.map((n) => ({
      node: n,
      weight: 1 + (n.children?.length || 0) * 0.5,
    }));

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const w of weighted) {
      random -= w.weight;
      if (random <= 0) {
        convertToHoneypot(w.node);
        return;
      }
    }
  }

  window.NodeNet.HoneypotSystem = {
    configure,
    countActiveHoneypots,
    convertToHoneypot,
    spawnHoneypotsNearDatacenters,
    isHoneypotEligible,
    tryRandomHoneypotSpawn,
  };
})();
