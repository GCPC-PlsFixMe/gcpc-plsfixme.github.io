/**
 * @module HUDSystem
 * @summary HUD — top status bar, network status light, uptime/health chips, help overlay, and danger vignette.
 * @exports window.NodeNet.HUDSystem
 * @tags hud, status-bar, chips, health, uptime, help-overlay, vignette, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    getSimulationStartTime: () => Date.now(),
  };

  // --- DOM references ---
  const _statusLight = document.getElementById("networkStatusLight");
  const _STATUS_CLASSES = [
    "status-healthy",
    "status-infected",
    "status-down",
    "status-bot-fight",
    "status-healing",
  ];
  const _STATUS_LABELS = {
    "status-healthy": "Network Status: Healthy",
    "status-infected": "Network Status: Infected",
    "status-down": "Network Status: Critical - Mostly Down",
    "status-bot-fight": "Network Status: Bot Fight Mode Active",
    "status-healing": "Network Status: Self-Healing Mode",
  };

  let _lastVignetteHealthState = "good";
  let _intervalIds = [];

  // --- Help overlay click listener ---
  document.getElementById("helpOverlay")?.addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("visible");
  });

  const HUDSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    /**
     * Computes a 0-100 network health score based on node statuses.
     * Green = 100%, yellow = 50%, infected/red = 0%
     * @returns {number} Health percentage 0-100
     */
    computeNetworkHealth() {
      const nodes = dependencies.getNodes();
      const alive = nodes.filter((n) => n.state === "alive" && !n.isSatellite);
      if (alive.length === 0) return 100;
      let score = 0;
      for (const n of alive) {
        if (n.status === "green" || n.status === "blue") score += 1;
        else if (n.status === "yellow") score += 0.5;
        // red, malware, botnet, commandControl = 0
      }
      return Math.round((score / alive.length) * 100);
    },

    /**
     * Computes the current network state and updates the pulsing status indicator.
     * Priority (highest → lowest): Bot Fight Mode > Self-Healing > Mostly Down > Mostly Infected > Healthy
     */
    updateNetworkStatusLight() {
      const nodes = dependencies.getNodes();
      if (!_statusLight || nodes.length === 0) return;

      const central = nodes[0];
      const alive = nodes.filter((n) => n.state === "alive" && !n.isSatellite);
      const total = alive.length;
      if (total === 0) return;

      let newClass = "status-healthy";

      // 1. Blue — Bot Fight Mode (central node running bot defense)
      if (central && central.botDefenseModeActive) {
        newClass = "status-bot-fight";
      }
      // 2. Yellow — Any node in self-healing mode
      else if (alive.some((n) => n.isSelfHealing)) {
        newClass = "status-healing";
      }
      // 3. Red — Majority of nodes are red/yellow (down or impacted)
      else {
        const downCount = alive.filter(
          (n) => n.status === "red" || n.status === "yellow"
        ).length;
        const infectedCount = alive.filter(
          (n) =>
            n.status === "malware" ||
            n.status === "botnet" ||
            n.status === "commandControl"
        ).length;
        const downRatio = downCount / total;
        const infectedRatio = infectedCount / total;

        if (downRatio >= 0.35) {
          newClass = "status-down";
        } else if (infectedRatio >= 0.25) {
          newClass = "status-infected";
        }
        // else default: status-healthy
      }

      // Only touch DOM when state actually changes
      if (!_statusLight.classList.contains(newClass)) {
        _statusLight.classList.remove(..._STATUS_CLASSES);
        _statusLight.classList.add(newClass);
        _statusLight.title = _STATUS_LABELS[newClass];
      }
    },

    /**
     * Formats seconds into MM:SS or HH:MM:SS for the uptime display
     * @param {number} totalSec - Total elapsed seconds
     * @returns {string} Formatted time string
     */
    formatUptime(totalSec) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = Math.floor(totalSec % 60);
      if (h > 0)
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(
          2,
          "0"
        )}`;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },

    /**
     * Updates the uptime timer and health score chips in the top status bar
     */
    updateUptimeAndHealth() {
      const simulationStartTime = dependencies.getSimulationStartTime();
      const elapsed = (Date.now() - simulationStartTime) / 1000;
      const chipUptime = document.getElementById("chip-uptime");
      if (chipUptime) chipUptime.textContent = this.formatUptime(elapsed);

      const health = this.computeNetworkHealth();
      const chipHealth = document.getElementById("chip-health");
      if (chipHealth) {
        chipHealth.textContent = health + "%";
        // Color-code the health chip based on value
        const chipEl = chipHealth.closest(".metric-chip");
        if (chipEl) {
          chipEl.classList.remove("healthy", "warning", "danger");
          if (health >= 70) chipEl.classList.add("healthy");
          else if (health >= 40) chipEl.classList.add("warning");
          else chipEl.classList.add("danger");
        }
      }
    },

    /**
     * Monitors network health and triggers a red vignette pulse
     * when the network transitions from healthy to critical state
     */
    checkVignetteTrigger() {
      const health = this.computeNetworkHealth();
      const currentState = health < 35 ? "critical" : "good";
      if (
        currentState === "critical" &&
        _lastVignetteHealthState === "good"
      ) {
        const overlay = document.getElementById("vignetteOverlay");
        if (overlay) {
          overlay.classList.remove("active");
          void overlay.offsetWidth; // Force reflow to restart animation
          overlay.classList.add("active");
          setTimeout(() => overlay.classList.remove("active"), 1600);
        }
      }
      _lastVignetteHealthState = currentState;
    },

    /**
     * Toggles the keyboard shortcuts help overlay visibility
     */
    toggleHelpOverlay() {
      const overlay = document.getElementById("helpOverlay");
      if (!overlay) return;
      overlay.classList.toggle("visible");
    },

    /**
     * Closes the help overlay if it is currently visible.
     * @returns {boolean} true if the overlay was visible and closed
     */
    closeHelpOverlayIfVisible() {
      const overlay = document.getElementById("helpOverlay");
      if (overlay && overlay.classList.contains("visible")) {
        overlay.classList.remove("visible");
        return true;
      }
      return false;
    },

    /**
     * Start periodic HUD update intervals.
     */
    start() {
      this.stop();
      _intervalIds.push(
        setInterval(() => this.updateNetworkStatusLight(), 500)
      );
      _intervalIds.push(
        setInterval(() => this.updateUptimeAndHealth(), 500)
      );
      _intervalIds.push(
        setInterval(() => this.checkVignetteTrigger(), 1000)
      );
      return this;
    },

    /**
     * Stop all periodic HUD update intervals.
     */
    stop() {
      _intervalIds.forEach((id) => clearInterval(id));
      _intervalIds = [];
      return this;
    },
  };

  window.NodeNet.HUDSystem = HUDSystem;
})();
