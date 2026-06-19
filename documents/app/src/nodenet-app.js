/**
 * @module NodeNetApp
 * @summary Runtime coordinator — wires every NodeNet subsystem together and drives the render/update loop.
 * @description Loads last, after all `window.NodeNet.*` systems. Resolves system
 *   references, injects cross-system dependencies via each system's `configure()`,
 *   owns the shared `nodes` / `edges` / packet arrays, and runs `animate()`
 *   (per-frame render) plus `simulateNetworkEvents()` (500ms simulation tick).
 *   Feature systems keep moving into dedicated modules under v2/app/src as seams
 *   become safe to extract.
 * @exports (none — top-level script; bootstraps the simulation on load)
 * @tags coordinator, runtime, bootstrap, render-loop, animate, game-loop, dependency-injection, canvas, requestAnimationFrame, nodes, edges
 * @see core/config.js, core/graph-builder.js, core/node.js, systems/*
 */

const canvas = document.getElementById("networkCanvas");
const ctx = canvas.getContext("2d");

// ============================================================================
// CONFIGURATION OBJECT - Centralized constants for easy tuning
// ============================================================================
const CONFIG = window.NodeNetConfig;
if (!CONFIG) {
  throw new Error("NodeNetConfig must load before nodenet-app.js");
}

// Aliases for geometry functions extracted to core/geometry.js
const {
  linesIntersect,
  getPointOnQuadraticBezier,
  getTangentOnQuadraticBezier,
  getGuardianVpnTunnelControlPoint,
  getDatacenterVpnTunnelControlPoint,
  getNormalEdgeFlexControl,
  getPointAndPerpOnEdge,
  clampValue,
  getEdgeBetweenNodes,
  orientation,
  onSegment,
  segmentsIntersect,
  nodesHaveClearView,
  botnetMeshHasClearPath,
  isGuardianVpnTunnelBetween,
} = window.NodeNet.Geometry || {};

// Aliases for tree utility functions extracted to core/tree-utils.js
const {
  hasHealthyPathToCentral,
  countDescendants,
  clearDepthCache,
  getNodeDepth,
  isDescendant,
  getRootBranch,
} = window.NodeNet.TreeUtils || {};

// Aliases for central impact shake extracted to core/central-impact-shake.js
const CentralImpactShake = window.NodeNet.CentralImpactShake || {};

// ============================================================================
// OBJECT POOL SYSTEM - Reuse objects to reduce GC pressure
// ============================================================================
const ObjectPool = window.NodeNetObjectPool;
if (!ObjectPool) {
  throw new Error("NodeNetObjectPool must load before nodenet-app.js");
}
const sinkholeSystem = window.NodeNet?.SinkholeSystem
  ? new window.NodeNet.SinkholeSystem({ ...CONFIG.sinkhole, logEvent })
  : null;
const routeHijackerSystem = window.NodeNet?.RouteHijackerSystem
  ? new window.NodeNet.RouteHijackerSystem({ ...CONFIG.routeHijacker, logEvent })
  : null;

// Particle pool for pop effects
const particlePool = new ObjectPool(
  () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: null, radius: 0 }),
  (p, x, y, vx, vy, life, color, radius) => {
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.color = color; p.radius = radius;
  },
  100
);

// Legacy constant aliases for backward compatibility
const BOT_DEFENSE_DURATION = CONFIG.botDefense.duration;
const BOT_DEFENSE_COOLDOWN = CONFIG.botDefense.cooldown;
const BOT_DEFENSE_BURST_INTERVAL = CONFIG.botDefense.burstInterval;
const padding = CONFIG.network.padding;

let nodes = [];
let edges = [];
let edgesSet = new Set();
let isDragging = false;
let draggedNode = null;
// Freecam panning state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let lastPanOffsetX = 0;
let lastPanOffsetY = 0;

let pulses = [];
let dataPackets = []; // To store data flow packets
let immunityPackets = []; // To store white immunity packets
let gradientOffset = 0;
let isPaused = false;
let pausedTime = 0; // Track time spent paused for accurate timing
let lastCrossingCheck = 0; // Throttles the line crossing check

const NetworkStorms = window.NodeNet?.NetworkStorms;
if (!NetworkStorms) {
  throw new Error("NetworkStorms must load before nodenet-app.js");
}
const WebCrawler = window.NodeNet?.WebCrawlerSystem;
if (!WebCrawler) {
  throw new Error("WebCrawlerSystem must load before nodenet-app.js");
}
const TickerSystem = window.NodeNet?.TickerSystem;
if (!TickerSystem) {
  throw new Error("TickerSystem must load before nodenet-app.js");
}
const BackgroundSystem = window.NodeNet?.BackgroundSystem;
if (!BackgroundSystem) {
  throw new Error("BackgroundSystem must load before nodenet-app.js");
}
const LinkQualitySystem = window.NodeNet?.LinkQualitySystem;
if (!LinkQualitySystem) {
  throw new Error("LinkQualitySystem must load before nodenet-app.js");
}
const DataTrafficSystem = window.NodeNet?.DataTrafficSystem;
if (!DataTrafficSystem) {
  throw new Error("DataTrafficSystem must load before nodenet-app.js");
}
const SatelliteSystem = window.NodeNet?.SatelliteSystem;
if (!SatelliteSystem) {
  throw new Error("SatelliteSystem must load before nodenet-app.js");
}
const ImmunityPacketSystem = window.NodeNet?.ImmunityPacketSystem;
const DispatchPacketSystem = window.NodeNet?.DispatchPacketSystem;
if (!DispatchPacketSystem) {
  throw new Error("DispatchPacketSystem must load before nodenet-app.js");
}
const CounterStrikeSystem = window.NodeNet?.CounterStrikeSystem;
if (!CounterStrikeSystem) {
  throw new Error("CounterStrikeSystem must load before nodenet-app.js");
}
const PingOfDeathSystem = window.NodeNet?.PingOfDeathSystem;
if (!PingOfDeathSystem) {
  throw new Error("PingOfDeathSystem must load before nodenet-app.js");
}
const PhishPacketSystem = window.NodeNet?.PhishPacketSystem;
if (!PhishPacketSystem) {
  throw new Error("PhishPacketSystem must load before nodenet-app.js");
}
const ParticleSystem = window.NodeNet?.ParticleSystem;
if (!ParticleSystem) {
  throw new Error("ParticleSystem must load before nodenet-app.js");
}
const PingPacketSystem = window.NodeNet?.PingPacketSystem;
if (!PingPacketSystem) {
  throw new Error("PingPacketSystem must load before nodenet-app.js");
}
if (!ImmunityPacketSystem) {
  throw new Error("ImmunityPacketSystem must load before nodenet-app.js");
}
const EventLoggingSystem = window.NodeNet?.EventLoggingSystem;
if (!EventLoggingSystem) {
  throw new Error("EventLoggingSystem must load before nodenet-app.js");
}
const StateManagementSystem = window.NodeNet?.StateManagementSystem;
if (!StateManagementSystem) {
  throw new Error("StateManagementSystem must load before nodenet-app.js");
}
const CameraSystem = window.NodeNet?.CameraSystem;
if (!CameraSystem) {
  throw new Error("CameraSystem must load before nodenet-app.js");
}
const StatsDisplaySystem = window.NodeNet?.StatsDisplaySystem;
if (!StatsDisplaySystem) {
  throw new Error("StatsDisplaySystem must load before nodenet-app.js");
}
const AchievementSystem = window.NodeNet?.AchievementSystem;
if (!AchievementSystem) {
  throw new Error("AchievementSystem must load before nodenet-app.js");
}
const HUDSystem = window.NodeNet?.HUDSystem;
if (!HUDSystem) {
  throw new Error("HUDSystem must load before nodenet-app.js");
}
const ScenarioPresets = window.NodeNet?.ScenarioPresets;
if (!ScenarioPresets) {
  throw new Error("ScenarioPresets must load before nodenet-app.js");
}
const ToolState = window.NodeNet?.ToolState;
if (!ToolState) {
  throw new Error("ToolState must load before nodenet-app.js");
}
const UIInitializers = window.NodeNet?.UIInitializers;
if (!UIInitializers) {
  throw new Error("UIInitializers must load before nodenet-app.js");
}
const ReactionsSystem = window.NodeNet?.ReactionsSystem;
if (!ReactionsSystem) {
  throw new Error("ReactionsSystem must load before nodenet-app.js");
}
const NewsSystem = window.NodeNet?.NewsSystem;
if (!NewsSystem) {
  throw new Error("NewsSystem must load before nodenet-app.js");
}

// Re-export stats object and incrementStat for backward compatibility
const stats = StatsDisplaySystem.stats;
const incrementStat = StatsDisplaySystem.incrementStat;

// Packet Hazard Helpers — configure dependencies (must be after incrementStat)
window.NodeNet.PacketHazardHelpers.configure({
  sinkholeSystem,
  routeHijackerSystem,
  getGlobalDeltaSeconds: () => globalDeltaSeconds,
  incrementStat,
});

// Re-export achievements object for backward compatibility
const Achievements = AchievementSystem;

// Global View State for Dynamic Zooming
const viewState = {
  scale: 1.0,
  targetScale: 1.0,
  offsetX: 0,
  offsetY: 0,
  minScale: 0.1,
  maxScale: 1.5,
  sidePanelWidth: 320,
  isSidePanelOpen: false,
  maxNetworkRadius: 0, // Track the size of the main network
  isAutoZoom: true, // Toggle for auto-scaling
};

const backgroundSystem = new BackgroundSystem(
  {
    active: CONFIG.background?.active || "galaxy",
    galaxy: CONFIG.galaxy,
    mood: CONFIG.mood,
    lava: CONFIG.lava,
    retro: CONFIG.retro,
    aurora: CONFIG.aurora,
    matrix: CONFIG.matrix,
  },
  {
    canvas,
    ctx,
    viewState,
    getNodes: () => nodes,
    getEdges: () => edges,
    onCometImpact: (centralNode, color) => CentralImpactShake.trigger(centralNode, color),
  }
);

let simulationStartTime = Date.now();
let lastFrameTime = Date.now();
// Script-level deltaSeconds mirror so closure-scoped update() methods
// can do frame-rate-independent lerps without requiring a parameter change.
let globalDeltaSeconds = 0.016;
let immunityOrbitAngle = 0; // Shared phase keeps attached packets radially symmetric.

// Simulation speed multipliers (controlled by sliders)
let simSpeedMultiplier = 1.0;
let packetSpeedMultiplier = 1.0;
let attackFreqMultiplier = 1.0;
let healSpeedMultiplier = 1.0;
const DEFAULT_BRANCH_COUNT = CONFIG.network.defaultBranchCount;
let desiredBranchCount = DEFAULT_BRANCH_COUNT;

// Topology / growth controls (controlled by sliders). These are the
// live mutables; CONFIG values above are the defaults.
const DEFAULT_MAX_BRANCH_DEPTH = CONFIG.network.maxBranchDepth;
const DEFAULT_NETWORK_SOFT_CAP = CONFIG.network.populationSoftCap || 200;
let networkSoftCap = DEFAULT_NETWORK_SOFT_CAP;
// Sprout/prune balance: left of center favors pruning, right favors
// sprouting. Multipliers are 1.0 at balanced (slider = 50).
// sproutPruneSliderValue is the raw 0..100 slider position; the
// multipliers below are derived from it by applySproutPruneBalance().
let sproutPruneSliderValue = 50;
let sproutMultiplier = 1.0;
let pruneMultiplier = 1.0;

/**
 * Convert the raw 0..100 slider position into sprout/prune multipliers.
 * At 50 (balanced) both multipliers are 1.0. At 100 sprouting is 2x and
 * pruning is floored at 0.1x. At 0 the inverse. We floor at 0.1 instead
 * of 0 so a "pure" extreme doesn't completely freeze one side of the
 * system (leaves could never spawn or never retract -> dead state).
 * @param {number} value - Slider position in [0, 100].
 */
function applySproutPruneBalance(value) {
  const clamped = Math.max(0, Math.min(100, value));
  sproutPruneSliderValue = clamped;
  const bias = (clamped - 50) / 50; // -1..1
  sproutMultiplier = Math.max(0.1, 1 + bias);
  pruneMultiplier = Math.max(0.1, 1 - bias);
}

/**
 * Produce a human-readable "sprout : prune" label from current
 * multipliers. Used by the slider value display.
 * @returns {string} e.g. "1.4 : 0.6"
 */
function formatSproutPruneLabel() {
  return `${sproutMultiplier.toFixed(1)} : ${pruneMultiplier.toFixed(1)}`;
}
let runtimeLinkMetrics = {
  monitoredLinks: 0,
  avgQualityScore: 0,
  avgLatencyMs: 0,
  avgReliability: 0,
  congestedLinks: 0,
  highBandwidthLinks: 0,
};

EventLoggingSystem.configure({
  getNodes: () => nodes,
  config: CONFIG,
  tickerSystem: TickerSystem,
});

