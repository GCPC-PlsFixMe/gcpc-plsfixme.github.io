/**
 * @module ScenarioPresets
 * @summary Pre-configured scenarios (peaceful, outbreak, siege, fortress) selectable from the UI.
 * @exports window.NodeNet.ScenarioPresets
 * @tags presets, scenarios, peaceful, outbreak, siege, fortress, setup, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    resetSimulation: () => {},
    setDesiredBranchCount: () => {},
    setAttackFreqMultiplier: () => {},
    setHealSpeedMultiplier: () => {},
    setPacketSpeedMultiplier: () => {},
    updateSliderUI: () => {},
    showStateStatus: () => {},
    getNodes: () => [],
    infectNode: () => {},
    promoteToGuardian: () => {},
  };

  const ScenarioPresets = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    definitions: {
      peaceful: {
        name: "Peaceful Network",
        description: "A healthy network with minimal threats",
        apply() {
          dependencies.resetSimulation();
          dependencies.setDesiredBranchCount(8);
          dependencies.setAttackFreqMultiplier(0.1);
          dependencies.setHealSpeedMultiplier(2.0);
          dependencies.updateSliderUI();
          dependencies.showStateStatus("🌿 Peaceful scenario loaded");
        },
      },
      outbreak: {
        name: "Malware Outbreak",
        description: "Network experiencing malware infection",
        apply() {
          dependencies.resetSimulation();
          dependencies.setDesiredBranchCount(6);
          dependencies.setAttackFreqMultiplier(2.5);
          dependencies.setHealSpeedMultiplier(0.5);
          dependencies.updateSliderUI();
          // Infect some nodes after a short delay
          setTimeout(() => {
            const nodes = dependencies.getNodes();
            const healthyNodes = nodes.filter(
              (n) =>
                n.state === "alive" &&
                n.status === "green" &&
                n.parent !== null
            );
            const toInfect = healthyNodes.slice(
              0,
              Math.min(3, healthyNodes.length)
            );
            toInfect.forEach((n) => dependencies.infectNode(n));
          }, 1000);
          dependencies.showStateStatus("☣️ Outbreak scenario loaded");
        },
      },
      siege: {
        name: "DDOS Siege",
        description: "Network under coordinated DDOS attack",
        apply() {
          dependencies.resetSimulation();
          dependencies.setDesiredBranchCount(5);
          dependencies.setAttackFreqMultiplier(3.0);
          dependencies.setHealSpeedMultiplier(1.0);
          dependencies.setPacketSpeedMultiplier(1.5);
          dependencies.updateSliderUI();
          // Create initial infections for C&C formation
          setTimeout(() => {
            const nodes = dependencies.getNodes();
            const healthyNodes = nodes.filter(
              (n) =>
                n.state === "alive" &&
                n.status === "green" &&
                n.parent !== null
            );
            const toInfect = healthyNodes.slice(
              0,
              Math.min(5, healthyNodes.length)
            );
            toInfect.forEach((n) => dependencies.infectNode(n));
          }, 500);
          dependencies.showStateStatus("⚔️ Siege scenario loaded");
        },
      },
      fortress: {
        name: "Fortress Network",
        description: "Heavily defended network with guardians",
        apply() {
          dependencies.resetSimulation();
          dependencies.setDesiredBranchCount(7);
          dependencies.setAttackFreqMultiplier(1.5);
          dependencies.setHealSpeedMultiplier(1.5);
          dependencies.updateSliderUI();
          // Promote some nodes to guardians after delay
          setTimeout(() => {
            const nodes = dependencies.getNodes();
            const eligibleNodes = nodes.filter(
              (n) =>
                n.state === "alive" &&
                n.status === "green" &&
                n.parent !== null &&
                !n.isGuardian &&
                !n.isGroundStation
            );
            const toPromote = eligibleNodes.slice(
              0,
              Math.min(4, eligibleNodes.length)
            );
            toPromote.forEach((n) =>
              dependencies.promoteToGuardian(n, "guardianPromoted")
            );
          }, 1000);
          dependencies.showStateStatus("🏰 Fortress scenario loaded");
        },
      },
    },

    /**
     * Initialize scenario preset button handlers
     */
    initializePresets() {
      const presetButtons = document.querySelectorAll(".preset-btn");
      presetButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const presetName = btn.dataset.preset;
          const preset = this.definitions[presetName];
          if (preset) {
            preset.apply();
          }
        });
      });
      return this;
    },
  };

  window.NodeNet.ScenarioPresets = ScenarioPresets;
})();
