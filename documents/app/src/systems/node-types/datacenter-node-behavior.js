/**
 * @module DatacenterNodeBehavior
 * @summary Datacenter (infrastructure aggregation) nodes — drawing, cluster evaluation, VPN mesh, and role transitions.
 * @exports window.NodeNet.DatacenterNodeBehavior (also registers "datacenter" with NodeBehaviorRegistry)
 * @tags node-behavior, datacenter, cluster, vpn-mesh, fortify, infrastructure, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  /* ── injected dependencies ───────────────────────────────────────── */
  let nodes = [];
  let edges = [];
  let CONFIG = null;
  let clampValue = (v) => v;
  let nodesHaveClearView = () => true;
  let getEdgeBetweenNodes = () => null;
  let LinkQualitySystem = null;
  let logEvent = () => {};
  let healSpeedMultiplier = 1.0;
  let colors = null;
  let countDescendants = () => 0;
  let ParticleSystem = null;

  function configure(deps = {}) {
    if (deps.nodes !== undefined) nodes = deps.nodes;
    if (deps.edges !== undefined) edges = deps.edges;
    if (deps.CONFIG !== undefined) CONFIG = deps.CONFIG;
    if (deps.clampValue !== undefined) clampValue = deps.clampValue;
    if (deps.nodesHaveClearView !== undefined) nodesHaveClearView = deps.nodesHaveClearView;
    if (deps.getEdgeBetweenNodes !== undefined) getEdgeBetweenNodes = deps.getEdgeBetweenNodes;
    if (deps.LinkQualitySystem !== undefined) LinkQualitySystem = deps.LinkQualitySystem;
    if (deps.logEvent !== undefined) logEvent = deps.logEvent;
    if (deps.healSpeedMultiplier !== undefined) healSpeedMultiplier = deps.healSpeedMultiplier;
    if (deps.colors !== undefined) colors = deps.colors;
    if (deps.countDescendants !== undefined) countDescendants = deps.countDescendants;
    if (deps.ParticleSystem !== undefined) ParticleSystem = deps.ParticleSystem;
    return this;
  }

function isDatacenterEligibleNode(node) {
  return (
    !!node &&
    node.state === "alive" &&
    node.parent !== null &&
    node.status === "green" &&
    !node.isSatellite &&
    !node.isGroundStation &&
    !node.isGuardian
  );
}

function isDatacenterRetainable(node) {
  return (
    !!node &&
    node.state === "alive" &&
    node.parent !== null &&
    node.status !== "malware" &&
    node.status !== "botnet" &&
    node.status !== "commandControl" &&
    !node.isSatellite
  );
}

function clearDatacenterVpnTunnelsForNode(node) {
  if (!node) return;
  for (let i = edges.length - 1; i >= 0; i--) {
    const edge = edges[i];
    if (
      edge.isDatacenterVpnTunnel &&
      (edge.from === node || edge.to === node)
    ) {
      edges.splice(i, 1);
    }
  }
}

function demoteDatacenter(node, reason = "cluster degraded") {
  if (!node || !node.isDatacenter) return;

  clearDatacenterVpnTunnelsForNode(node);
  node.isDatacenter = false;
  node.datacenterFormedAt = 0;
  node.lastDatacenterFortifyAt = 0;

  if (
    node.state === "alive" &&
    node.status === "green" &&
    !node.isGuardian &&
    !node.isGroundStation
  ) {
    node.currentColor = {
      ...(node.hasFirewall ? colors.neonGreen : colors.green),
    };
  }

  logEvent("datacenterDissolved", { node, reason });
}

function selectDatacenterRepresentative(cluster) {
  if (!cluster || cluster.length === 0) return null;

  let bestNode = cluster[0];
  let bestScore = -Infinity;
  cluster.forEach((node) => {
    const descendantScore = countDescendants(node);
    const score =
      descendantScore +
      (node.children ? node.children.length : 0) * 1.2 +
      (node.hasFirewall ? 2 : 0) -
      getNodeDepth(node) * 0.25;

    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  });

  return bestNode;
}

function promoteToDatacenter(node, clusterSize = 0, now = Date.now()) {
  if (!node || node.isDatacenter || !isDatacenterEligibleNode(node)) {
    return false;
  }

  node.isDatacenter = true;
  node.datacenterFormedAt = now;
  node.lastDatacenterFortifyAt = 0;
  node.hasFirewall = true;
  node.shieldStrength = 1.0; // Datacenter always starts with full shield
  node.currentColor = { ...colors.datacenter };
  ParticleSystem.createPopParticles(node.x, node.y, colors.datacenter);
  logEvent("datacenterFormed", { node, clusterSize });

  return true;
}