// REACTIONS + NEWS — configure and subscribe to the central event stream so
// every logged event can surface as a floating node reaction and/or satirical
// news headline. Both are decoupled from the systems that emit the events.
ReactionsSystem.configure({
  getNodes: () => nodes,
  config: CONFIG,
});
NewsSystem.configure({
  getNodes: () => nodes,
});
EventLoggingSystem.subscribe(ReactionsSystem.handleEvent);
EventLoggingSystem.subscribe(NewsSystem.handleEvent);

// Stats Display System — configure after stats object is created
StatsDisplaySystem.configure({
  getNodes: () => nodes,
  getEdges: () => edges,
  getDataPackets: () => dataPackets,
  getImmunityPackets: () => immunityPackets,
  getRuntimeLinkMetrics: () => runtimeLinkMetrics,
  getRuntimePerformanceMetrics: () => runtimePerformanceMetrics,
  getPingPacketSystem: () => PingPacketSystem,
  getPingOfDeathSystem: () => PingOfDeathSystem,
  getPhishPacketSystem: () => PhishPacketSystem,
  getDispatchPacketSystem: () => DispatchPacketSystem,
  getGlobalState: () => ({
    totalPackets: totalPackets.length,
    immunityPackets: immunityPackets.length,
    frameCount,
    congestionHotspots,
    avgBandwidth: calculateAverageLinkBandwidth(),
    avgReliability: calculateAverageLinkReliability(),
    activeHotspotBonus,
    // Bridge gating state for stats pane
    bridgeOpen,
    bridgeHealth,
    getBridgeHealth: () => bridgeHealth,
  }),
  getCounters: () => ({
    firewallCount,
    guardianCount,
    vpnCount,
    ddosBlocked,
    totalFirewallBlocks,
    totalGuardianHeals,
    totalVPNActivations,
    totalRogueNodes,
    totalHoneypotsDeployed,
    totalPatchRollouts,
    totalDataBreaches,
    nodesFortified,
    nodesInoculated,
    totalCCLinkedNodes,
    firstPacketArrived,
    firstPacketReinforced,
    totalDispatchedPackets,
    totalRescuedNodes,
  }),
  getNetworkStatus: () => networkStatus,
});

// HUD System — configure dependency getters
HUDSystem.configure({
  getNodes: () => nodes,
  getSimulationStartTime: () => simulationStartTime,
});

// UI Initializers — configure dependency getters
UIInitializers.configure({
  getViewState: () => viewState,
  setSidePanelOpen: (open) => { viewState.isSidePanelOpen = open; },
  setSimSpeedMultiplier: (v) => { simSpeedMultiplier = v; },
  setPacketSpeedMultiplier: (v) => { packetSpeedMultiplier = v; },
  setAttackFreqMultiplier: (v) => { attackFreqMultiplier = v; },
  setHealSpeedMultiplier: (v) => { healSpeedMultiplier = v; },
  setDesiredBranchCount: (v) => { desiredBranchCount = v; },
  setMaxBranchDepth: (v) => { MAX_BRANCH_DEPTH = v; },
  setNetworkSoftCap: (v) => { networkSoftCap = v; },
  applySproutPruneBalance,
  formatSproutPruneLabel,
  getDefaultBranchCount: () => DEFAULT_BRANCH_COUNT,
  getDefaultMaxBranchDepth: () => DEFAULT_MAX_BRANCH_DEPTH,
  getDefaultNetworkSoftCap: () => DEFAULT_NETWORK_SOFT_CAP,
  getBackgroundSystem: () => window.NodeNet?.backgroundSystem,
});

// Scenario Presets — configure dependency getters
ScenarioPresets.configure({
  resetSimulation,
  setDesiredBranchCount: (v) => { desiredBranchCount = v; },
  setAttackFreqMultiplier: (v) => { attackFreqMultiplier = v; },
  setHealSpeedMultiplier: (v) => { healSpeedMultiplier = v; },
  setPacketSpeedMultiplier: (v) => { packetSpeedMultiplier = v; },
  updateSliderUI,
  showStateStatus,
  getNodes: () => nodes,
  infectNode: (node) => ToolState.infectNode(node),
  promoteToGuardian: window.NodeNet.GuardianNodeBehavior.promoteToGuardian,
});

// Node factory (used by ToolState and SatelliteSystem)
const Node = window.NodeNet.Node;

// Tool State — configure dependency getters
const createNode = (id, x, y, parent) => new Node(id, x, y, parent);
ToolState.configure({
  getCanvas: () => canvas,
  getViewState: () => viewState,
  getNodes: () => nodes,
  getEdges: () => edges,
  getEdgesSet: () => edgesSet,
  getColors: () => colors,
  createNode: createNode,
  createPopParticles: (x, y, color) => ParticleSystem.createPopParticles(x, y, color),
  logEvent: logEvent,
  getLogNodeRef: getLogNodeRef,
  updateNodeStatus: window.NodeNet.HealingSystem.updateNodeStatus,
  promoteToGuardian: window.NodeNet.GuardianNodeBehavior.promoteToGuardian,
  convertToGroundStation: SatelliteSystem.convertToGroundStation,
  getPulses: () => pulses,
  setPulses: (val) => { pulses = val; },
});

// Achievement System — configure dependency getters
AchievementSystem.configure({
  getNodes: () => nodes,
  getStats: () => stats,
  computeNetworkHealth: () => HUDSystem.computeNetworkHealth(),
  getSimulationStartTime: () => simulationStartTime,
});

StateManagementSystem.configure({
  getNodes: () => nodes,
  getEdges: () => edges,
  getEdgesSet: () => edgesSet,
  getDataPackets: () => dataPackets,
  getImmunityPackets: () => immunityPackets,
  getStats: () => stats,
  getColors: () => colors,
  getConfig: () => CONFIG,
  getNodeConstructor: () => Node,
  getViewState: () => viewState,
  getSettings() {
    return {
      simSpeedMultiplier,
      packetSpeedMultiplier,
      attackFreqMultiplier,
      healSpeedMultiplier,
      desiredBranchCount,
      maxBranchDepth: MAX_BRANCH_DEPTH,
      networkSoftCap,
      sproutPruneSliderValue,
    };
  },
  setSettings(s) {
    simSpeedMultiplier = s.simSpeedMultiplier ?? 1;
    packetSpeedMultiplier = s.packetSpeedMultiplier ?? 1;
    attackFreqMultiplier = s.attackFreqMultiplier ?? s.attackFrequencyMultiplier ?? 1;
    healSpeedMultiplier = s.healSpeedMultiplier ?? 1;
    desiredBranchCount = s.desiredBranchCount ?? 6;
    MAX_BRANCH_DEPTH = s.maxBranchDepth ?? DEFAULT_MAX_BRANCH_DEPTH;
    networkSoftCap = s.networkSoftCap ?? DEFAULT_NETWORK_SOFT_CAP;
    applySproutPruneBalance(s.sproutPruneSliderValue ?? 50);
    if (s.viewState && typeof s.viewState === "object") {
      Object.assign(viewState, s.viewState);
      if (!Number.isFinite(viewState.scale)) viewState.scale = 1;
      if (!Number.isFinite(viewState.targetScale)) {
        viewState.targetScale = viewState.scale;
      }
    }
  },
  clearSystems() {
    PingPacketSystem.clearPingPackets();
    PingOfDeathSystem.clearPingOfDeathPackets();
    PhishPacketSystem.clearPhishPackets();
    CounterStrikeSystem.clearCounterStrikePackets();
    DispatchPacketSystem.clearDispatchPackets();
    ParticleSystem.clearParticles();
    ParticleSystem.clearHoneycombStreams();
  },
  applySproutPruneBalance,
  formatSproutPruneLabel,
  resetDatacenterTimers() {
    lastDatacenterEvaluationAt = 0;
    lastDatacenterVpnRefreshAt = 0;
  },
});

LinkQualitySystem.configure({
  config: CONFIG,
  getEdges: () => edges,
  countDescendants: window.NodeNet.TreeUtils.countDescendants,
  metrics: runtimeLinkMetrics,
});

CameraSystem.configure({
  getNodes: () => nodes,
  canvas,
  viewState,
});

DataTrafficSystem.configure({
  ctx,
  getEdges: () => edges,
  getEdgesSet: () => edgesSet,
  getDataPackets: () => dataPackets,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  incrementStat,
  applyRouteHijackerToPacket: window.NodeNet.PacketHazardHelpers.applyRouteHijackerToPacket,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  getPointAndPerpOnEdge,
  isNodeInDDOSBranch: window.NodeNet.DDOSSystem.isNodeInDDOSBranch,
  computeEdgeQualitySnapshot: LinkQualitySystem.computeEdgeQualitySnapshot,
  selectPacketProtocol: LinkQualitySystem.selectPacketProtocol,
  getProtocolProfile: LinkQualitySystem.getProtocolProfile,
  clampValue,
});

SatelliteSystem.configure({
  config: CONFIG,
  canvas,
  viewState,
  getNodes: () => nodes,
  getEdges: () => edges,
  createNode,
  getColors: () => colors,
  createPopParticles: ParticleSystem.createPopParticles,
  logEvent: EventLoggingSystem.logEvent,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
  markBranchForRetraction: window.NodeNet.TopologySystem.markBranchForRetraction,
  demoteGuardian: window.NodeNet.GuardianNodeBehavior.demoteGuardian,
  demoteDatacenter: window.NodeNet.DatacenterNodeBehavior.demoteDatacenter,
  nodesHaveClearView,
  hasHealthyPathToCentral: window.NodeNet.TreeUtils.hasHealthyPathToCentral,
});

ImmunityPacketSystem.configure({
  config: CONFIG,
  ctx,
  getNodes: () => nodes,
  getEdges: () => edges,
  getEdgesSet: () => edgesSet,
  getImmunityPackets: () => immunityPackets,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  getGlobalDeltaSeconds: () => globalDeltaSeconds,
  getImmunityOrbitAngle: () => immunityOrbitAngle,
  getCentralImpactShakeOffsetX: () => CentralImpactShake.getOffsetX(),
  getCentralImpactShakeOffsetY: () => CentralImpactShake.getOffsetY(),
  getColors: () => colors,
  incrementStat,
  logEvent: EventLoggingSystem.logEvent,
  getPointAndPerpOnEdge,
  isNodeInDDOSBranch: window.NodeNet.DDOSSystem.isNodeInDDOSBranch,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  getHealSpeedMultiplier: () => healSpeedMultiplier,
});

DispatchPacketSystem.configure({
  ctx,
  getNodes: () => nodes,
  getEdges: () => edges,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  getColors: () => colors,
  buildNodePath: window.NodeNet.TreeUtils.buildNodePath,
  isNodeInDDOSBranch: window.NodeNet.DDOSSystem.isNodeInDDOSBranch,
  getNodeDefenseBonus: window.NodeNet.HealingSystem.getNodeDefenseBonus,
  isGuardianVpnTunnelBetween,
  getPointAndPerpOnEdge,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  incrementStat,
  logEvent: EventLoggingSystem.logEvent,
  createPopParticles: ParticleSystem.createPopParticles,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
});

CounterStrikeSystem.configure({
  ctx,
  getEdges: () => edges,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  isGuardianVpnTunnelBetween,
  getPointAndPerpOnEdge,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  incrementStat,
  logEvent: EventLoggingSystem.logEvent,
  createPopParticles: ParticleSystem.createPopParticles,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
});

PingOfDeathSystem.configure({
  ctx,
  config: CONFIG,
  getNodes: () => nodes,
  getEdges: () => edges,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  getAttackFreqMultiplier: () => attackFreqMultiplier,
  getColors: () => colors,
  isGuardianVpnTunnelBetween,
  getPointAndPerpOnEdge,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  isNodeInDDOSBranch: window.NodeNet.DDOSSystem.isNodeInDDOSBranch,
  updateNodeStatus: window.NodeNet.HealingSystem.updateNodeStatus,
  incrementStat,
  logEvent: EventLoggingSystem.logEvent,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
  createPopParticles: ParticleSystem.createPopParticles,
});

PhishPacketSystem.configure({
  ctx,
  config: CONFIG,
  getNodes: () => nodes,
  getEdges: () => edges,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  getAttackFreqMultiplier: () => attackFreqMultiplier,
  getColors: () => colors,
  counterStrikeSystem: CounterStrikeSystem,
  isGuardianVpnTunnelBetween,
  getPointAndPerpOnEdge,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  isNodeInDDOSBranch: window.NodeNet.DDOSSystem.isNodeInDDOSBranch,
  updateNodeStatus: window.NodeNet.HealingSystem.updateNodeStatus,
  trySpawnGuardian: window.NodeNet.GuardianNodeBehavior.trySpawnGuardian,
  incrementStat,
  logEvent: EventLoggingSystem.logEvent,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
  createPopParticles: ParticleSystem.createPopParticles,
});

ParticleSystem.configure({
  ctx,
  config: CONFIG,
  getNodes: () => nodes,
  getColors: () => colors,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  promoteToGuardian: window.NodeNet.GuardianNodeBehavior.promoteToGuardian,
  logEvent: EventLoggingSystem.logEvent,
  incrementStat,
});

