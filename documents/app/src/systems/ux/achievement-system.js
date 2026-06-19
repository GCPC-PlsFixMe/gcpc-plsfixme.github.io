/**
 * @module AchievementSystem
 * @summary Achievements — toast celebrations for key simulation milestones.
 * @exports window.NodeNet.AchievementSystem
 * @tags achievements, milestones, toast, gamification, celebration, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    getStats: () => ({}),
    computeNetworkHealth: () => 100,
    getSimulationStartTime: () => Date.now(),
  };

  let checkIntervalId = null;
  let checkTimeoutId = null;

  const AchievementSystem = {
    unlocked: new Set(),

    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    /**
     * Check all achievement conditions and show toasts for newly unlocked ones
     */
    check() {
      const nodes = dependencies.getNodes();
      const stats = dependencies.getStats();
      const computeNetworkHealth = dependencies.computeNetworkHealth;
      const simulationStartTime = dependencies.getSimulationStartTime();

      for (const def of this.definitions) {
        if (this.unlocked.has(def.id)) continue;
        try {
          if (def.check(nodes, stats, computeNetworkHealth, simulationStartTime)) {
            this.unlocked.add(def.id);
            this.showToast(def.icon, def.name);
          }
        } catch (e) { /* Silently skip if check function fails */ }
      }
    },

    /**
     * Creates and displays an achievement toast notification
     * @param {string} icon - Emoji icon for the achievement
     * @param {string} name - Name/description of the achievement
     */
    showToast(icon, name) {
      const container = document.getElementById("achievementContainer");
      if (!container) return;
      const toast = document.createElement("div");
      toast.className = "achievement-toast";
      toast.innerHTML = `
        <span class="achievement-icon">${icon}</span>
        <div class="achievement-text">
          <span class="achievement-label">Achievement Unlocked</span>
          <span class="achievement-name">${name}</span>
        </div>
      `;
      container.appendChild(toast);
      // Remove after animation completes (4s display + 0.5s fade)
      setTimeout(() => toast.remove(), 5000);
    },

    /**
     * Start periodic achievement checking.
     * @param {number} delayMs - Initial delay before first check (default 6000)
     * @param {number} intervalMs - Interval between checks (default 2000)
     */
    startChecking(delayMs = 6000, intervalMs = 2000) {
      this.stopChecking();
      checkTimeoutId = setTimeout(() => {
        checkIntervalId = setInterval(() => this.check(), intervalMs);
      }, delayMs);
      return this;
    },

    /**
     * Stop periodic achievement checking.
     */
    stopChecking() {
      if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
      }
      if (checkTimeoutId) {
        clearTimeout(checkTimeoutId);
        checkTimeoutId = null;
      }
      return this;
    },

    definitions: [
      { id: "first_boot",       icon: "🚀", name: "System Online",                  check: (nodes) => nodes.length > 1 },
      { id: "ten_nodes",        icon: "🌳", name: "Growing Network (10 nodes)",       check: (nodes) => nodes.filter((n) => n.state === "alive").length >= 10 },
      { id: "twenty_five",      icon: "🏗️", name: "Infrastructure Boom (25 nodes)",    check: (nodes) => nodes.filter((n) => n.state === "alive").length >= 25 },
      { id: "fifty_nodes",      icon: "🌐", name: "Network Backbone (50 nodes)",      check: (nodes) => nodes.filter((n) => n.state === "alive").length >= 50 },
      { id: "hundred_nodes",    icon: "💯", name: "Centurion Network (100 nodes)",  check: (nodes) => nodes.filter((n) => n.state === "alive").length >= 100 },
      { id: "first_guardian",   icon: "🌟", name: "First Guardian Promoted",         check: (nodes) => nodes.some((n) => n.isGuardian && n.state === "alive") },
      { id: "first_firewall",   icon: "🛡️", name: "First Firewall Active",           check: (nodes) => nodes.some((n) => n.hasFirewall && n.state === "alive") },
      { id: "first_satellite",  icon: "🛰️", name: "Satellite Launched",              check: (nodes) => nodes.some((n) => n.isSatellite && n.state === "alive") },
      { id: "first_datacenter", icon: "🏢", name: "Datacenter Established",            check: (nodes) => nodes.some((n) => n.isDatacenter && n.state === "alive") },
      { id: "first_infection",  icon: "☣️", name: "First Infection Detected",         check: (_n, stats) => stats.totalInfections >= 1 },
      { id: "survived_attack",  icon: "⚔️", name: "Survived First Attack",            check: (_n, stats) => stats.totalDefenses >= 1 },
      { id: "ten_recoveries",   icon: "💊", name: "Master Healer (10 recoveries)",  check: (_n, stats) => stats.totalRecoveries >= 10 },
      { id: "clean_network",    icon: "✨", name: "Network Purified",                 check: (_n, stats, computeNetworkHealth) => stats.totalRecoveries >= 5 && computeNetworkHealth() === 100 },
      { id: "five_min_uptime",  icon: "⏱️", name: "5 Minutes Uptime",                 check: (_n, _s, _h, simulationStartTime) => (Date.now() - simulationStartTime) >= 300000 },
      { id: "spider_five",      icon: "🕷️", name: "Web Crawler Fed 5 Nodes",          check: (_n, stats) => stats.spiderNodesCrawled >= 5 },
    ],
  };

  window.NodeNet.AchievementSystem = AchievementSystem;
})();