function evaluateDatacenterClusters(now = Date.now()) {
  const cfg = CONFIG.datacenter;
  const creationThreshold = Math.max(1, cfg.minClusterSize || 6);
  const retentionThreshold = clampValue(
    cfg.retainClusterSize ?? creationThreshold,
    1,
    creationThreshold
  );
  const eligibleNodes = nodes.filter(isDatacenterEligibleNode);

  const visited = new Set();
  const clusters = [];

  const buildCluster = (startNode) => {
    const stack = [startNode];
    const cluster = [];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || visited.has(node.id) || !isDatacenterEligibleNode(node)) {
        continue;
      }

      visited.add(node.id);
      cluster.push(node);

      const neighbors = [];
      if (node.parent) neighbors.push(node.parent);
      if (node.children && node.children.length > 0) {
        node.children.forEach((child) => neighbors.push(child));
      }

      neighbors.forEach((neighbor) => {
        if (
          neighbor &&
          !visited.has(neighbor.id) &&
          isDatacenterEligibleNode(neighbor)
        ) {
          stack.push(neighbor);
        }
      });
    }

    return cluster;
  };

  eligibleNodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const cluster = buildCluster(node);
    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  });

  clusters.sort((a, b) => b.length - a.length);

  const selectedDatacenterIds = new Set();
  let promotedCount = 0;

  clusters.forEach((cluster) => {
    const existingDatacenters = cluster.filter((node) => node.isDatacenter);

    if (cluster.length < retentionThreshold) {
      existingDatacenters.forEach((node) =>
        demoteDatacenter(node, "cluster below threshold")
      );
      return;
    }

    if (promotedCount >= cfg.maxDatacenters && existingDatacenters.length === 0) {
      return;
    }

    let chosenDatacenter = existingDatacenters[0] || null;
    if (!chosenDatacenter && cluster.length >= creationThreshold) {
      chosenDatacenter = selectDatacenterRepresentative(cluster);
      if (chosenDatacenter) {
        promoteToDatacenter(chosenDatacenter, cluster.length, now);
      }
    }

    if (!chosenDatacenter) return;

    selectedDatacenterIds.add(chosenDatacenter.id);
    promotedCount += 1;

    existingDatacenters.forEach((node) => {
      if (node !== chosenDatacenter) {
        demoteDatacenter(node, "cluster consolidated");
      }
    });
  });

  // Preserve existing datacenters that are temporarily degraded (yellow/red) but not
  // yet compromised — they keep their role until they recover or get truly infected.
  nodes.forEach((node) => {
    if (
      node.isDatacenter &&
      isDatacenterRetainable(node) &&
      !selectedDatacenterIds.has(node.id) &&
      promotedCount < cfg.maxDatacenters
    ) {
      selectedDatacenterIds.add(node.id);
    }
  });

  nodes.forEach((node) => {
    if (!node.isDatacenter) return;

    const retainable = isDatacenterRetainable(node);
    if (!retainable || !selectedDatacenterIds.has(node.id)) {
      demoteDatacenter(node, retainable ? "rebalanced" : "node unhealthy");
    }
  });
}