PingPacketSystem.configure({
  ctx,
  getNodes: () => nodes,
  getEdges: () => edges,
  getPacketSpeedMultiplier: () => packetSpeedMultiplier,
  applySinkholeToPacket: window.NodeNet.PacketHazardHelpers.applySinkholeToPacket,
  updateNodeStatus: window.NodeNet.HealingSystem.updateNodeStatus,
  createPopParticles: ParticleSystem.createPopParticles,
  logEvent: EventLoggingSystem.logEvent,
  incrementStat,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
});

// Central Impact Shake — configure dependencies
window.NodeNet.CentralImpactShake.configure({
  ParticleSystem,
});

let runtimePerformanceMetrics = {
  fps: 0,
  frameTimeMs: 0,
  edgeDrawMs: 0,
  datacenterVpnDrawMs: 0,
  datacenterVpnDrawCount: 0,
};
let lastDatacenterEvaluationAt = 0;
let lastDatacenterVpnRefreshAt = 0;


TickerSystem.configure({
  getStatTypes: () => [
    {
      label: "Active Nodes",
      val: nodes.filter((n) => n.state === "alive").length,
    },
    {
      label: "Data Packets",
      val: StatsDisplaySystem.formatStatNumber(stats.totalDataPackets),
    },
    {
      label: "Threats Blocked",
      val: StatsDisplaySystem.formatStatNumber(stats.totalDefenses),
    },
    {
      label: "Network Load",
      val: `${dataPackets.length + immunityPackets.length} pkts`,
    },
    {
      label: "Infection Rate",
      val: `${(
        (nodes.filter(
          (n) => n.status === "malware" || n.status === "botnet"
        ).length /
          Math.max(1, nodes.length)) *
        100
      ).toFixed(1)}%`,
    },
    {
      label: "Uptime",
      val: `${((Date.now() - simulationStartTime) / 1000).toFixed(0)}s`,
    },
  ],
});


const colors = {
  green: { r: 22, g: 163, b: 74 },
  red: { r: 248, g: 113, b: 113 },
  yellow: { r: 250, g: 204, b: 21 },
  malware: { r: 168, g: 85, b: 247 }, // purple-500
  botnet: { r: 220, g: 38, b: 38 }, // red-600 for botnet
  commandControl: { r: 139, g: 0, b: 0 }, // dark red for C&C nodes
  blue: { r: 59, g: 130, b: 246 }, // blue-500 for the central node
  datacenter: { r: 0, g: 224, b: 255 }, // neon blue for datacenter nodes
  gold: { r: 251, g: 191, b: 36 }, // amber-400 for pulses
  groundStation: { r: 96, g: 165, b: 250 }, // sky-400 for ground station towers
  satellite: { r: 147, g: 197, b: 253 }, // lighter sky blue for satellites
  line: { r: 209, g: 213, b: 219 }, // Light Gray (gray-300)
  white: { r: 255, g: 255, b: 255 }, // white for immunity packets
  neonGreen: { r: 57, g: 255, b: 20 }, // neon green for firewall nodes
  honeypot: { r: 255, g: 193, b: 7 }, // golden amber for honeypot nodes
};

// Node Behavior Registry — wire shared dependencies (must be after colors definition)
const NodeBehaviorRegistry = window.NodeNet?.NodeBehaviorRegistry;
if (NodeBehaviorRegistry) {
  NodeBehaviorRegistry.configure({
    ctx,
    colors,
    CONFIG,
    canvas,
    getNodes: () => nodes,
    getCentralImpactShakeOffsetX: () => CentralImpactShake.getOffsetX(),
    getCentralImpactShakeOffsetY: () => CentralImpactShake.getOffsetY(),
    getHealSpeedMultiplier: () => healSpeedMultiplier,
  });
}

WebCrawler.configure({
  getNodes: () => nodes,
  getEdges: () => edges,
  logEvent: EventLoggingSystem.logEvent,
  getLogNodeRef: EventLoggingSystem.getLogNodeRef,
  incrementStat,
  createPopParticles: ParticleSystem.createPopParticles,
  getColors: () => colors,
});

let MAX_BRANCH_DEPTH = DEFAULT_MAX_BRANCH_DEPTH;

const STATUS_LOG_KEYS = {
  green: "statusRecovered",
  yellow: "statusImpacted",
  red: "statusDown",
  malware: "statusMalware",
  botnet: "statusBotnet",
  blue: "statusBlue",
};

// Healing System — configure dependencies
const HealingSystem = window.NodeNet?.HealingSystem;
if (HealingSystem) {
  HealingSystem.configure({
    getNodes: () => nodes,
    getEdges: () => edges,
    canvas,
    getHealSpeedMultiplier: () => healSpeedMultiplier,
    logEvent: EventLoggingSystem.logEvent,
    incrementStat,
    redistributeImmunityPackets: ImmunityPacketSystem.redistributeImmunityPackets,
    demoteGuardian: window.NodeNet.GuardianNodeBehavior.demoteGuardian,
    demoteDatacenter: window.NodeNet.DatacenterNodeBehavior.demoteDatacenter,
    hasWirelessPathToHealthyBranch: SatelliteSystem.hasWirelessPathToHealthyBranch,
    isDescendant: window.NodeNet.TreeUtils.isDescendant,
    getNodeDepth: window.NodeNet.TreeUtils.getNodeDepth,
    getMaxBranchDepth: () => MAX_BRANCH_DEPTH,
    STATUS_LOG_KEYS,
  });
}

// Infection System — configure dependencies
const InfectionSystem = window.NodeNet?.InfectionSystem;
if (InfectionSystem) {
  InfectionSystem.configure({
    getNodes: () => nodes,
    getEdges: () => edges,
    getAttackFreqMultiplier: () => attackFreqMultiplier,
    logEvent: EventLoggingSystem.logEvent,
    incrementStat,
    getLogNodeRef: EventLoggingSystem.getLogNodeRef,
    countDescendants: window.NodeNet.TreeUtils.countDescendants,
    botnetMeshHasClearPath,
    getRootBranch: window.NodeNet.TreeUtils.getRootBranch,
    getPulses: () => pulses,
    updateNodeStatus: window.NodeNet.HealingSystem.updateNodeStatus,
  });
}

// DDOS System — configure dependencies
const DDOSSystem = window.NodeNet?.DDOSSystem;
if (DDOSSystem) {
  DDOSSystem.configure({
    getNodes: () => nodes,
    getEdges: () => edges,
    getAttackFreqMultiplier: () => attackFreqMultiplier,
    logEvent: EventLoggingSystem.logEvent,
    incrementStat,
    getLogNodeRef: EventLoggingSystem.getLogNodeRef,
    countDescendants: window.NodeNet.TreeUtils.countDescendants,
  });
}

// Physics System — configure dependencies
const PhysicsSystem = window.NodeNet?.PhysicsSystem;
if (PhysicsSystem) {
  PhysicsSystem.configure({
    getNodes: () => nodes,
    getEdges: () => edges,
    getDraggedNode: () => draggedNode,
    canvas,
    padding,
  });
}

// Topology System — configure dependencies
const TopologySystem = window.NodeNet?.TopologySystem;
if (TopologySystem) {
  TopologySystem.configure({
    getNodes: () => nodes,
    getEdges: () => edges,
    getPulses: () => pulses,
    setPulses: (v) => { pulses = v; },
    canvas,
    padding,
    createNode: (id, x, y, parent) => new Node(id, x, y, parent),
    desiredBranchCount,
    getMaxBranchDepth: () => MAX_BRANCH_DEPTH,
    getNetworkSoftCap: () => networkSoftCap,
    getSproutMultiplier: () => sproutMultiplier,
    getPruneMultiplier: () => pruneMultiplier,
    getHealSpeedMultiplier: () => healSpeedMultiplier,
    isPaused: () => isPaused,
    lastCrossingCheckRef: { get value() { return lastCrossingCheck; }, set value(v) { lastCrossingCheck = v; } },
    logEvent: EventLoggingSystem.logEvent,
    incrementStat,
    getLogNodeRef: EventLoggingSystem.getLogNodeRef,
    countDescendants: window.NodeNet.TreeUtils.countDescendants,
    getNodeDepth: window.NodeNet.TreeUtils.getNodeDepth,
    clearDepthCache: window.NodeNet.TreeUtils.clearDepthCache,
    isDescendant: window.NodeNet.TreeUtils.isDescendant,
    getRootBranch: window.NodeNet.TreeUtils.getRootBranch,
    getNodeBandwidthGrowthScore: LinkQualitySystem.getNodeBandwidthGrowthScore,
    chooseBandwidthWeightedNode: LinkQualitySystem.chooseBandwidthWeightedNode,
    clampValue,
    linesIntersect,
    segmentsIntersect,
    pointToLineDistance: TopologySystem.pointToLineDistance,
    segmentCrossesExistingEdges: TopologySystem.segmentCrossesExistingEdges,
    nudgeEndpointToAvoidCrossing: TopologySystem.nudgeEndpointToAvoidCrossing,
      });
}

// Tree Utilities — configure dependencies
window.NodeNet.TreeUtils.configure({
  getCentralNode: () => nodes[0],
});

// Graph Builder — configure dependencies
window.NodeNet.GraphBuilder.configure({
  canvas,
  colors,
  nodes,
  edges,
  pulses,
  dataPackets,
  immunityPackets,
  ParticleSystem,
  PingPacketSystem,
  PingOfDeathSystem,
  PhishPacketSystem,
  CounterStrikeSystem,
  DispatchPacketSystem,
  TopologySystem,
  createNode: (id, x, y, parent) => new Node(id, x, y, parent),
  desiredBranchCount,
  onSimulationStart: () => { simulationStartTime = Date.now(); },
});

// Legacy constant aliases referencing CONFIG (for backward compatibility)
// NOTE: MAX_BRANCH_DEPTH is mutable (controlled by the Branch Depth
// slider). All downstream code reads it as an ordinary variable, so
// changing `const` -> `let` here is sufficient to make it live-tunable.
const SATELLITE_DRIFT_FADE_RATE = CONFIG.satellite.driftFadeRate;
const SATELLITE_DRIFT_SPEED_MIN = CONFIG.satellite.driftSpeedMin;
const SATELLITE_DRIFT_SPEED_MAX = CONFIG.satellite.driftSpeedMax;
const SATELLITE_DRIFT_GRAVITY = CONFIG.satellite.driftGravity;
const OFFSCREEN_MARGIN = CONFIG.network.offscreenMargin;
const SATELLITE_ORBIT_RADIUS_MIN = CONFIG.satellite.orbitRadiusMin;
const SATELLITE_ORBIT_RADIUS_MAX = CONFIG.satellite.orbitRadiusMax;
const ORBITAL_SPEED_BASE = CONFIG.satellite.orbitalSpeedBase;
const ORBITAL_SPEED_VARIANCE = CONFIG.satellite.orbitalSpeedVariance;
const ORBITAL_SMOOTHING = CONFIG.satellite.orbitalSmoothing;
const SATELLITE_LAUNCH_DURATION = CONFIG.satellite.launchDuration;
const SATELLITE_SPACING_MIN = CONFIG.satellite.spacingMin;
const SATELLITE_UNLINKED_TIMEOUT = CONFIG.satellite.unlinkedTimeout;
const SATELLITE_MAX_LIFESPAN = CONFIG.satellite.maxLifespan;
const WIRELESS_LINK_MAX_DISTANCE_RATIO = CONFIG.wireless.maxDistanceRatio;
const GROUND_STATION_SPROUT_CHANCE = CONFIG.groundStation.sproutChance;
const GROUND_STATION_LAUNCH_INTERVAL = CONFIG.groundStation.launchInterval;
const GROUND_STATION_MAX_LIFESPAN = CONFIG.groundStation.maxLifespan;

// ============================================================================
// STATE MANAGEMENT WRAPPERS — thin delegators to StateManagementSystem
// ============================================================================
function updateSliderUI() {
  return StateManagementSystem.updateSliderUI();
}

function showStateStatus(message, isError = false) {
  return StateManagementSystem.showStateStatus(message, isError);
}

function saveStateToStorage() {
  return StateManagementSystem.saveStateToStorage();
}

function loadStateFromStorage() {
  return StateManagementSystem.loadStateFromStorage();
}

function exportStateToFile() {
  return StateManagementSystem.exportStateToFile();
}

function importStateFromFile(file) {
  return StateManagementSystem.importStateFromFile(file);
}

function initializeStateManagement() {
  return StateManagementSystem.initializeStateManagement();
}


/**
 * Reset simulation to initial state
 */
