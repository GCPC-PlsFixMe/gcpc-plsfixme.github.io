/**
 * @module StateManagementSystem
 * @summary Save/load, import/export, (de)serialization of simulation state, and UI slider sync.
 * @exports window.NodeNet.StateManagementSystem
 * @tags state, save, load, import, export, serialization, localstorage, persistence
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    getEdges: () => [],
    getEdgesSet: () => new Set(),
    getDataPackets: () => [],
    getImmunityPackets: () => [],
    getStats: () => ({}),
    getColors: () => ({}),
    getConfig: () => ({}),
    getNodeConstructor: () => null,
    getViewState: () => ({}),
    getSettings: () => ({}),
    setSettings: () => {},
    clearSystems: () => {},
    applySproutPruneBalance: () => {},
    formatSproutPruneLabel: () => "",
    resetDatacenterTimers: () => {},
  };

const STATE_STORAGE_KEY = "nodenet_saved_state";

/**
 * Serialize current simulation state to JSON-compatible object
 */
function serializeState() {
  const nodes = dependencies.getNodes();
  const edges = dependencies.getEdges();
  const stats = dependencies.getStats();
  const settings = dependencies.getSettings();
  const viewState = dependencies.getViewState();
  return {
    version: 1,
    timestamp: Date.now(),
    settings: {
      ...settings,
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      friendlyName: n.friendlyName,
      x: n.x,
      y: n.y,
      baseX: n.baseX,
      baseY: n.baseY,
      state: n.state,
      status: n.status,
      baseRadius: n.baseRadius,
      radius: n.radius,
      targetRadius: n.targetRadius,
      opacity: n.opacity,
      forceMultiplier: n.forceMultiplier,
      parentId: n.parent ? n.parent.id : null,
      isGuardian: n.isGuardian || false,
      isDatacenter: n.isDatacenter || false,
      datacenterFormedAt: n.datacenterFormedAt || 0,
      lastDatacenterFortifyAt: n.lastDatacenterFortifyAt || 0,
      isGroundStation: n.isGroundStation || false,
      isSatellite: n.isSatellite || false,
      hasFirewall: n.hasFirewall || false,
      shieldStrength: n.shieldStrength || 0,
      isHoneypot: n.isHoneypot || false,
      honeypotConversions: n.honeypotConversions || 0,
      honeypotCreatedAt: n.honeypotCreatedAt || 0,
    })),
    viewState: { ...viewState },
    datacenterVpnEdges: edges
      .filter(
        (edge) => edge && edge.isDatacenterVpnTunnel && edge.from && edge.to
      )
      .map((edge) => ({
        fromId: edge.from.id,
        toId: edge.to.id,
        createdAt: edge.createdAt || 0,
        pulseSeed:
          typeof edge.pulseSeed === "number" ? edge.pulseSeed : null,
        linkQualityModel: edge.linkQualityModel
          ? {
              baselineLatencyMs:
                edge.linkQualityModel.baselineLatencyMs || null,
              baselineReliability:
                edge.linkQualityModel.baselineReliability || null,
              baselineBandwidth:
                edge.linkQualityModel.baselineBandwidth || null,
              congestionSeed: edge.linkQualityModel.congestionSeed || null,
              establishedAt: edge.linkQualityModel.establishedAt || null,
            }
          : null,
      })),
    stats: { ...stats },
  };
}

/**
 * Restore simulation state from serialized object
 */