function updateDatacenterVpnMesh(now = Date.now()) {
  const cfg = CONFIG.datacenter;

  // A node qualifies as a VPN peer if it is an active datacenter OR an alive ground station.
  const isVpnPeer = (node) =>
    node &&
    ((node.isDatacenter && isDatacenterEligibleNode(node)) ||
     (node.isGroundStation && node.state === "alive"));

  // Remove stale datacenter VPN tunnels in-place so the shared array reference
  // is preserved (edges.filter would create a new local array).
  for (let i = edges.length - 1; i >= 0; i--) {
    const edge = edges[i];
    if (!edge.isDatacenterVpnTunnel) continue;
    if (!edge.from || !edge.to) {
      edges.splice(i, 1);
      continue;
    }

    const fromActive = isVpnPeer(edge.from);
    const toActive   = isVpnPeer(edge.to);
    const distance   = Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y);
    const hasLoS     = nodesHaveClearView(edge.from, edge.to);

    const valid = fromActive && toActive && hasLoS && distance <= cfg.vpnRange;
    if (!valid) {
      logEvent("datacenterVpnExpired", {
        fromNode: edge.from,
        toNode: edge.to,
      });
      edges.splice(i, 1);
      continue;
    }

    LinkQualitySystem.enforceDatacenterHighBandwidth(edge);
  }

  // All VPN-eligible peers: datacenters + ground stations
  const vpnPeers = nodes.filter(isVpnPeer);
  if (vpnPeers.length < 2) return;

  const tunnelCounts = new Map(vpnPeers.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    if (!edge.isDatacenterVpnTunnel || !edge.from || !edge.to) return;
    if (tunnelCounts.has(edge.from.id))
      tunnelCounts.set(edge.from.id, (tunnelCounts.get(edge.from.id) || 0) + 1);
    if (tunnelCounts.has(edge.to.id))
      tunnelCounts.set(edge.to.id, (tunnelCounts.get(edge.to.id) || 0) + 1);
  });

  for (let i = 0; i < vpnPeers.length; i++) {
    const fromNode = vpnPeers[i];
    for (let j = i + 1; j < vpnPeers.length; j++) {
      const toNode = vpnPeers[j];

      const distance = Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y);
      if (distance > cfg.vpnRange) continue;
      if (!nodesHaveClearView(fromNode, toNode)) continue;

      const existingVpn = edges.find((e) =>
        e.isDatacenterVpnTunnel &&
        ((e.from === fromNode && e.to === toNode) ||
         (e.from === toNode && e.to === fromNode))
      );
      if (existingVpn) {
        LinkQualitySystem.enforceDatacenterHighBandwidth(existingVpn);
        continue;
      }

      if ((tunnelCounts.get(fromNode.id) || 0) >= cfg.vpnTunnelLimitPerNode)
        continue;
      if ((tunnelCounts.get(toNode.id) || 0) >= cfg.vpnTunnelLimitPerNode)
        continue;
      if (Math.random() > cfg.vpnCreateChance) continue;

      const tunnelEdge = {
        from: fromNode,
        to: toNode,
        isDatacenterVpnTunnel: true,
        createdAt: now,
        pulseSeed: Math.random() * Math.PI * 2,
      };
      LinkQualitySystem.enforceDatacenterHighBandwidth(tunnelEdge);
      edges.push(tunnelEdge);
      tunnelCounts.set(fromNode.id, (tunnelCounts.get(fromNode.id) || 0) + 1);
      tunnelCounts.set(toNode.id, (tunnelCounts.get(toNode.id) || 0) + 1);

      logEvent("datacenterVpnCreated", { fromNode, toNode });
    }
  }
}



function fortifyUpstreamFromDatacenters(now = Date.now()) {
  const cfg = CONFIG.datacenter;
  const fortifyIntervalMs = cfg.fortifyIntervalMs / Math.max(0.25, healSpeedMultiplier);

  const activeDatacenters = nodes.filter(
    (node) => node.isDatacenter && isDatacenterEligibleNode(node)
  );

  activeDatacenters.forEach((datacenter) => {
    if (
      datacenter.lastDatacenterFortifyAt &&
      now - datacenter.lastDatacenterFortifyAt < fortifyIntervalMs
    ) {
      return;
    }

    datacenter.lastDatacenterFortifyAt = now;

    let current = datacenter.parent;
    let hops = 0;

    while (current && current.parent !== null && hops < cfg.fortifyMaxHops) {
      if (current.state !== "alive") break;

      if (
        current.status === "green" &&
        !current.hasFirewall &&
        Math.random() < cfg.fortifyChancePerHop
      ) {
        current.hasFirewall = true;
        current.shieldStrength = Math.max(current.shieldStrength || 0, 0.75);
        current.shieldFlashTimer = 0;
        ParticleSystem.createPopParticles(current.x, current.y, colors.neonGreen);
        logEvent("datacenterFortified", { datacenter, node: current });
      }

      current = current.parent;
      hops += 1;
    }
  });
}

  /* ── drawing behaviour (registered with NodeBehaviorRegistry) ─────── */

  function matches(node) {
    return node.isDatacenter;
  }

  function drawIcon(node) {
    const ctx = Registry.getCtx();
    const cfg = Registry.getConfig();
    if (!ctx) return;
    const iconSize = node.radius * 1.18;
    if (iconSize < 4) return;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = `rgba(0, 0, 0, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    ctx.fillText(cfg.datacenter.icon || "🏢", 0, iconSize * 0.08);
    ctx.restore();
  }

  function drawEffects(/* node */) { /* no-op */ }

  if (Registry) {
    Registry.register({
      name: "datacenter-node",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }

  window.NodeNet.DatacenterNodeBehavior = {
    configure,
    isDatacenterEligibleNode,
    isDatacenterRetainable,
    demoteDatacenter,
    selectDatacenterRepresentative,
    promoteToDatacenter,
    evaluateDatacenterClusters,
    updateDatacenterVpnMesh,
    fortifyUpstreamFromDatacenters,
  };
})();