function resetSimulation() {
  nodes.length = 0;
  edges.length = 0;
  edgesSet.clear();
  dataPackets.length = 0;
  immunityPackets.length = 0;
  PingPacketSystem.clearPingPackets();
  PingOfDeathSystem.clearPingOfDeathPackets();
  PhishPacketSystem.clearPhishPackets();
  CounterStrikeSystem.clearCounterStrikePackets();
  DispatchPacketSystem.clearDispatchPackets();
  ParticleSystem.clearParticles();
  ParticleSystem.clearHoneycombStreams();

  // Reset stats
  Object.keys(stats).forEach(key => { stats[key] = 0; });

  // Recreate network
  window.NodeNet.GraphBuilder.createGraph();
}


// Canvas click handler — applies the active tool to the clicked node
canvas.addEventListener("click", (e) => {
  if (!ToolState.getActiveTool() || ToolState.getActiveTool() === "drag") return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const clickedNode = ToolState.getNodeAtPosition(x, y);
  if (clickedNode) {
    ToolState.applyTool(clickedNode);
  }
});

// Drag Tool Event Listeners
canvas.addEventListener("mousedown", (e) => {
  if (ToolState.getActiveTool() !== "drag") return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const clickedNode = ToolState.getNodeAtPosition(x, y);
  if (clickedNode) {
    isDragging = true;
    draggedNode = clickedNode;
    // Reset velocity to prevent fighting
    draggedNode.vx = 0;
    draggedNode.vy = 0;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging || !draggedNode) return;

  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // Convert screen coordinates to world coordinates
  const panelOffset = viewState.isSidePanelOpen
    ? viewState.sidePanelWidth
    : 0;
  const visualCx = (canvas.width - panelOffset) / 2;
  const visualCy = canvas.height / 2;
  const worldCx = canvas.width / 2;
  const worldCy = canvas.height / 2;

  const worldX = (screenX - visualCx) / viewState.scale + worldCx - viewState.offsetX;
  const worldY = (screenY - visualCy) / viewState.scale + worldCy - viewState.offsetY;

  // Update node position
  draggedNode.x = worldX;
  draggedNode.y = worldY;
  // Also update baseX/baseY to make the change "stick" better against some physics
  draggedNode.baseX = worldX;
  draggedNode.baseY = worldY;

  // Zero out velocity while dragging
  draggedNode.vx = 0;
  draggedNode.vy = 0;
});

canvas.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    draggedNode = null;
  }
});

canvas.addEventListener("mouseleave", () => {
  if (isDragging) {
    isDragging = false;
    draggedNode = null;
  }
  if (isPanning) {
    isPanning = false;
  }
});

// FREECAM PANNING - Middle mouse or right mouse drag on background
canvas.addEventListener("mousedown", (e) => {
  // Middle mouse (button 1) or right mouse (button 2) for panning
  if (e.button !== 1 && e.button !== 2) return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Only start panning if NOT clicking on a node
  const clickedNode = ToolState.getNodeAtPosition(x, y);
  if (!clickedNode) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    lastPanOffsetX = viewState.offsetX;
    lastPanOffsetY = viewState.offsetY;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  e.preventDefault();

  // Calculate delta in screen pixels, then convert to world units
  const deltaX = e.clientX - panStartX;
  const deltaY = e.clientY - panStartY;

  // Convert screen delta to world delta (divide by scale) - INVERTED for natural feel
  viewState.offsetX = lastPanOffsetX + deltaX / viewState.scale;
  viewState.offsetY = lastPanOffsetY + deltaY / viewState.scale;
});

canvas.addEventListener("mouseup", (e) => {
  if (isPanning && (e.button === 1 || e.button === 2)) {
    // Check if this was a click (minimal movement) vs a drag
    const deltaX = Math.abs(e.clientX - panStartX);
    const deltaY = Math.abs(e.clientY - panStartY);
    const clickThreshold = 5; // pixels

    // Middle mouse click without drag = recenter view
    if (e.button === 1 && deltaX < clickThreshold && deltaY < clickThreshold) {
      viewState.offsetX = 0;
      viewState.offsetY = 0;
    }

    isPanning = false;
  }
});

// Prevent context menu on right-click for panning
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});


// --- Canvas and Node Setup ---
function resizeCanvas() {
  const previousCenterX = canvas.width / 2;
  const previousCenterY = canvas.height / 2;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const dx = canvas.width / 2 - previousCenterX;
  const dy = canvas.height / 2 - previousCenterY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;

  nodes.forEach((node) => {
    node.x += dx;
    node.y += dy;
    if (Number.isFinite(node.baseX)) node.baseX += dx;
    if (Number.isFinite(node.baseY)) node.baseY += dy;
    if (Number.isFinite(node.targetX)) node.targetX += dx;
    if (Number.isFinite(node.targetY)) node.targetY += dy;
  });
}

function runDatacenterSystems(now = Date.now()) {
  if (now - lastDatacenterEvaluationAt >= CONFIG.datacenter.reevaluateIntervalMs) {
    window.NodeNet.DatacenterNodeBehavior.evaluateDatacenterClusters(now);
    lastDatacenterEvaluationAt = now;
    
    // Try to spawn honeypots near datacenters during evaluation
    window.NodeNet.HoneypotSystem.spawnHoneypotsNearDatacenters();
  }

  if (now - lastDatacenterVpnRefreshAt >= CONFIG.datacenter.vpnRefreshIntervalMs) {
    window.NodeNet.DatacenterNodeBehavior.updateDatacenterVpnMesh(now);
    lastDatacenterVpnRefreshAt = now;
  }

  window.NodeNet.DatacenterNodeBehavior.fortifyUpstreamFromDatacenters(now);
}

// Satellite / ground-station lifecycle (sprout, launch, orbit, despawn, wireless
// bridging) lives in systems/wireless/satellite-system.js.

// Tick counter used to throttle expensive subsystems (mesh maintenance,
// crossing resolution) to every Nth tick instead of every tick.
let _simTickCounter = 0;

/**
 * Simulation tick — the 500ms logic heartbeat (separate from the per-frame
 * render loop). Drives central self-heal, random red/malware events, healing,
 * sprouting, satellites/ground stations, infection + botnet formation,
 * datacenter clustering, and throttled O(N^2) mesh/crossing maintenance.
 * @tags simulation-tick, heartbeat, healing, infection, botnet, sprout, throttle
 */
function simulateNetworkEvents() {
  if (isPaused) return; // Skip simulation when paused
  // Edit D1: invalidate the per-tick depth cache so this tick sees a
  // fresh view of the parent chain (in case nodes were reparented).
  window.NodeNet.TreeUtils.clearDepthCache();
  _simTickCounter++;
  const rootNode = nodes[0];
  if (rootNode) {
    const SELF_HEAL_DELAY = 5000 / healSpeedMultiplier;
    if (
      (rootNode.status === "malware" ||
        rootNode.status === "botnet" ||
        rootNode.status === "commandControl") &&
      !rootNode.isSelfHealing
    ) {
      if (Date.now() > rootNode.statusChangedAt + SELF_HEAL_DELAY) {
        rootNode.isSelfHealing = true;
        rootNode.selfHealingStartTime = Date.now();
        const directChildren = (rootNode.children || []).filter(
          (ch) => ch && ch.state === "alive"
        );
        rootNode.selfHealingPacketCap = directChildren.length * 4 * 2; // double the normal per-branch spawn
        rootNode.selfHealingPacketsCreated = 0;
        rootNode.selfHealingDispatchAllowance = 0;
        logEvent("centralSelfHealingStarted");
      }
    }
  }

  const aliveNodes = nodes.filter(
    (n) => n.state === "alive" && n.parent !== null && !n.isSatellite
  );
  if (aliveNodes.length === 0) return;

  const RED_NODE_TIMEOUT = 10000 / healSpeedMultiplier;
  aliveNodes
    .filter((n) => n.status === "red")
    .forEach((node) => {
      // Allow all red nodes to heal after timeout to prevent deadlocks
      if (Date.now() > node.statusChangedAt + RED_NODE_TIMEOUT) {
        // Default: 10% chance to become malware, 90% chance to heal to green
        // If hit by ping of death: 50% chance to become malware!
        let malwareChance = 0.1;
        const recoveredFromPing = node.hitByPingOfDeath === true;
        if (recoveredFromPing) {
          malwareChance = 0.5; // Significantly higher chance
          node.hitByPingOfDeath = false; // Clear the flag
        }
        const newStatus =
          Math.random() < malwareChance ? "malware" : "green";
        HealingSystem.updateNodeStatus(node, newStatus);

        // Chance to promote recovered nodes to guardians if they endured a ping of death
        if (
          newStatus === "green" &&
          recoveredFromPing &&
          Math.random() < 0.25
        ) {
          window.NodeNet.GuardianNodeBehavior.promoteToGuardian(node, "guardianPromotionPingRecovery");
        }
      }
    });

  if (Math.random() < 0.3 * attackFreqMultiplier) {
    // Red node frequency
    const target =
      aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
    // Grace period: newly sprouted nodes can't go down for 5 seconds
    const nodeAge = Date.now() - target.createdAt;
    const GRACE_PERIOD = 5000; // 5 seconds
    if (target.status === "green" && nodeAge >= GRACE_PERIOD) {
      HealingSystem.updateNodeStatus(target, "red");
    }
  }
  if (Math.random() < 0.02 * attackFreqMultiplier) {
    // Malware infection rate (reduced from 5% to 2%)
    const target =
      aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
    if (
      target.status === "green" &&
      !target.isTargeted &&
      target.remediationState === "none"
    ) {
      HealingSystem.updateNodeStatus(target, "malware");
    }
  }

  HealingSystem.healNetwork();
  TopologySystem.spontaneouslySprout();
  window.NodeNet.HoneypotSystem.tryRandomHoneypotSpawn();
  SatelliteSystem.sproutGroundStationFromHealthyNode();
  SatelliteSystem.checkSatelliteLifespans(); // Despawn satellites after 2 minutes
  SatelliteSystem.checkGroundStationLifespans(); // Revert ground stations after 2 minutes
  SatelliteSystem.groundStationsLaunchSatellites();
  SatelliteSystem.updateSatelliteWirelessLinks(); // Dynamic wireless bridging (includes ground station bridges)
  HealingSystem.adoptRedNodes();
  InfectionSystem.spreadMalware();
  InfectionSystem.detectAndFormBotnets();
  runDatacenterSystems(Date.now());
  ImmunityPacketSystem.evaluateBotDefenseMode();

  // Edit D2: throttle expensive O(N^2) subsystems so they run every
  // 4th tick (~2s instead of every 500ms). Mesh edges and edge
  // crossings change slowly enough that running these less often is
  // visually indistinguishable, but it noticeably reduces per-tick
  // CPU at high node counts.
  if (_simTickCounter % 4 === 0) {
    window.NodeNet.InfectionSystem.cleanupBotnetMeshEdges(); // Remove mesh edges crossing healthy branches
    InfectionSystem.optimizeBotnetMesh();
    TopologySystem.resolveCrossings();
  }
}

function logEvent(key, context) {
  return EventLoggingSystem.logEvent(key, context);
}

function getLogNodeRef(node) {
  return EventLoggingSystem.getLogNodeRef(node);
}


// Node Class — configure runtime dependencies
const NodeClass = window.NodeNet.NodeClass;
NodeClass.configure({
  ctx,
  canvas,
  colors,
  CONFIG,
  padding,
  healSpeedMultiplier,
  getNodes: () => nodes,
  getEdges: () => edges,
  getPulses: () => pulses,
  getDraggedNode: () => draggedNode,
  HealingSystem,
  SatelliteSystem,
  ParticleSystem,
  NodeBehaviorRegistry: window.NodeNet.NodeBehaviorRegistry,
  PhysicsSystem,
  countDescendants: window.NodeNet.TreeUtils.countDescendants,
  logEvent,
  getLogNodeRef,
  getNodeDefenseBonus: window.NodeNet.HealingSystem.getNodeDefenseBonus,
  incrementStat,
  spawnCentralImmunityPackets: ImmunityPacketSystem.spawnCentralImmunityPackets,
  getCentralImpactShakeOffsetX: () => window.NodeNet.CentralImpactShake.getOffsetX(),
  getCentralImpactShakeOffsetY: () => window.NodeNet.CentralImpactShake.getOffsetY(),
});

// Guardian Node Behavior — configure dependencies
window.NodeNet.GuardianNodeBehavior.configure({
  nodes,
  edges,
  healSpeedMultiplier,
  nodesHaveClearView,
  ParticleSystem,
  colors,
  logEvent,
});

// Datacenter Node Behavior — configure dependencies
window.NodeNet.DatacenterNodeBehavior.configure({
  nodes,
  edges,
  CONFIG,
  clampValue,
  nodesHaveClearView,
  getEdgeBetweenNodes,
  LinkQualitySystem,
  logEvent,
  healSpeedMultiplier,
  colors,
  countDescendants: window.NodeNet.TreeUtils.countDescendants,
  ParticleSystem,
});

// Honeypot System — configure dependencies
window.NodeNet.HoneypotSystem.configure({
  nodes,
  CONFIG,
  colors,
  ParticleSystem,
  logEvent,
});

function initializeLogFilters() {
  return EventLoggingSystem.initializeLogFilters();
}

