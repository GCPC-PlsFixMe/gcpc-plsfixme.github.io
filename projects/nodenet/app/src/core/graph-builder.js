/**
 * @module GraphBuilder
 * @summary Network initialization — builds the central node and the initial branch tree.
 * @exports window.NodeNet.GraphBuilder
 * @tags graph-builder, init, central-node, branches, createGraph, seed-network, topology
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────── */
  let canvas = null;
  let colors = null;
  let nodes = [];
  let edges = [];
  let pulses = [];
  let dataPackets = [];
  let immunityPackets = [];
  let ParticleSystem = null;
  let PingPacketSystem = null;
  let PingOfDeathSystem = null;
  let PhishPacketSystem = null;
  let CounterStrikeSystem = null;
  let DispatchPacketSystem = null;
  let TopologySystem = null;
  let createNode = (id, x, y, parent) => ({ id, x, y, parent });
  let desiredBranchCount = 5;
  let onSimulationStart = () => {};

  let initialBranchTimeout = null;

  function configure(deps = {}) {
    if (deps.canvas !== undefined) canvas = deps.canvas;
    if (deps.colors !== undefined) colors = deps.colors;
    if (deps.nodes !== undefined) nodes = deps.nodes;
    if (deps.edges !== undefined) edges = deps.edges;
    if (deps.pulses !== undefined) pulses = deps.pulses;
    if (deps.dataPackets !== undefined) dataPackets = deps.dataPackets;
    if (deps.immunityPackets !== undefined) immunityPackets = deps.immunityPackets;
    if (deps.ParticleSystem !== undefined) ParticleSystem = deps.ParticleSystem;
    if (deps.PingPacketSystem !== undefined) PingPacketSystem = deps.PingPacketSystem;
    if (deps.PingOfDeathSystem !== undefined) PingOfDeathSystem = deps.PingOfDeathSystem;
    if (deps.PhishPacketSystem !== undefined) PhishPacketSystem = deps.PhishPacketSystem;
    if (deps.CounterStrikeSystem !== undefined) CounterStrikeSystem = deps.CounterStrikeSystem;
    if (deps.DispatchPacketSystem !== undefined) DispatchPacketSystem = deps.DispatchPacketSystem;
    if (deps.TopologySystem !== undefined) TopologySystem = deps.TopologySystem;
    if (deps.createNode !== undefined) createNode = deps.createNode;
    if (deps.desiredBranchCount !== undefined) desiredBranchCount = deps.desiredBranchCount;
    if (deps.onSimulationStart !== undefined) onSimulationStart = deps.onSimulationStart;
    return this;
  }

  function createGraph() {
    onSimulationStart();
    clearTimeout(initialBranchTimeout);
    nodes.length = 0;
    edges.length = 0;
    pulses.length = 0;
    ParticleSystem.clearParticles();
    dataPackets.length = 0;
    immunityPackets.length = 0;
    PingPacketSystem.clearPingPackets();
    PingOfDeathSystem.clearPingOfDeathPackets();
    PhishPacketSystem.clearPhishPackets();
    CounterStrikeSystem.clearCounterStrikePackets();
    DispatchPacketSystem.clearDispatchPackets();
    ParticleSystem.clearHoneycombStreams();

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const root = createNode(0, centerX, centerY, null);
    root.baseRadius = 30;
    root.currentColor = { ...colors.blue };
    root.status = "blue";
    root.state = "alive";
    root.opacity = 1;
    root.radius = root.baseRadius;
    root.forceMultiplier = 1.0; // Full physics immediately (no spawn animation)
    nodes.push(root);

    createInitialBranches(0, desiredBranchCount);
  }

  function createInitialBranches(index, total) {
    if (index >= total) return;
    const angle = (index / total) * Math.PI * 2;
    TopologySystem.sproutNewBranch(angle);
    initialBranchTimeout = setTimeout(
      () => createInitialBranches(index + 1, total),
      800
    );
  }

  window.NodeNet.GraphBuilder = {
    configure,
    createGraph,
    createInitialBranches,
  };
})();
