/**
 * @module LinkQualitySystem
 * @summary Link realism model — per-edge latency/reliability/bandwidth metrics, protocol selection, edge render helpers.
 * @exports window.NodeNet.LinkQualitySystem
 * @tags link-quality, qos, latency, bandwidth, reliability, congestion, protocol, edge-render
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    config: window.NodeNetConfig || {},
    getEdges: () => [],
    countDescendants: null,
    metrics: null,
  };

  const CONFIG = new Proxy(
    {},
    {
      get(_target, property) {
        return (dependencies.config || window.NodeNetConfig || {})[property];
      },
    }
  );

  let runtimeLinkMetrics = {
    monitoredLinks: 0,
    avgQualityScore: 0,
    avgLatencyMs: 0,
    avgReliability: 0,
    congestedLinks: 0,
    highBandwidthLinks: 0,
  };

  function getCurrentEdges() {
    return typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Count non-satellite descendants for topology-aware uplink weighting.
   */
  function countDescendants(node) {
    if (typeof dependencies.countDescendants === "function") {
      return dependencies.countDescendants(node);
    }

    if (!node || !Array.isArray(node.children)) return 0;
    let count = 0;
    node.children.forEach((child) => {
      if (!child || child.isSatellite) return;
      count += 1 + countDescendants(child);
    });
    return count;
  }

  /**
   * Find the current edge between two nodes from the app-owned edge list.
   */
  function getEdgeBetweenNodes(nodeA, nodeB) {
    if (!nodeA || !nodeB) return null;
    return (
      getCurrentEdges().find(
        (edge) =>
          (edge.from === nodeA && edge.to === nodeB) ||
          (edge.from === nodeB && edge.to === nodeA)
      ) || null
    );
  }

  function getNodeBandwidthGrowthScore(node, now = Date.now()) {
    if (!node || !node.parent) return 1;

    const cfg = CONFIG.linkQuality;
    const parentEdge = getEdgeBetweenNodes(node, node.parent);
    if (!parentEdge) return 1;

    const snapshot =
      parentEdge.linkQualitySnapshot ||
      computeEdgeQualitySnapshot(parentEdge, now);
    if (!snapshot) return 1;

    const normalized = clampValue(
      (snapshot.bandwidth - cfg.minBandwidth) /
        Math.max(0.0001, 1 - cfg.minBandwidth),
      0,
      1
    );
    const eased = Math.pow(normalized, cfg.branchSpawnExponent || 1);
    const score =
      cfg.branchSpawnMinMultiplier +
      (cfg.branchSpawnMaxMultiplier - cfg.branchSpawnMinMultiplier) * eased;

    return clampValue(
      score,
      cfg.branchSpawnMinMultiplier,
      cfg.branchSpawnMaxMultiplier
    );
  }

  function chooseBandwidthWeightedNode(candidates, now = Date.now()) {
    if (!candidates || candidates.length === 0) return null;

    const weightFloor = Math.max(
      0.05,
      CONFIG.linkQuality.branchSpawnWeightFloor || 0.2
    );
    const weighted = candidates.map((node) => ({
      node,
      weight: Math.max(weightFloor, getNodeBandwidthGrowthScore(node, now)),
    }));

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let roll = Math.random() * totalWeight;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.node;
      }
    }

    return weighted[weighted.length - 1].node;
  }

  function enforceDatacenterHighBandwidth(edge) {
    if (!edge) return;

    ensureEdgeQualityModel(edge);
    const model = edge.linkQualityModel;
    const linkCfg = CONFIG.linkQuality;
    const datacenterCfg = CONFIG.datacenter;

    model.baselineBandwidth = Math.max(
      datacenterCfg.highBandwidthFloor,
      model.baselineBandwidth,
      linkCfg.baseBandwidthMax * 0.95
    );
    model.baselineLatencyMs = Math.min(
      model.baselineLatencyMs,
      linkCfg.baseLatencyMinMs + 10
    );
    model.baselineReliability = Math.max(model.baselineReliability, 0.985);
  }

  /**
   * Normalize bandwidth into a visually meaningful range for line rendering.
   * This prevents healthy links from collapsing into nearly identical widths.
   * @param {number} bandwidth
   * @param {any} cfg
   */
  function normalizeBandwidthForRender(bandwidth, cfg = CONFIG.linkQuality) {
    const minBandwidth = Number.isFinite(cfg.minBandwidth) ? cfg.minBandwidth : 0;
    const fallbackFloor = Number.isFinite(cfg.baseBandwidthMin)
      ? cfg.baseBandwidthMin
      : minBandwidth;
    const floor = clampValue(
      Number.isFinite(cfg.renderBandwidthVisualFloor)
        ? cfg.renderBandwidthVisualFloor
        : fallbackFloor,
      minBandwidth,
      0.97
    );
    const ceiling = clampValue(
      Number.isFinite(cfg.renderBandwidthVisualCeil)
        ? cfg.renderBandwidthVisualCeil
        : 1,
      floor + 0.01,
      1
    );

    return clampValue(
      (bandwidth - floor) / Math.max(0.0001, ceiling - floor),
      0,
      1
    );
  }

  /**
   * Build edge flow animation state from current link quality.
   * Higher throughput yields faster and tighter flow pulses.
   * @param {any} edge
   * @param {number} now
   */
  function getEdgeFlowVisualState(edge, now = Date.now()) {
    if (!edge || !edge.from || !edge.to) return null;

    const cfg = CONFIG.linkQuality;
    const snapshot = edge.linkQualitySnapshot || computeEdgeQualitySnapshot(edge, now);
    if (!snapshot) return null;

    if (!Number.isFinite(edge.pulseSeed)) {
      edge.pulseSeed = Math.random() * Math.PI * 2;
    }

    const bandwidthNorm = normalizeBandwidthForRender(snapshot.bandwidth, cfg);
    const reliabilityNorm = clampValue(
      (snapshot.reliability - cfg.minReliability) /
        Math.max(0.0001, 1 - cfg.minReliability),
      0,
      1
    );
    const congestionNorm = clampValue(snapshot.congestion, 0, 1);

    const throughput = clampValue(
      bandwidthNorm *
        (1 - congestionNorm * 0.72) *
        (0.68 + reliabilityNorm * 0.32),
      0,
      1
    );

    const speedMin = cfg.renderFlowSpeedMin ?? 0.00014;
    const speedMax = cfg.renderFlowSpeedMax ?? 0.00065;
    const flowSpeed = speedMin + (speedMax - speedMin) * throughput;

    // Accumulate pulse position per-edge to avoid position jumps when flowSpeed changes.
    // Using now*flowSpeed directly would cause jumps any time throughput/congestion updates.
    const deltaMs = Math.min(50, now - (edge._lastFlowTime ?? now));
    edge._lastFlowTime = now;
    if (!Number.isFinite(edge._flowPulsePos)) {
      edge._flowPulsePos = Number.isFinite(edge.pulseSeed)
        ? (edge.pulseSeed / (Math.PI * 2)) % 1
        : Math.random();
    }
    edge._flowPulsePos = (edge._flowPulsePos + flowSpeed * deltaMs) % 1;
    const pulseCenter = edge._flowPulsePos;
    const basePulseWidth = cfg.renderFlowPulseWidth ?? 0.16;
    const pulseWidth = clampValue(
      basePulseWidth * (1 - throughput * 0.42),
      0.05,
      0.22
    );

    return {
      snapshot,
      throughput,
      pulseCenter,
      pulseWidth,
      bandwidthNorm,
      congestionNorm,
    };
  }

  function getEdgeRenderWidth(edge, now = Date.now()) {
    if (!edge || !edge.from || !edge.to) {
      return 2;
    }

    const cfg = CONFIG.linkQuality;
    const snapshot =
      edge.linkQualitySnapshot || computeEdgeQualitySnapshot(edge, now);

    if (!snapshot) {
      return edge.isWirelessLink ? 2 : 3;
    }

    const normalizedBandwidth = normalizeBandwidthForRender(
      snapshot.bandwidth,
      cfg
    );
    const widthCurve = clampValue(cfg.renderWidthCurve ?? 1.45, 0.7, 2.8);
    const easedBandwidth = Math.pow(normalizedBandwidth, widthCurve);
    const qualityBlend = clampValue(
      snapshot.qualityScore * 0.45 + (1 - snapshot.congestion) * 0.55,
      0,
      1
    );
    const widthSpread = clampValue(
      easedBandwidth * 0.7 + qualityBlend * 0.3,
      0,
      1
    );

    let width =
      cfg.renderWidthMin +
      (cfg.renderWidthMax - cfg.renderWidthMin) * widthSpread;
    width *=
      1 -
      clampValue(snapshot.congestion, 0, 1) * cfg.renderCongestionWidthImpact;

    if (edge.isWirelessLink) width *= cfg.wirelessWidthScale;
    if (edge.isGuardianVpnTunnel) width *= cfg.guardianVpnWidthScale;
    if (edge.isBotnetMesh) width *= cfg.botnetMeshWidthScale;
    if (edge.isDatacenterVpnTunnel) width *= cfg.datacenterVpnWidthScale;

    return clampValue(width, 0.65, cfg.renderWidthMax * 1.6);
  }

  function getProtocolProfile(protocolName) {
    const profiles = CONFIG?.protocols?.profiles || {};
    return (
      profiles[protocolName] || {
        speedMultiplier: 1,
        dropSensitivity: 1,
        jitterSensitivity: 1,
      }
    );
  }

  function selectPacketProtocol() {
    const profiles = CONFIG?.protocols?.profiles || {};
    const entries = Object.entries(profiles);
    if (entries.length === 0) {
      return { name: "HTTP", profile: getProtocolProfile("HTTP") };
    }

    const totalWeight =
      entries.reduce((sum, [, profile]) => {
        const weight = Number.isFinite(profile?.weight) ? profile.weight : 1;
        return sum + Math.max(0, weight);
      }, 0) || entries.length;

    let roll = Math.random() * totalWeight;
    for (const [name, profile] of entries) {
      const weight = Number.isFinite(profile?.weight) ? profile.weight : 1;
      roll -= Math.max(0, weight);
      if (roll <= 0) {
        return { name, profile: getProtocolProfile(name) };
      }
    }

    const [fallbackName] = entries[entries.length - 1];
    return { name: fallbackName, profile: getProtocolProfile(fallbackName) };
  }

  function ensureEdgeQualityModel(edge) {
    if (!edge || edge.linkQualityModel) return;

    const cfg = CONFIG.linkQuality;
    const establishedAt = Date.now();
    const driftMin = Math.min(
      cfg.congestionDriftMin ?? 0.08,
      cfg.congestionDriftMax ?? 0.42
    );
    const driftMax = Math.max(
      cfg.congestionDriftMin ?? 0.08,
      cfg.congestionDriftMax ?? 0.42
    );
    const initialCongestion = randomRange(driftMin, driftMax);
    // Edges connected to datacenter nodes get higher baseline bandwidth and lower latency.
    const isDatacenterEdge =
      !!(edge.from?.isDatacenter || edge.to?.isDatacenter);
    const bwMin = isDatacenterEdge
      ? Math.max(cfg.baseBandwidthMin, 0.82)
      : cfg.baseBandwidthMin;
    const bwMax = isDatacenterEdge ? 1.0 : cfg.baseBandwidthMax;
    const latMin = isDatacenterEdge
      ? cfg.baseLatencyMinMs * 0.4
      : cfg.baseLatencyMinMs;
    const latMax = isDatacenterEdge
      ? cfg.baseLatencyMaxMs * 0.55
      : cfg.baseLatencyMaxMs;
    edge.linkQualityModel = {
      baselineLatencyMs: randomRange(latMin, latMax),
      baselineReliability: randomRange(
        cfg.baseReliabilityMin,
        cfg.baseReliabilityMax
      ),
      baselineBandwidth: randomRange(bwMin, bwMax),
      congestionSeed: Math.random() * Math.PI * 2,
      establishedAt,
      congestion: initialCongestion,
      targetCongestion: initialCongestion,
      nextCongestionShiftAt:
        establishedAt +
        randomRange(
          cfg.congestionRetargetMinMs ?? 7000,
          cfg.congestionRetargetMaxMs ?? 18000
        ),
    };
  }

  /**
   * Return the cached non-satellite descendant count for the child end of a tree edge.
   * Result is cached on the linkQualityModel and refreshed every 2 seconds.
   * Returns 0 for non-tree edges or if the child node cannot be determined.
   * @param {any} edge
   * @param {number} now
   */
  function getEdgeTopoDescendantCount(edge, now) {
    const model = edge.linkQualityModel;
    if (!model) return 0;

    // Determine child end: for tree edges, to.parent === from (standard creation order)
    let childNode = null;
    if (edge.to && edge.from && edge.to.parent === edge.from) childNode = edge.to;
    else if (edge.from && edge.to && edge.from.parent === edge.to) childNode = edge.from;
    if (!childNode) return 0;

    // Refresh cache every 2 seconds to avoid per-frame recursion
    if (!Number.isFinite(model._topoRefreshAt) || now >= model._topoRefreshAt) {
      model._topoDescendantCount = countDescendants(childNode);
      model._topoRefreshAt = now + 2000;
    }
    return model._topoDescendantCount ?? 0;
  }

  function computeEdgeQualitySnapshot(edge, now = Date.now()) {
    if (!edge || !edge.from || !edge.to) return null;

    ensureEdgeQualityModel(edge);

    const cfg = CONFIG.linkQuality;
    const model = edge.linkQualityModel;

    const fromCompromised =
      edge.from.status === "red" ||
      edge.from.status === "malware" ||
      edge.from.status === "botnet" ||
      edge.from.status === "commandControl";
    const toCompromised =
      edge.to.status === "red" ||
      edge.to.status === "malware" ||
      edge.to.status === "botnet" ||
      edge.to.status === "commandControl";

    const isCompromised = fromCompromised || toCompromised;
    const isDDOSRelated =
      !!edge.isDDOSAttack || !!edge.from.isUnderDDOS || !!edge.to.isUnderDDOS;
    const isDatacenterBackbone =
      !!edge.isDatacenterVpnTunnel ||
      (edge.from.isDatacenter && edge.to.isDatacenter);

    const driftMin = Math.min(
      cfg.congestionDriftMin ?? 0.08,
      cfg.congestionDriftMax ?? 0.42
    );
    const driftMax = Math.max(
      cfg.congestionDriftMin ?? 0.08,
      cfg.congestionDriftMax ?? 0.42
    );
    const smoothing = clampValue(cfg.congestionSmoothing ?? 0.04, 0.01, 0.35);

    if (!Number.isFinite(model.congestion)) {
      model.congestion = randomRange(driftMin, driftMax);
    }
    if (!Number.isFinite(model.targetCongestion)) {
      model.targetCongestion = model.congestion;
    }
    if (!Number.isFinite(model.nextCongestionShiftAt)) {
      model.nextCongestionShiftAt =
        now +
        randomRange(
          cfg.congestionRetargetMinMs ?? 7000,
          cfg.congestionRetargetMaxMs ?? 18000
        );
    }

    if (now >= model.nextCongestionShiftAt) {
      const driftStep = Math.max(0.01, cfg.congestionDriftStep ?? 0.08);
      model.targetCongestion = clampValue(
        model.targetCongestion + randomRange(-driftStep, driftStep),
        driftMin,
        driftMax
      );
      model.nextCongestionShiftAt =
        now +
        randomRange(
          cfg.congestionRetargetMinMs ?? 7000,
          cfg.congestionRetargetMaxMs ?? 18000
        );
    }

    let congestion =
      model.congestion +
      (model.targetCongestion - model.congestion) * smoothing;
    model.congestion = congestion;
    if (isCompromised) congestion += cfg.compromisedCongestionBoost;
    if (isDDOSRelated) congestion += cfg.ddosCongestionBoost;
    if (isDatacenterBackbone) congestion = Math.min(congestion, 0.2);
    congestion = clampValue(congestion, 0, 1);

    // Topology boost: aggregate bandwidth swells on uplinks serving more downstream nodes.
    // Skip overlay/mesh edges - only applies to regular tree edges.
    let effectiveBaseline = model.baselineBandwidth;
    if (
      !edge.isBotnetMesh &&
      !edge.isWirelessLink &&
      !edge.isGuardianVpnTunnel &&
      !edge.isDatacenterVpnTunnel
    ) {
      const descendantCount = getEdgeTopoDescendantCount(edge, now);
      const cap = Math.max(1, cfg.topologyBandwidthDescendantCap ?? 15);
      const weight = clampValue(cfg.topologyBandwidthWeight ?? 0.55, 0, 1);
      const topologyNorm = Math.min(
        1,
        Math.log(1 + descendantCount) / Math.log(1 + cap)
      );
      effectiveBaseline =
        effectiveBaseline + (1.0 - effectiveBaseline) * topologyNorm * weight;
    }
    let bandwidth =
      effectiveBaseline * (1 - congestion * cfg.congestionBandwidthImpact);
    if (isCompromised) bandwidth *= 1 - cfg.compromisedBandwidthPenalty;
    if (isDDOSRelated) bandwidth *= 1 - cfg.ddosBandwidthPenalty;
    const highBaselineThreshold =
      cfg.highBandwidthPersistBaselineThreshold ?? cfg.highBandwidthThreshold;
    const persistFloor =
      cfg.highBandwidthPersistFloor ?? cfg.highBandwidthThreshold;
    const shouldPersistHighBandwidth =
      !isCompromised &&
      !isDDOSRelated &&
      model.baselineBandwidth >= highBaselineThreshold;
    if (shouldPersistHighBandwidth) {
      bandwidth = Math.max(bandwidth, persistFloor);
    }
    if (isDatacenterBackbone) {
      enforceDatacenterHighBandwidth(edge);
      bandwidth = Math.max(CONFIG.datacenter.highBandwidthFloor, bandwidth);
    }
    bandwidth = clampValue(bandwidth, cfg.minBandwidth, 1);

    let latencyMs =
      model.baselineLatencyMs * (1 + congestion * cfg.congestionLatencyImpact);
    if (isCompromised) latencyMs *= 1 + cfg.infectionLatencyPenalty;
    if (isDDOSRelated) latencyMs *= 1 + cfg.ddosLatencyPenalty;
    if (isDatacenterBackbone) {
      latencyMs = Math.min(latencyMs, model.baselineLatencyMs * 1.15);
    }

    let reliability =
      model.baselineReliability - congestion * cfg.congestionReliabilityImpact;
    if (isCompromised) reliability -= cfg.infectionReliabilityPenalty;
    if (isDDOSRelated) reliability -= cfg.ddosReliabilityPenalty;
    if (isDatacenterBackbone) {
      reliability = Math.max(reliability, 0.97);
    }
    reliability = clampValue(reliability, cfg.minReliability, 0.999);

    const latencyScore =
      1 - clampValue(latencyMs / cfg.maxLatencyForScoreMs, 0, 1);
    const qualityScore = clampValue(
      bandwidth * cfg.scoreWeights.bandwidth +
        latencyScore * cfg.scoreWeights.latency +
        reliability * cfg.scoreWeights.reliability,
      0,
      1
    );

    const snapshot = edge.linkQualitySnapshot || {};
    snapshot.bandwidth = bandwidth;
    snapshot.latencyMs = latencyMs;
    snapshot.reliability = reliability;
    snapshot.congestion = congestion;
    snapshot.qualityScore = qualityScore;
    snapshot.isCompromised = isCompromised;
    snapshot.isDDOSRelated = isDDOSRelated;
    snapshot.isDatacenterBackbone = isDatacenterBackbone;
    edge.linkQualitySnapshot = snapshot;

    return snapshot;
  }

  function updateLinkQualityMetrics(now = Date.now()) {
    let monitoredLinks = 0;
    let qualityTotal = 0;
    let latencyTotal = 0;
    let reliabilityTotal = 0;
    let congestedLinks = 0;
    let highBandwidthLinks = 0;

    getCurrentEdges().forEach((edge) => {
      if (!edge || !edge.from || !edge.to) return;
      if (edge.from.state !== "alive" || edge.to.state !== "alive") return;

      const snapshot = computeEdgeQualitySnapshot(edge, now);
      if (!snapshot) return;

      monitoredLinks += 1;
      qualityTotal += snapshot.qualityScore;
      latencyTotal += snapshot.latencyMs;
      reliabilityTotal += snapshot.reliability;

      if (snapshot.congestion >= CONFIG.linkQuality.congestedThreshold) {
        congestedLinks += 1;
      }
      if (snapshot.bandwidth >= CONFIG.linkQuality.highBandwidthThreshold) {
        highBandwidthLinks += 1;
      }
    });

    if (monitoredLinks === 0) {
      runtimeLinkMetrics.monitoredLinks = 0;
      runtimeLinkMetrics.avgQualityScore = 0;
      runtimeLinkMetrics.avgLatencyMs = 0;
      runtimeLinkMetrics.avgReliability = 0;
      runtimeLinkMetrics.congestedLinks = 0;
      runtimeLinkMetrics.highBandwidthLinks = 0;
      return;
    }

    runtimeLinkMetrics.monitoredLinks = monitoredLinks;
    runtimeLinkMetrics.avgQualityScore = qualityTotal / monitoredLinks;
    runtimeLinkMetrics.avgLatencyMs = latencyTotal / monitoredLinks;
    runtimeLinkMetrics.avgReliability = reliabilityTotal / monitoredLinks;
    runtimeLinkMetrics.congestedLinks = congestedLinks;
    runtimeLinkMetrics.highBandwidthLinks = highBandwidthLinks;
  }

  const LinkQualitySystem = {
    /**
     * Connect app-owned config, edge list, topology helper, and metrics target.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      if (options.metrics) {
        runtimeLinkMetrics = options.metrics;
      }
      return this;
    },

    getEdgeBetweenNodes,
    getNodeBandwidthGrowthScore,
    chooseBandwidthWeightedNode,
    enforceDatacenterHighBandwidth,
    normalizeBandwidthForRender,
    getEdgeFlowVisualState,
    getEdgeRenderWidth,
    getProtocolProfile,
    selectPacketProtocol,
    ensureEdgeQualityModel,
    computeEdgeQualitySnapshot,

    updateMetrics(now = Date.now()) {
      updateLinkQualityMetrics(now);
      return runtimeLinkMetrics;
    },
  };

  window.NodeNet.LinkQualitySystem = LinkQualitySystem;
})();