function applyLogFilters() {
  return EventLoggingSystem.applyLogFilters();
}


/**
 * Main render/update loop — one pass per animation frame via requestAnimationFrame.
 * Computes frame delta, applies the zoom/pan camera transform, then draws layers
 * in order: background → storms/hazards → edges (wireless, DDOS, infection, VPN,
 * healthy-flow variants) → packets → nodes → central node → HUD. When paused it
 * renders current state without advancing simulation, then reaps faded nodes/edges
 * in-place and updates performance metrics.
 * @tags render-loop, animate, requestAnimationFrame, draw, camera, culling, edges, packets, performance
 */
function animate() {
  requestAnimationFrame(animate);

  const now = Date.now();
  const frameDeltaSeconds =
    Math.min(0.05, (now - lastFrameTime) / 1000) || 0.016;
  lastFrameTime = now;
  globalDeltaSeconds = isPaused ? 0 : frameDeltaSeconds;
  immunityOrbitAngle =
    (immunityOrbitAngle + globalDeltaSeconds * 0.6) % (Math.PI * 2);
  const frameStartPerf = performance.now();
  const GUARDIAN_FIREWALL_ATTEMPT_DURATION = 2000 / healSpeedMultiplier;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Always update ticker and news even when paused
  TickerSystem.update();
  NewsSystem.update();

  // When paused, only render current state without updates
  if (isPaused) {
    updateCamera();
    backgroundSystem.draw(now, 0);
    CentralImpactShake.update(0);

    const panelOffset = viewState.isSidePanelOpen
      ? viewState.sidePanelWidth
      : 0;
    const visualCx = (canvas.width - panelOffset) / 2;
    const visualCy = canvas.height / 2;
    const worldCx = canvas.width / 2;
    const worldCy = canvas.height / 2;

    ctx.save();
    ctx.translate(visualCx, visualCy);
    ctx.scale(viewState.scale, viewState.scale);
    ctx.translate(viewState.offsetX, viewState.offsetY);
    ctx.translate(-worldCx, -worldCy);

    NetworkStorms.draw(ctx, now, 0);

    if (routeHijackerSystem) {
      routeHijackerSystem.draw(ctx, now);
    }
    if (sinkholeSystem) {
      sinkholeSystem.draw(ctx, now);
    }

    edges.forEach((edge) => {
      const fromNode = edge.from;
      const toNode = edge.to;
      if (!fromNode || !toNode) return;

      const edgeOpacity = Math.min(fromNode.opacity, toNode.opacity);
      if (edgeOpacity <= 0) return;

      const edgeWidth = LinkQualitySystem.getEdgeRenderWidth(edge, now);

      if (edge.isWirelessLink) {
        const dist = Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y);
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);

        const screenDiagonal = Math.sqrt(
          canvas.width * canvas.width + canvas.height * canvas.height
        );
        const maxDist = screenDiagonal * CONFIG.wireless.maxDistanceRatio;

        // Calculate signal strength (1.0 at distance 0, drops to 0 at maxDist)
        // We use a smoother falloff curve than linear
        const signalStrength = Math.max(0, 1 - Math.pow(dist / maxDist, 1.5));
        const signalOpacity = edgeOpacity * signalStrength;

        // Hide completely if signal is dead
        if (signalOpacity <= 0.05) return;

        ctx.save();
        ctx.translate(fromNode.x, fromNode.y);
        ctx.rotate(angle);

        const fromIsSatellite = fromNode.isSatellite;
        const toIsSatellite = toNode.isSatellite;
        const fromIsGroundStation = fromNode.isGroundStation;
        const toIsGroundStation = toNode.isGroundStation;
        const isSatelliteMesh = fromIsSatellite && toIsSatellite;
        const isUplink =
          (fromIsSatellite && toIsGroundStation) ||
          (toIsSatellite && fromIsGroundStation) ||
          edge.isGroundStationBridge;

        let waveColor1, waveColor2, amplitude;
        if (isSatelliteMesh) {
          waveColor1 = `rgba(0, 255, 255, ${0.6 * signalOpacity})`;
          waveColor2 = `rgba(0, 200, 200, ${0.4 * signalOpacity})`;
          amplitude = Math.max(3, edgeWidth * 1.5);
        } else if (isUplink) {
          waveColor1 = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.6 * signalOpacity})`;
          waveColor2 = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${0.4 * signalOpacity})`;
          amplitude = Math.max(5, edgeWidth * 2.5);
        } else {
          waveColor1 = `rgba(200, 200, 200, ${0.5 * signalOpacity})`;
          waveColor2 = `rgba(150, 150, 150, ${0.3 * signalOpacity})`;
          amplitude = Math.max(4, edgeWidth * 2);
        }

        const frequency = 0.035;
        const staticPhase = -(edge.pulseSeed || 0);

        ctx.setLineDash([2, 4]);
        ctx.globalCompositeOperation = "lighter";

        ctx.beginPath();
        for (let i = 0; i <= dist; i += 3) {
          const dampen = Math.sin((i / dist) * Math.PI);
          const y = Math.sin(i * frequency + staticPhase) * amplitude * dampen;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.strokeStyle = waveColor1;
        ctx.lineWidth = Math.max(1.5, edgeWidth * 0.8);
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= dist; i += 3) {
          const dampen = Math.sin((i / dist) * Math.PI);
          const y = Math.sin(i * frequency + staticPhase + Math.PI) * amplitude * dampen;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.strokeStyle = waveColor2;
        ctx.lineWidth = Math.max(1, edgeWidth * 0.5);
        ctx.stroke();

        ctx.restore();
        return;
      }

      ctx.setLineDash([]);
      ctx.lineWidth = edgeWidth;
      if (edge.isDatacenterVpnTunnel) {
        ctx.strokeStyle = `rgba(${colors.datacenter.r}, ${colors.datacenter.g}, ${colors.datacenter.b}, ${0.72 * edgeOpacity})`;
        ctx.lineWidth = Math.max(1.8, edgeWidth * 0.92);
      } else {
        ctx.strokeStyle = `rgba(${colors.line.r}, ${colors.line.g}, ${colors.line.b}, ${0.35 * edgeOpacity})`;
      }

      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      if (edge.isGuardianVpnTunnel) {
        const control = getGuardianVpnTunnelControlPoint(fromNode, toNode);
        ctx.quadraticCurveTo(control.x, control.y, toNode.x, toNode.y);
      } else if (edge.isDatacenterVpnTunnel) {
        const control = getDatacenterVpnTunnelControlPoint(
          fromNode,
          toNode,
          edge
        );
        ctx.quadraticCurveTo(control.x, control.y, toNode.x, toNode.y);
      } else {
        ctx.lineTo(toNode.x, toNode.y);
      }
      ctx.stroke();
    });

    nodes.forEach((node) => {
      if (node.state === "alive") node.draw();
    });

    // Keep reactions visible (frozen) while paused.
    ReactionsSystem.draw(ctx);

    ctx.restore();
    return;
  }

  gradientOffset = (gradientOffset + globalDeltaSeconds * 0.3) % 1;

  // Performance: Pre-calculate common animation values once per frame
  const animValues = {
    pulse005: Math.sin(now * 0.005),
    pulse008: Math.sin(now * 0.008),
    pulse01: Math.sin(now * 0.01),
    pulse02: Math.sin(now * 0.02),
    pulse001: Math.sin(now * 0.001),
    nowMod10: (now * 0.02) % 10,
    nowMod9: (now * 0.00125) % 9,
  };

  // Performance: Viewport culling helper (with generous margin for large nodes/effects)
  const viewportMargin = 100;
  let cullLeft = -Infinity;
  let cullRight = Infinity;
  let cullTop = -Infinity;
  let cullBottom = Infinity;
  const isInViewport = (x, y, radius = 0) => {
    return (
      x + radius > cullLeft &&
      x - radius < cullRight &&
      y + radius > cullTop &&
      y - radius < cullBottom
    );
  };

  const overscan = Math.max(
    60,
    Math.min(canvas.width, canvas.height) * 0.05
  );
  // Physics: per-node forces applied inside node.update() via applyPerNodeForces
  window.NodeNet.GuardianNodeBehavior.updateGuardianVpnTunnels();

  // NEW: Update Camera Zoom
  updateCamera();

  backgroundSystem.draw(now, globalDeltaSeconds);
  CentralImpactShake.update(globalDeltaSeconds);

  const deltaSeconds = globalDeltaSeconds;

  NetworkStorms.update(now, nodes);
  WebCrawler.update(now, deltaSeconds);
  if (routeHijackerSystem) {
    routeHijackerSystem.update({ canvas, edges, now, deltaSeconds });
  }
  if (sinkholeSystem) {
    sinkholeSystem.update({ canvas, nodes, now, deltaSeconds });
  }

  // Apply Camera Transform
  const panelOffset = viewState.isSidePanelOpen
    ? viewState.sidePanelWidth
    : 0;
  const visualCx = (canvas.width - panelOffset) / 2;
  const visualCy = canvas.height / 2;
  const worldCx = canvas.width / 2;
  const worldCy = canvas.height / 2;

  const screenLeft = -viewportMargin;
  const screenTop = -viewportMargin;
  const screenRight = canvas.width - panelOffset + viewportMargin;
  const screenBottom = canvas.height + viewportMargin;

  cullLeft = (screenLeft - visualCx) / viewState.scale + worldCx - viewState.offsetX;
  cullRight = (screenRight - visualCx) / viewState.scale + worldCx - viewState.offsetX;
  cullTop = (screenTop - visualCy) / viewState.scale + worldCy - viewState.offsetY;
  cullBottom = (screenBottom - visualCy) / viewState.scale + worldCy - viewState.offsetY;

  ctx.save();
  ctx.translate(visualCx, visualCy);
  ctx.scale(viewState.scale, viewState.scale);
  ctx.translate(viewState.offsetX, viewState.offsetY);
  ctx.translate(-worldCx, -worldCy);

  NetworkStorms.draw(ctx, now, deltaSeconds);

  if (routeHijackerSystem) {
    routeHijackerSystem.draw(ctx, now);
  }
  if (sinkholeSystem) {
    sinkholeSystem.draw(ctx, now);
  }

  const edgeDrawStartPerf = performance.now();
  let datacenterVpnDrawMsAccum = 0;
  let datacenterVpnDrawCount = 0;

  edges.forEach((edge) => {
    const fromNode = edge.from,
      toNode = edge.to;
    if (!fromNode || !toNode) return;

    const edgeOpacity = Math.min(fromNode.opacity, toNode.opacity);
    if (edgeOpacity <= 0) return;

    // Performance: viewport culling — skip drawing edges whose both endpoints
    // are off-screen (cull bounds are computed zoom-aware above).
    if (
      !isInViewport(fromNode.x, fromNode.y, fromNode.radius + 50) &&
      !isInViewport(toNode.x, toNode.y, toNode.radius + 50)
    ) {
      return;
    }

    let datacenterVpnPerfStart = 0;
    if (edge.isDatacenterVpnTunnel) {
      datacenterVpnDrawCount += 1;
      datacenterVpnPerfStart = performance.now();
    }

    const edgeRenderWidth = LinkQualitySystem.getEdgeRenderWidth(edge, now);
    let flowVisualState = null;
    // Tracks whether this edge is the "normal/healthy" green link so we
    // can apply a soft halo pre-stroke to it (and only it) below.
    let isNormalHealthyEdge = false;
    ctx.lineWidth = edgeRenderWidth;

    const forwardInfection = fromNode.spreadingInfections?.find(
      (i) => i.target === toNode
    );
    const backwardInfection = toNode.spreadingInfections?.find(
      (i) => i.target === fromNode
    );

    // Performance: Check if this edge is part of an active DDOS attack path
    // Use edge property to cache DDOS state instead of searching all nodes
    let ddosAttackOnEdge = edge.ddosAttackData || null;

    if (edge.isWirelessLink) {
      const fromIsSatellite = fromNode.isSatellite;
      const toIsSatellite = toNode.isSatellite;
      const fromIsGroundStation = fromNode.isGroundStation;
      const toIsGroundStation = toNode.isGroundStation;
      const isSatelliteMesh = fromIsSatellite && toIsSatellite;
      const isUplink =
        (fromIsSatellite && toIsGroundStation) ||
        (toIsSatellite && fromIsGroundStation) ||
        edge.isGroundStationBridge;

      const seed = edge.pulseSeed || 0;
      const dist = Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y);
      const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);

      const screenDiagonal = Math.sqrt(
        canvas.width * canvas.width + canvas.height * canvas.height
      );
      const maxDist = screenDiagonal * CONFIG.wireless.maxDistanceRatio;

      // Calculate signal strength for un-paused mode
      const signalStrength = Math.max(0, 1 - Math.pow(dist / maxDist, 1.5));
      const signalOpacity = edgeOpacity * signalStrength;

      // Hide completely if signal is dead
      if (signalOpacity <= 0.05) return;

      ctx.save();
      ctx.translate(fromNode.x, fromNode.y);
      ctx.rotate(angle);

      let baseColor, waveColor1, waveColor2, glowColor, amplitude, speed;

      if (isSatelliteMesh) {
        baseColor = `rgba(0, 255, 255, ${0.15 * signalOpacity})`;
        waveColor1 = `rgba(0, 255, 255, ${0.7 * signalOpacity})`;
        waveColor2 = `rgba(0, 200, 200, ${0.4 * signalOpacity})`;
        glowColor = `rgba(0, 255, 255, ${0.8 * signalOpacity})`;
        amplitude = Math.max(3, edgeRenderWidth * 1.5);
        speed = 0.008;
      } else if (isUplink) {
        baseColor = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${0.2 * signalOpacity})`;
        waveColor1 = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.8 * signalOpacity})`;
        waveColor2 = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${0.5 * signalOpacity})`;
        glowColor = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${0.9 * signalOpacity})`;
        amplitude = Math.max(5, edgeRenderWidth * 2.5);
        speed = 0.005;
      } else {
        baseColor = `rgba(170, 170, 170, ${0.15 * signalOpacity})`;
        waveColor1 = `rgba(200, 200, 200, ${0.6 * signalOpacity})`;
        waveColor2 = `rgba(150, 150, 150, ${0.3 * signalOpacity})`;
        glowColor = `rgba(170, 170, 170, ${0.5 * signalOpacity})`;
        amplitude = Math.max(4, edgeRenderWidth * 2);
        speed = 0.004;
      }

      ctx.globalCompositeOperation = "lighter";

      // Draw base faint dashed line (the central axis)
      ctx.beginPath();
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -now * (speed * 2);
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1;
      ctx.moveTo(0, 0);
      ctx.lineTo(dist, 0);
      ctx.stroke();

      // Animated RF waves
      ctx.setLineDash([]);
      const frequency = 0.035;
      const phaseOffset = -now * speed - seed;

      // First wave
      ctx.beginPath();
      for (let i = 0; i <= dist; i += 3) {
        const dampen = Math.sin((i / dist) * Math.PI); // Taper ends
        const y = Math.sin(i * frequency + phaseOffset) * amplitude * dampen;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.strokeStyle = waveColor1;
      ctx.lineWidth = Math.max(1.5, edgeRenderWidth * 0.8);
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = nodes.length <= 200 ? 10 : 0;
      ctx.stroke();

      // Second wave (inverted phase for DNA/helix effect)
      ctx.beginPath();
      for (let i = 0; i <= dist; i += 3) {
        const dampen = Math.sin((i / dist) * Math.PI);
        const y = Math.sin(i * frequency + phaseOffset + Math.PI) * amplitude * dampen;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.strokeStyle = waveColor2;
      ctx.lineWidth = Math.max(1, edgeRenderWidth * 0.5);
      ctx.shadowBlur = 0;
      ctx.stroke();

      ctx.restore();
      return;
    } else if (ddosAttackOnEdge) {
      // DDOS attack on this edge: dark red base with bright red flowing animation
      ctx.setLineDash([]);
      const elapsed = now - ddosAttackOnEdge.startTime;
      const DDOS_ADVANCE_SPEED = 4000; // 4 seconds to traverse the entire network

      // Calculate overall progress (0 to 1) across the entire path
      const pathProgress = Math.min(1, elapsed / DDOS_ADVANCE_SPEED);

      // Determine this edge's position in the path
      const pathLength = ddosAttackOnEdge.attackPath.path.length;
      const edgeIndex = ddosAttackOnEdge.attackPath.path.indexOf(
        ddosAttackOnEdge.edgeInPath
      );
      const edgeStartProgress = edgeIndex / pathLength;
      const edgeEndProgress = (edgeIndex + 1) / pathLength;

      // Calculate this edge's local progress (0 to 1)
      let localProgress = 0;
      if (
        pathProgress >= edgeStartProgress &&
        pathProgress <= edgeEndProgress
      ) {
        localProgress =
          (pathProgress - edgeStartProgress) /
          (edgeEndProgress - edgeStartProgress);
      } else if (pathProgress > edgeEndProgress) {
        localProgress = 1; // Attack has passed through
      }

      // Create gradient based on direction
      const direction = ddosAttackOnEdge.edgeInPath.direction;
      const startNode = direction === 1 ? fromNode : toNode;
      const endNode = direction === 1 ? toNode : fromNode;

      const gradient = ctx.createLinearGradient(
        startNode.x,
        startNode.y,
        endNode.x,
        endNode.y
      );
      const darkRedColor = `rgba(139, 0, 0, ${edgeOpacity})`; // Dark red base
      const brightRedColor = `rgba(255, 50, 50, ${edgeOpacity})`; // Bright red flow

      if (localProgress > 0) {
        gradient.addColorStop(0, brightRedColor);
        gradient.addColorStop(Math.min(1, localProgress), brightRedColor);
        gradient.addColorStop(
          Math.min(1, localProgress + 0.01),
          darkRedColor
        );
        gradient.addColorStop(1, darkRedColor);
      } else {
        gradient.addColorStop(0, darkRedColor);
        gradient.addColorStop(1, darkRedColor);
      }

      ctx.strokeStyle = gradient;
    } else if (forwardInfection || backwardInfection) {
      ctx.setLineDash([]);
      const infection = forwardInfection || backwardInfection;
      const infector = forwardInfection ? fromNode : toNode;
      const target = forwardInfection ? toNode : fromNode;

      const elapsed = now - infection.startTime;
      let progress;

      // Special animation for central node attack
      if (target.parent === null) {
        const ATTACK_ADVANCE_TIME = 1500;
        const ATTACK_RETREAT_TIME = 1000;

        if (elapsed < ATTACK_ADVANCE_TIME) {
          // Line moves towards center, but stops at 90% of the way
          progress = (elapsed / ATTACK_ADVANCE_TIME) * 0.9;
        } else {
          // Line retracts as the defense pulse fires
          const retreatElapsed = elapsed - ATTACK_ADVANCE_TIME;
          progress =
            0.9 * (1 - Math.min(1, retreatElapsed / ATTACK_RETREAT_TIME));
        }
        progress = Math.max(0, progress); // prevent negative progress
      } else {
        // Normal downstream infection
        progress = Math.min(1, elapsed / 4000);
      }

      // Draw the underlying connection (faded)
      ctx.beginPath();
      ctx.moveTo(infector.x, infector.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = `rgba(${colors.line.r}, ${colors.line.g}, ${
        colors.line.b
      }, ${0.15 * edgeOpacity})`;
      ctx.lineWidth = Math.max(1, edgeRenderWidth * 0.58);
      ctx.stroke();

      // Draw the organic "tentacle" infection
      if (progress > 0.01) {
        const dx = target.x - infector.x;
        const dy = target.y - infector.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const currentDist = dist * progress;

        // Number of segments for the organic curve
        const segments = Math.max(4, Math.floor(currentDist / 8));

        ctx.beginPath();
        ctx.moveTo(infector.x, infector.y);

        for (let i = 1; i <= segments; i++) {
          const t = i / segments; // 0 to 1 along the tentacle
          const pointDist = currentDist * t;

          // Base position on the line
          const bx = infector.x + Math.cos(angle) * pointDist;
          const by = infector.y + Math.sin(angle) * pointDist;

          // Organic wiggle calculation
          // Phase shifts over time for movement
          const wavePhase = now * 0.015 - t * 8;
          // Amplitude tapers at the start (attached to node) and is steady towards tip
          const taper = Math.min(1, t * 3);
          const amplitude = 3 * taper;

          // Perpendicular offset
          const px = -Math.sin(angle);
          const py = Math.cos(angle);

          const offsetX = px * Math.sin(wavePhase) * amplitude;
          const offsetY = py * Math.sin(wavePhase) * amplitude;

          ctx.lineTo(bx + offsetX, by + offsetY);
        }

        // Styling for the tentacle
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, edgeRenderWidth * 0.82);
        ctx.strokeStyle = `rgba(${colors.malware.r}, ${colors.malware.g}, ${colors.malware.b}, ${edgeOpacity})`;
        ctx.shadowColor = `rgba(${colors.malware.r}, ${colors.malware.g}, ${colors.malware.b}, 0.8)`;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        // Draw a glowing "head" at the tip
        const tipX = infector.x + Math.cos(angle) * currentDist;
        const tipY = infector.y + Math.sin(angle) * currentDist;
        // Add slight wiggle to tip too
        const tipWavePhase = now * 0.015 - 8;
        const tipPx = -Math.sin(angle);
        const tipPy = Math.cos(angle);
        const tipOffsetX = tipPx * Math.sin(tipWavePhase) * 3;
        const tipOffsetY = tipPy * Math.sin(tipWavePhase) * 3;

        ctx.beginPath();
        ctx.arc(
          tipX + tipOffsetX,
          tipY + tipOffsetY,
          Math.max(2.5, edgeRenderWidth * 0.92),
          0,
          Math.PI * 2
        );
        ctx.fillStyle = `rgba(${colors.malware.r}, ${colors.malware.g}, ${colors.malware.b}, ${edgeOpacity})`;
        ctx.shadowColor = `rgba(${colors.malware.r}, ${colors.malware.g}, ${colors.malware.b}, 1)`;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      return; // Skip default drawing
    } else if (edge.isDatacenterVpnTunnel) {
      ctx.setLineDash([5, 3]);
      ctx.lineDashOffset = -((now * 0.0015) % 8);
      ctx.lineWidth = Math.max(2.0, edgeRenderWidth * 0.95);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const dcR = colors.datacenter.r, dcG = colors.datacenter.g, dcB = colors.datacenter.b;
      const dcBase    = `rgba(${dcR}, ${dcG}, ${dcB}, ${0.28 * edgeOpacity})`;
      const dcHot     = `rgba(${dcR}, ${dcG}, ${dcB}, ${edgeOpacity})`;
      const dcHi      = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.58 * edgeOpacity})`;
      const dcUnbuilt = `rgba(${dcR}, ${dcG}, ${dcB}, ${0.07 * edgeOpacity})`;
      const dcGrad    = ctx.createLinearGradient(fromNode.x, fromNode.y, toNode.x, toNode.y);

      const dcCreationElapsed = edge.createdAt ? now - edge.createdAt : Infinity;
      const DC_INIT_DURATION = 1800 / healSpeedMultiplier;

      if (dcCreationElapsed < DC_INIT_DURATION) {
        // Initiation sweep: beam head races from 0→1 with unbuilt dim trail behind it
        const dcProgress = Math.min(1, dcCreationElapsed / DC_INIT_DURATION);
        const dcEased    = 1 - Math.pow(1 - dcProgress, 3);
        const dcHead     = Math.max(0, Math.min(1, dcEased));
        const dcSweep    = 0.11;
        const dcPre      = Math.max(0, dcHead - dcSweep);
        const dcPreInner = Math.max(0, dcHead - dcSweep * 0.5);
        const dcPostInner = Math.min(1, dcHead + dcSweep * 0.5);
        const dcPost     = Math.min(1, dcHead + dcSweep);

        dcGrad.addColorStop(0, dcBase);
        dcGrad.addColorStop(dcPre, dcBase);
        dcGrad.addColorStop(dcPreInner, dcHi);
        dcGrad.addColorStop(dcHead, dcHot);
        dcGrad.addColorStop(dcPostInner, dcHi);
        dcGrad.addColorStop(dcPost, dcUnbuilt);
        dcGrad.addColorStop(1, dcUnbuilt);
      } else {
        // Fully established: dual-pulse flowing gradient
        const dcPulse    = (now * 0.00085) % 1;
        const dcMirrored = (dcPulse + 0.5) % 1;
        const dcW = 0.09;
        const dcStops = [];

        const dcPushStop = (pos, color) => {
          while (pos < 0) pos += 1;
          while (pos > 1) pos -= 1;
          dcStops.push({ pos, color });
        };
        const dcAddPulse = (center) => {
          dcPushStop(center - dcW * 2, dcBase);
          dcPushStop(center - dcW, dcHi);
          dcPushStop(center, dcHot);
          dcPushStop(center + dcW, dcHi);
          dcPushStop(center + dcW * 2, dcBase);
        };

        dcPushStop(0, dcBase);
        dcPushStop(1, dcBase);
        dcAddPulse(dcPulse);
        dcAddPulse(dcMirrored);

        dcStops.sort((a, b) => a.pos - b.pos);
        let dcLastPos = -1;
        dcStops.forEach((stop) => {
          const cp = Math.max(0, Math.min(1, stop.pos));
          if (cp !== dcLastPos) {
            dcGrad.addColorStop(cp, stop.color);
            dcLastPos = cp;
          }
        });
      }
      ctx.strokeStyle = dcGrad;
    } else if (edge.isGuardianVpnTunnel) {
      ctx.setLineDash([6, 3]);
      ctx.lineDashOffset = -animValues.nowMod9;

      const attempt = edge.guardianFirewallAttempt;
      const guardianColor = `rgba(${colors.neonGreen.r}, ${colors.neonGreen.g}, ${colors.neonGreen.b}, ${edgeOpacity})`;
      const baseColor = `rgba(${colors.blue.r}, ${colors.blue.g}, ${
        colors.blue.b
      }, ${0.4 * edgeOpacity})`;
      const highlightColor = `rgba(${colors.white.r}, ${
        colors.white.g
      }, ${colors.white.b}, ${0.6 * edgeOpacity})`;
      const gradient = ctx.createLinearGradient(
        fromNode.x,
        fromNode.y,
        toNode.x,
        toNode.y
      );

      const creationStartTime =
        attempt && attempt.startTime ? attempt.startTime : edge.createdAt;
      const creationElapsed = creationStartTime
        ? now - creationStartTime
        : Infinity;

      if (creationElapsed < GUARDIAN_FIREWALL_ATTEMPT_DURATION) {
        const progress = Math.min(
          1,
          creationElapsed / GUARDIAN_FIREWALL_ATTEMPT_DURATION
        );

        const eased = 1 - Math.pow(1 - progress, 3);
        const headPos = Math.max(0, Math.min(1, eased));
        const sweepWidth = 0.12;
        const pre = Math.max(0, headPos - sweepWidth);
        const preInner = Math.max(0, headPos - sweepWidth * 0.5);
        const postInner = Math.min(1, headPos + sweepWidth * 0.5);
        const post = Math.min(1, headPos + sweepWidth);

        const unbuiltColor = `rgba(${colors.blue.r}, ${colors.blue.g}, ${colors.blue.b}, ${0.08 * edgeOpacity})`;

        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(pre, baseColor);
        gradient.addColorStop(preInner, highlightColor);
        gradient.addColorStop(headPos, guardianColor);
        gradient.addColorStop(postInner, highlightColor);
        gradient.addColorStop(post, unbuiltColor);
        gradient.addColorStop(1, unbuiltColor);
      } else {
        const pulse = (now * 0.001) % 1;
        const mirrored = (pulse + 0.5) % 1;
        const width = 0.08;
        const stops = [];

        const pushStop = (pos, color) => {
          while (pos < 0) pos += 1;
          while (pos > 1) pos -= 1;
          stops.push({ pos, color });
        };

        const addPulse = (center) => {
          pushStop(center - width * 2, baseColor);
          pushStop(center - width, highlightColor);
          pushStop(center, guardianColor);
          pushStop(center + width, highlightColor);
          pushStop(center + width * 2, baseColor);
        };

        pushStop(0, baseColor);
        pushStop(1, baseColor);
        addPulse(pulse);
        addPulse(mirrored);

        stops.sort((a, b) => a.pos - b.pos);

        let lastPos = -1;
        stops.forEach((stop) => {
          const clampedPos = Math.max(0, Math.min(1, stop.pos));
          if (clampedPos !== lastPos) {
            gradient.addColorStop(clampedPos, stop.color);
            lastPos = clampedPos;
          }
        });
      }

      ctx.strokeStyle = gradient;
    } else if (
      toNode.status === "red" ||
      toNode.status === "yellow" ||
      toNode.status === "malware" ||
      toNode.status === "botnet" ||
      toNode.status === "commandControl"
    ) {
      ctx.setLineDash([5, 5]);
      let color;
      if (toNode.status === "malware") {
        color = colors.malware;
        // Scrolling effect for malware (purple) lines
        ctx.lineDashOffset = -(Date.now() * 0.025) % 10;
      } else if (toNode.status === "botnet") {
        color = colors.botnet;
        // Scrolling effect for botnet (red) lines
        ctx.lineDashOffset = -(Date.now() * 0.025) % 10;
      } else if (toNode.status === "commandControl") {
        color = colors.commandControl;
        // Scrolling effect for C&C (dark red) lines
        ctx.lineDashOffset = -(Date.now() * 0.025) % 10;
      } else {
        color = colors.red;
        ctx.lineDashOffset = 0; // No scroll for regular red/yellow lines
      }
      const pulse = 0.6 + animValues.pulse005 * 0.4;
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${
        pulse * edgeOpacity
      })`;
    } else {
      ctx.setLineDash([]);
      // Mark this edge as a normal healthy link so the halo pre-stroke
      // below knows to apply only to these (not VPN/DDOS/infected/etc).
      isNormalHealthyEdge = true;

      flowVisualState = LinkQualitySystem.getEdgeFlowVisualState(edge, now);

      // Subtle sinusoidal width breathing for an organic "alive" feel (±7%, period ~7.8s).
      const breathe = 1 + 0.07 * Math.sin(now * 0.0008 + (edge.pulseSeed || 0));
      ctx.lineWidth = edgeRenderWidth * breathe;

      // Performance: Use richer flow gradients for normal links on smaller networks.
      if (nodes.length <= 170 && flowVisualState) {
        const gradient = ctx.createLinearGradient(
          fromNode.x,
          fromNode.y,
          toNode.x,
          toNode.y
        );

        // Raised alpha ranges so healthy high-BW links read more clearly as green arteries.
        const baseAlpha =
          (0.18 + flowVisualState.throughput * 0.20) * edgeOpacity;
        const carrierAlpha =
          (0.28 + flowVisualState.throughput * 0.34) * edgeOpacity;
        const hotAlpha =
          (0.44 + flowVisualState.throughput * 0.46) * edgeOpacity;

        const baseColor = `rgba(${colors.green.r}, ${colors.green.g}, ${
          colors.green.b
        }, ${baseAlpha})`;
        const carrierColor = `rgba(${colors.neonGreen.r}, ${
          colors.neonGreen.g
        }, ${colors.neonGreen.b}, ${carrierAlpha})`;
        const hotColor = `rgba(${colors.white.r}, ${colors.white.g}, ${
          colors.white.b
        }, ${hotAlpha})`;

        // Only add gradient stops within [0,1] — stops outside this range are discarded.
        // This prevents the "phantom pulse" artifact caused by wrapping out-of-range stops
        // back into the gradient, which made pulses appear to teleport at edge boundaries.
        const addFlowPulse = (stops, center) => {
          const w = flowVisualState.pulseWidth;
          const tryStop = (pos, color) => {
            if (pos >= 0 && pos <= 1) stops.push({ pos, color });
          };
          tryStop(center - w * 2, baseColor);
          tryStop(center - w, carrierColor);
          tryStop(center, hotColor);
          tryStop(center + w, carrierColor);
          tryStop(center + w * 2, baseColor);
        };

        const stops = [];
        addFlowPulse(stops, flowVisualState.pulseCenter);
        // Second pulse only on high-throughput links to reduce visual noise.
        if (flowVisualState.throughput > 0.75) {
          addFlowPulse(stops, (flowVisualState.pulseCenter + 0.5) % 1);
        }

        stops.sort((a, b) => a.pos - b.pos);
        gradient.addColorStop(0, baseColor);
        let lastPos = -1;
        stops.forEach((stop) => {
          const clampedPos = Math.max(0, Math.min(1, stop.pos));
          if (clampedPos !== lastPos) {
            gradient.addColorStop(clampedPos, stop.color);
            lastPos = clampedPos;
          }
        });
        gradient.addColorStop(1, baseColor);
        ctx.strokeStyle = gradient;
      } else {
        // Simple static color for performance
        const staticAlpha = flowVisualState
          ? (0.22 + flowVisualState.throughput * 0.22) * edgeOpacity
          : 0.3 * edgeOpacity;
        ctx.strokeStyle = `rgba(${colors.green.r}, ${colors.green.g}, ${
          colors.green.b
        }, ${staticAlpha})`;
      }
    }

    // Compute a subtle organic flex control point for non-VPN edges so
    // links sway gently rather than reading as rigid straight slabs.
    // VPN tunnels keep their existing arched control point further below.
    const edgeFlexControl = getNormalEdgeFlexControl(edge, now);

    // Soft halo pre-stroke for healthy/normal green edges: a wider, very
    // low-alpha pass underneath the main stroke gives the line a soft
    // falloff at its sides instead of a hard pixel boundary. Gated on
    // node count to match the existing perf tier behaviour.
    if (isNormalHealthyEdge && nodes.length <= 220) {
      const haloThroughput = flowVisualState
        ? flowVisualState.throughput
        : 0;
      const haloAlpha =
        (0.05 + haloThroughput * 0.06) * edgeOpacity;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = ctx.lineWidth * 2.4;
      ctx.strokeStyle = `rgba(${colors.green.r}, ${colors.green.g}, ${colors.green.b}, ${haloAlpha})`;
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      if (edgeFlexControl) {
        ctx.quadraticCurveTo(
          edgeFlexControl.x,
          edgeFlexControl.y,
          toNode.x,
          toNode.y
        );
      } else {
        ctx.lineTo(toNode.x, toNode.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Round caps/joins soften the line ends so edges no longer read as
    // hard rectangular slabs. VPN branches set their own caps, but they
    // also use round, so this is consistent across all edge types.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    if (edge.isGuardianVpnTunnel) {
      const control = getGuardianVpnTunnelControlPoint(fromNode, toNode);
      ctx.quadraticCurveTo(control.x, control.y, toNode.x, toNode.y);
    } else if (edge.isDatacenterVpnTunnel) {
      const control = getDatacenterVpnTunnelControlPoint(
        fromNode,
        toNode,
        edge
      );
      ctx.quadraticCurveTo(control.x, control.y, toNode.x, toNode.y);
    } else if (edgeFlexControl) {
      ctx.quadraticCurveTo(
        edgeFlexControl.x,
        edgeFlexControl.y,
        toNode.x,
        toNode.y
      );
    } else {
      ctx.lineTo(toNode.x, toNode.y);
    }
    ctx.stroke();

    // Skip the straight-line tracer when both endpoints are datacenter nodes:
    // the arched VPN tunnel overlay already provides animated tracers for that link.
    const suppressTracer = fromNode.isDatacenter && toNode.isDatacenter;
    if (flowVisualState && nodes.length <= 170 && !suppressTracer) {
      const tracer = getPointAndPerpOnEdge(edge, flowVisualState.pulseCenter);
      if (tracer) {
        const tracerRadius = Math.max(
          1.2,
          edgeRenderWidth * (0.16 + flowVisualState.throughput * 0.22)
        );
        ctx.save();
        ctx.beginPath();
        ctx.arc(tracer.x, tracer.y, tracerRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${(0.35 + flowVisualState.throughput * 0.45) * edgeOpacity})`;
        ctx.fill();
        ctx.restore();
      }
    }

    // Datacenter VPN initiation: glowing cyan head races along the arch
    if (edge.isDatacenterVpnTunnel && edge.createdAt) {
      const dcInitElapsed = now - edge.createdAt;
      const DC_INIT_DUR   = 1800 / healSpeedMultiplier;
      if (dcInitElapsed < DC_INIT_DUR) {
        const dcProg     = Math.min(1, dcInitElapsed / DC_INIT_DUR);
        const dcHeadPos  = Math.max(0, Math.min(1, 1 - Math.pow(1 - dcProg, 3)));
        const dcSample   = getPointAndPerpOnEdge(edge, dcHeadPos);
        if (dcSample) {
          const dcStrength = 1 - dcProg;
          const dcRadius   = 3.5 + dcStrength * 3.5;
          ctx.save();
          ctx.beginPath();
          ctx.arc(dcSample.x, dcSample.y, dcRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.9 * edgeOpacity})`;
          ctx.shadowColor = `rgba(${colors.datacenter.r}, ${colors.datacenter.g}, ${colors.datacenter.b}, 1)`;
          ctx.shadowBlur = 14 + dcStrength * 20;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    if (edge.isGuardianVpnTunnel) {
      const attempt = edge.guardianFirewallAttempt;
      const creationStartTime =
        attempt && attempt.startTime ? attempt.startTime : edge.createdAt;
      const creationElapsed = creationStartTime
        ? now - creationStartTime
        : Infinity;
      if (creationElapsed < GUARDIAN_FIREWALL_ATTEMPT_DURATION) {
        const progress = Math.min(
          1,
          creationElapsed / GUARDIAN_FIREWALL_ATTEMPT_DURATION
        );

        const eased = 1 - Math.pow(1 - progress, 3);
        const headPos = Math.max(0, Math.min(1, eased));
        const sample = getPointAndPerpOnEdge(edge, headPos);
        if (sample) {
          const headStrength = 1 - progress;
          const headRadius = 3 + headStrength * 3;

          ctx.save();
          ctx.beginPath();
          ctx.arc(sample.x, sample.y, headRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.85 * edgeOpacity})`;
          ctx.shadowColor = `rgba(${colors.neonGreen.r}, ${colors.neonGreen.g}, ${colors.neonGreen.b}, 1)`;
          ctx.shadowBlur = 12 + headStrength * 18;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Draw flashing X on central-to-target edge during DDOS
    if (ddosAttackOnEdge) {
      // Check if this is the edge from central node to target branch
      const isCentralToTarget =
        (fromNode.parent === null &&
          toNode === ddosAttackOnEdge.attackPath.target) ||
        (toNode.parent === null &&
          fromNode === ddosAttackOnEdge.attackPath.target);

      if (isCentralToTarget) {
        // Calculate midpoint of edge
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;

        // Flashing effect (2 Hz = 500ms period)
        const flashCycle = (now % 500) / 500; // 0 to 1
        const flashAlpha = flashCycle < 0.5 ? 1 : 0.3; // On/off flash

        // Draw stop emoji symbol
        ctx.save();
        ctx.globalAlpha = flashAlpha * edgeOpacity;
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⛔", midX, midY);
        ctx.restore();
      }
    }

    if (edge.isDatacenterVpnTunnel) {
      const seed = edge.pulseSeed || 0;
      const tracerPosA = (now * 0.00025 + seed * 0.17) % 1;
      const tracerPosB = (tracerPosA + 0.5) % 1;
      const sampleA = getPointAndPerpOnEdge(edge, tracerPosA);
      const sampleB = getPointAndPerpOnEdge(edge, tracerPosB);
      const tracerRadius = Math.max(1.6, edgeRenderWidth * 0.38);

      if (sampleA || sampleB) {
        ctx.save();
        ctx.fillStyle = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.72 * edgeOpacity})`;

        if (sampleA) {
          ctx.beginPath();
          ctx.arc(sampleA.x, sampleA.y, tracerRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        if (sampleB) {
          ctx.beginPath();
          ctx.arc(sampleB.x, sampleB.y, tracerRadius * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    if (datacenterVpnPerfStart > 0) {
      datacenterVpnDrawMsAccum += performance.now() - datacenterVpnPerfStart;
    }
  });
  const edgeDrawMs = performance.now() - edgeDrawStartPerf;
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // Draw DDOS visual effects
  // Performance: Only iterate C&C nodes with active DDOS (charging or active)
  const activeDDOSNodes = nodes.filter(
    (n) =>
      n.status === "commandControl" &&
      n.state === "alive" &&
      (n.ddosState === "charging" || n.ddosState === "active")
  );

  activeDDOSNodes.forEach((ccNode) => {
    // Charging phase: red lightning between C&C and botnets
    if (
      ccNode.ddosState === "charging" &&
      ccNode.ddosBotnets.length > 0
    ) {
      const chargeProgress =
        (now - ccNode.ddosChargeStart) / (6000 / attackFreqMultiplier);

      ccNode.ddosBotnets.forEach((botnet) => {
        if (botnet.state !== "alive") return;

        // Lightning effect with increasing intensity
        const pulseIntensity = 0.3 + 0.5 * chargeProgress;
        const lightningPulse = animValues.pulse01 * 0.2 + 0.8;
        const alpha = pulseIntensity * lightningPulse;

        ctx.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
        ctx.lineWidth = 2 + chargeProgress * 2;
        ctx.setLineDash([5, 5]);

        // Add zigzag to simulate lightning
        ctx.beginPath();
        const dx = botnet.x - ccNode.x;
        const dy = botnet.y - ccNode.y;
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = ccNode.x + dx * t + Math.sin(now * 0.02 + i) * 5;
          const y = ccNode.y + dy * t + Math.cos(now * 0.02 + i) * 5;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      ctx.setLineDash([]);
    }

    // Active phase: Draw warning on targeted branch node and affected edges
    if (ccNode.ddosState === "active" && ccNode.ddosTargetBranch) {
      const targetBranch = ccNode.ddosTargetBranch;

      // Pulsing red warning ring on target branch node
      const warningPulse = animValues.pulse008 * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(139, 0, 0, ${warningPulse * 0.8})`;
      ctx.lineWidth = 3;
      const warningRadius =
        targetBranch.radius + 15 + animValues.pulse005 * 5;

        // Draw pulsing red glow on participating botnet nodes
        if (ccNode.ddosBotnets && ccNode.ddosBotnets.length > 0) {
          ccNode.ddosBotnets.forEach((botnet) => {
            if (botnet.state !== "alive") return;

            const botnetPulse = animValues.pulse01 * 0.3 + 0.5;
          ctx.strokeStyle = `rgba(220, 38, 38, ${botnetPulse * 0.6})`;
          ctx.lineWidth = 2;
          const glowRadius = botnet.radius + 8 + animValues.pulse008 * 3;

          ctx.beginPath();
          ctx.arc(botnet.x, botnet.y, glowRadius, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    }
  });

  edgesSet.clear();
  for (const edge of edges) {
    edgesSet.add(edge);
  }

  LinkQualitySystem.updateMetrics(now);

  DataTrafficSystem.manageDataPackets();
  ImmunityPacketSystem.manageImmunityPackets();
  PingPacketSystem.managePingPackets();
  PingOfDeathSystem.managePingOfDeath();
  PhishPacketSystem.managePhishPackets();
  DDOSSystem.manageDDOSAttacks();
  CounterStrikeSystem.manageCounterStrikes();
  ParticleSystem.manageHoneycombStreams();
  DispatchPacketSystem.guardianThreatHunting();
  DispatchPacketSystem.manageDispatchPackets();

  SatelliteSystem.refreshOrbitingSatellites();

  nodes.forEach((node) => {
    node.update();

    // Don't draw drifting satellites - they're being cleaned up
    if (node.state === "drifting" && node.isSatellite) {
      return; // Skip drawing entirely
    }

    // Performance: Viewport culling - skip drawing off-screen nodes (except central node)
    if (
      node.parent === null ||
      isInViewport(node.x, node.y, node.radius + 50)
    ) {
      node.draw();
    }
  });

  // Redraw the central node to ensure it's on top of all other elements
  const rootNode = nodes[0];
  if (rootNode) {
    WebCrawler.draw(ctx, now);
    rootNode.draw();

    // Draw immunity packets attached to central node on top of its glow
    immunityPackets.forEach((packet) => {
      const isAttachedToCentral =
        packet.isAttached &&
        packet.attachedNode &&
        packet.attachedNode.parent === null;
      if (isAttachedToCentral && packet.active) {
        packet.draw();
      }
    });
  }

  // REACTIONS — advance and render floating emoticons/phrases above nodes.
  // Drawn inside the camera transform so bubbles track their node under pan/zoom.
  ReactionsSystem.update(deltaSeconds);
  ReactionsSystem.draw(ctx);

  const nodesToRemove = nodes.filter(
    (node) => node.opacity <= 0 && node.state !== "spawning"
  );
  if (nodesToRemove.length > 0) {
    if (nodesToRemove.some((n) => n.parent === nodes[0])) {
      nodes[0].pulseEffect = 1;
    }

    nodesToRemove.forEach((node) => {
      if (node.parent) {
        node.parent.children = node.parent.children.filter(
          (child) => child.id !== node.id
        );
      }
    });

    // Count packets on removed branches as received (natural decay)
    const removedNodeIds = new Set(nodesToRemove.map((n) => n.id));
    dataPackets.forEach((packet) => {
      if (
        packet.active &&
        packet.edge &&
        (removedNodeIds.has(packet.edge.from?.id) ||
          removedNodeIds.has(packet.edge.to?.id))
      ) {
        incrementStat("packetsReceived");
      }
    });

    // Remove dead nodes and their edges in-place so shared array references
    // across modules (datacenter behavior, infection system, etc.) stay valid.
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (removedNodeIds.has(nodes[i].id)) {
        nodes.splice(i, 1);
      }
    }
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      if (
        !edge.from ||
        !edge.to ||
        removedNodeIds.has(edge.from.id) ||
        removedNodeIds.has(edge.to.id)
      ) {
        edges.splice(i, 1);
      }
    }
  }

  const frameElapsedMs = performance.now() - frameStartPerf;
  const perfSmoothing = 0.12;
  const smoothMetric = (previous, next) => {
    if (!Number.isFinite(previous) || previous <= 0) return next;
    return previous + (next - previous) * perfSmoothing;
  };

  runtimePerformanceMetrics.frameTimeMs = smoothMetric(
    runtimePerformanceMetrics.frameTimeMs,
    frameElapsedMs
  );
  runtimePerformanceMetrics.fps =
    1000 / Math.max(0.001, runtimePerformanceMetrics.frameTimeMs);
  runtimePerformanceMetrics.edgeDrawMs = smoothMetric(
    runtimePerformanceMetrics.edgeDrawMs,
    edgeDrawMs
  );
  runtimePerformanceMetrics.datacenterVpnDrawMs = smoothMetric(
    runtimePerformanceMetrics.datacenterVpnDrawMs,
    datacenterVpnDrawMsAccum
  );
  runtimePerformanceMetrics.datacenterVpnDrawCount = datacenterVpnDrawCount;

  // Update stats display
  StatsDisplaySystem.updateStatsDisplay();

  // Draw particles (pops, explosions)
  ParticleSystem.manageParticles();

  // Restore Camera Transform
  ctx.restore();

  // Draw HUD/UI elements (on top of everything, unaffected by zoom)
  // (If there were any canvas-drawn UI elements, they would go here)
}

// NEW: Dynamic Camera Logic
function updateCamera() {
  return CameraSystem.updateCamera();
}

window.addEventListener("resize", () => {
  resizeCanvas();
  backgroundSystem.resize();
  window.NodeNet.GraphBuilder.createGraph();
});

resizeCanvas();
backgroundSystem.init();
window.NodeNet.backgroundSystem = backgroundSystem;
window.NodeNet.GraphBuilder.createGraph();
WebCrawler.init();
animate();
ToolState.initializeToolButtons();
UIInitializers.initializeStatsPaneToggle();
UIInitializers.initializeTabs();
UIInitializers.initCodex();
UIInitializers.initializeSliders();
UIInitializers.initializeBackgroundSelector();
initializeZoomControls();
initializeLogFilters();
initializeStateManagement();
ScenarioPresets.initializePresets();
TickerSystem.init();
NewsSystem.init();

// Initialize Zoom Controls
function initializeZoomControls() {
  CameraSystem.initializeZoomControls();

  // Initialize pause button
  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", togglePause);
  }

  // Keyboard shortcuts — tools (1-7), pause (Space), help (?), panel (Tab)
  document.addEventListener("keydown", function (e) {
    // Ignore when typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    // Help overlay toggle
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      HUDSystem.toggleHelpOverlay();
      return;
    }
    // Escape closes help overlay
    if (e.key === 'Escape') {
      if (HUDSystem.closeHelpOverlayIfVisible()) {
        return;
      }
    }

    // Tool shortcuts 1-7
    const toolKeys = { '1': 'sprout', '2': 'prune', '3': 'infect', '4': 'cure', '5': 'harden', '6': 'link', '7': 'drag' };
    if (toolKeys[e.key]) {
      e.preventDefault();
      const toolBtn = document.querySelector(`.tool-btn[data-tool="${toolKeys[e.key]}"]`);
      if (toolBtn) toolBtn.click();
      return;
    }

    // Tab toggles side panel
    if (e.key === 'Tab') {
      e.preventDefault();
      const toggleBtn = document.getElementById('statsPaneToggle');
      if (toggleBtn) toggleBtn.click();
      return;
    }

    // Space pauses
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      togglePause();
    }
  });
}

/**
 * Toggle pause state for the simulation
 */
function togglePause() {
  isPaused = !isPaused;
  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) {
    pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
    pauseBtn.classList.toggle("paused", isPaused);
    pauseBtn.title = isPaused ? "Resume (Space)" : "Pause (Space)";
  }
  if (isPaused) {
    logEvent("custom", { alert: "⏸️ Simulation paused" });
  } else {
    logEvent("custom", { alert: "▶️ Simulation resumed" });
  }
}


// Cleanup System — reclaim orphaned nodes/edges/satellites on a throttled tick.
const CleanupSystem = window.NodeNet?.CleanupSystem;
if (CleanupSystem) {
  CleanupSystem.configure({
    getNodes: () => nodes,
    getEdges: () => edges,
    markBranchForRetraction: (node, opts) =>
      window.NodeNet.TopologySystem.markBranchForRetraction(node, opts),
    untetherSatellite: (node) =>
      window.NodeNet.SatelliteSystem?.untetherSatellite(node),
    logEvent: EventLoggingSystem.logEvent,
  });
}

// Node Info Card — hover overlay reusing ToolState's screen→world hit-testing.
const NodeInfoCard = window.NodeNet?.NodeInfoCard;
if (NodeInfoCard) {
  NodeInfoCard.configure({
    getCanvas: () => canvas,
    getNodeAtPosition: (x, y) => ToolState.getNodeAtPosition(x, y),
    getCentralNode: () => nodes[0],
  });
  NodeInfoCard.init();
}

// Simulation tick intervals (multipliers affect behavior within functions)
setInterval(simulateNetworkEvents, 500);
setInterval(() => TopologySystem.updateNetworkTopology(), 500);
// Janitor pass — slower cadence than topology since orphans are rare.
if (CleanupSystem) {
  setInterval(() => { if (!isPaused) CleanupSystem.reclaimOrphans(); }, 2000);
}


// Start achievement checking (delayed so toasts appear after boot splash)
AchievementSystem.startChecking(6000, 2000);

// Start HUD update intervals
HUDSystem.start();