function deserializeState(state) {
  const nodes = dependencies.getNodes();
  const edges = dependencies.getEdges();
  const edgesSet = dependencies.getEdgesSet();
  const dataPackets = dependencies.getDataPackets();
  const immunityPackets = dependencies.getImmunityPackets();
  const stats = dependencies.getStats();
  const colors = dependencies.getColors();
  const config = dependencies.getConfig();
  const Node = dependencies.getNodeConstructor();
  const viewState = dependencies.getViewState();
  if (!state || state.version !== 1) {
    throw new Error("Invalid or incompatible state format");
  }

  // Clear current state
  nodes.length = 0;
  edges.length = 0;
  edgesSet.clear();
  dataPackets.length = 0;
  immunityPackets.length = 0;
  dependencies.clearSystems();

  // Restore settings
  dependencies.setSettings(state.settings);
  updateSliderUI();

  // Create node map for parent references
  const nodeMap = new Map();

  // First pass: create nodes
  state.nodes.forEach((nData) => {
    const node = new Node(nData.id, nData.x, nData.y, null);
    // Preserve the saved friendly name (constructor generates a random one).
    if (nData.friendlyName) {
      node.friendlyName = nData.friendlyName;
      const _identity = window.NodeNet && window.NodeNet.NodeIdentity;
      if (_identity) _identity.register(null, nData.friendlyName);
    }
    node.baseX = nData.baseX;
    node.baseY = nData.baseY;
    node.state = nData.state;
    node.status = nData.status;
    node.baseRadius = nData.baseRadius;
    node.targetRadius = nData.targetRadius ?? nData.baseRadius;
    node.radius = nData.radius ?? nData.baseRadius;
    node.opacity = nData.opacity ?? 1;
    node.forceMultiplier = nData.forceMultiplier ?? 1;
    node.isGuardian = nData.isGuardian;
    node.isDatacenter = nData.isDatacenter || false;
    node.datacenterFormedAt = nData.datacenterFormedAt || 0;
    node.lastDatacenterFortifyAt = nData.lastDatacenterFortifyAt || 0;
    node.isGroundStation = nData.isGroundStation;
    node.isSatellite = nData.isSatellite;
    node.hasFirewall = nData.hasFirewall;
    node.shieldStrength = nData.shieldStrength;
    node.isHoneypot = nData.isHoneypot || false;
    node.honeypotConversions = nData.honeypotConversions || 0;
    node.honeypotCreatedAt = nData.honeypotCreatedAt || 0;
    node.children = [];

    // Set color based on status
    node.currentColor = { ...(colors[nData.status] || colors.green) };
    if (nData.isGuardian) node.currentColor = { ...colors.white };
    if (nData.isDatacenter) node.currentColor = { ...colors.datacenter };
    if (nData.isGroundStation) node.currentColor = { ...colors.groundStation };
    if (nData.isHoneypot) node.currentColor = { ...colors.honeypot };

    nodeMap.set(nData.id, node);
    nodes.push(node);
  });

  // Second pass: establish parent-child relationships and edges
  state.nodes.forEach((nData) => {
    const node = nodeMap.get(nData.id);
    if (nData.parentId !== null) {
      const parent = nodeMap.get(nData.parentId);
      if (parent) {
        node.parent = parent;
        parent.children.push(node);

        // Create edge
        const edge = { from: parent, to: node };
        edges.push(edge);
        edgesSet.add(edge);
      }
    }
  });

  if (Array.isArray(state.datacenterVpnEdges)) {
    state.datacenterVpnEdges.forEach((edgeData) => {
      const fromNode = nodeMap.get(edgeData.fromId);
      const toNode = nodeMap.get(edgeData.toId);
      if (!fromNode || !toNode || fromNode === toNode) return;

      const alreadyConnected = edges.some(
        (edge) =>
          edge.isDatacenterVpnTunnel &&
          ((edge.from === fromNode && edge.to === toNode) ||
            (edge.from === toNode && edge.to === fromNode))
      );
      if (alreadyConnected) return;

      const restoredEdge = {
        from: fromNode,
        to: toNode,
        isDatacenterVpnTunnel: true,
        createdAt: edgeData.createdAt || Date.now(),
        pulseSeed:
          typeof edgeData.pulseSeed === "number"
            ? edgeData.pulseSeed
            : Math.random() * Math.PI * 2,
      };

      if (edgeData.linkQualityModel) {
        restoredEdge.linkQualityModel = {
          baselineLatencyMs:
            edgeData.linkQualityModel.baselineLatencyMs ||
            config.linkQuality.baseLatencyMinMs,
          baselineReliability:
            edgeData.linkQualityModel.baselineReliability ||
            config.linkQuality.baseReliabilityMax,
          baselineBandwidth:
            edgeData.linkQualityModel.baselineBandwidth ||
            config.datacenter.highBandwidthFloor,
          congestionSeed:
            edgeData.linkQualityModel.congestionSeed ||
            Math.random() * Math.PI * 2,
          establishedAt:
            edgeData.linkQualityModel.establishedAt || Date.now(),
        };
      }

      window.NodeNet.LinkQualitySystem.enforceDatacenterHighBandwidth(restoredEdge);
      edges.push(restoredEdge);
      edgesSet.add(restoredEdge);
    });
  }

  // Restore stats
  if (state.stats) {
    Object.assign(stats, state.stats);
  }

  if (state.viewState && typeof state.viewState === "object") {
    Object.assign(viewState, state.viewState);
    if (!Number.isFinite(viewState.scale)) viewState.scale = 1;
    if (!Number.isFinite(viewState.targetScale)) viewState.targetScale = viewState.scale;
  }

  dependencies.resetDatacenterTimers();

  return true;
}

/**
 * Update slider UI to match current values
 */
function updateSliderUI() {
  const settings = dependencies.getSettings();
  const simSpeedSlider = document.getElementById("simSpeed");
  const packetSpeedSlider = document.getElementById("packetSpeed");
  const attackFreqSlider = document.getElementById("attackFreq");
  const healSpeedSlider = document.getElementById("healSpeed");
  const branchCountSlider = document.getElementById("branchCount");
  const branchDepthSlider = document.getElementById("branchDepth");
  const networkDensitySlider = document.getElementById("networkDensity");
  const sproutPruneSlider = document.getElementById("sproutPrune");

  if (simSpeedSlider) {
    simSpeedSlider.value = settings.simSpeedMultiplier * 100;
    document.getElementById("simSpeed-value").textContent = `${settings.simSpeedMultiplier.toFixed(1)}x`;
  }
  if (packetSpeedSlider) {
    packetSpeedSlider.value = settings.packetSpeedMultiplier * 100;
    document.getElementById("packetSpeed-value").textContent = `${settings.packetSpeedMultiplier.toFixed(1)}x`;
  }
  if (attackFreqSlider) {
    attackFreqSlider.value = settings.attackFreqMultiplier * 100;
    document.getElementById("attackFreq-value").textContent = `${settings.attackFreqMultiplier.toFixed(1)}x`;
  }
  if (healSpeedSlider) {
    healSpeedSlider.value = settings.healSpeedMultiplier * 100;
    document.getElementById("healSpeed-value").textContent = `${settings.healSpeedMultiplier.toFixed(1)}x`;
  }
  if (branchCountSlider) {
    branchCountSlider.value = settings.desiredBranchCount;
    document.getElementById("branchCount-value").textContent = settings.desiredBranchCount;
  }
  if (branchDepthSlider) {
    branchDepthSlider.value = settings.maxBranchDepth;
    document.getElementById("branchDepth-value").textContent = settings.maxBranchDepth;
  }
  if (networkDensitySlider) {
    networkDensitySlider.value = settings.networkSoftCap;
    document.getElementById("networkDensity-value").textContent = settings.networkSoftCap;
  }
  if (sproutPruneSlider) {
    sproutPruneSlider.value = settings.sproutPruneSliderValue;
    document.getElementById("sproutPrune-value").textContent = dependencies.formatSproutPruneLabel();
  }
}

/**
 * Show status message in state management UI
 */
function showStateStatus(message, isError = false) {
  const statusEl = document.getElementById("stateStatus");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "state-status" + (isError ? " error" : "");
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  }
}

/**
 * Save state to localStorage
 */
function saveStateToStorage() {
  try {
    const state = serializeState();
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
    showStateStatus("✓ State saved to browser");
    return true;
  } catch (e) {
    showStateStatus("✗ Failed to save state", true);
    console.error("Save state error:", e);
    return false;
  }
}

/**
 * Load state from localStorage
 */
function loadStateFromStorage() {
  try {
    const stateJson = localStorage.getItem(STATE_STORAGE_KEY);
    if (!stateJson) {
      showStateStatus("No saved state found", true);
      return false;
    }
    const state = JSON.parse(stateJson);
    deserializeState(state);
    showStateStatus("✓ State loaded from browser");
    return true;
  } catch (e) {
    showStateStatus("✗ Failed to load state", true);
    console.error("Load state error:", e);
    return false;
  }
}

/**
 * Export state to downloadable JSON file
 */
function exportStateToFile() {
  try {
    const state = serializeState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nodenet-state-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStateStatus("✓ State exported to file");
  } catch (e) {
    showStateStatus("✗ Export failed", true);
    console.error("Export error:", e);
  }
}

/**
 * Import state from uploaded JSON file
 */
function importStateFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const state = JSON.parse(e.target.result);
      deserializeState(state);
      showStateStatus("✓ State imported from file");
    } catch (err) {
      showStateStatus("✗ Invalid state file", true);
      console.error("Import error:", err);
    }
  };
  reader.readAsText(file);
}

/**
 * Initialize state management UI handlers
 */
function initializeStateManagement() {
  document.getElementById("saveStateBtn")?.addEventListener("click", saveStateToStorage);
  document.getElementById("loadStateBtn")?.addEventListener("click", loadStateFromStorage);
  document.getElementById("exportStateBtn")?.addEventListener("click", exportStateToFile);
  document.getElementById("importStateBtn")?.addEventListener("click", () => {
    document.getElementById("importStateFile")?.click();
  });
  document.getElementById("importStateFile")?.addEventListener("change", (e) => {
    if (e.target.files[0]) {
      importStateFromFile(e.target.files[0]);
      e.target.value = ""; // Reset for re-import
    }
  });
}

  const StateManagementSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    serializeState,
    deserializeState,
    updateSliderUI,
    showStateStatus,
    saveStateToStorage,
    loadStateFromStorage,
    exportStateToFile,
    importStateFromFile,
    initializeStateManagement,
  };

  window.NodeNet.StateManagementSystem = StateManagementSystem;
})();
