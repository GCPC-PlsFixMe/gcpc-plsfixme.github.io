/**
 * @module GuardianNodeBehavior
 * @summary Guardian (threat-hunter) nodes — drawing plus VPN tunnel logic, promotion/demotion, and spawning.
 * @exports window.NodeNet.GuardianNodeBehavior (also registers "guardian" with NodeBehaviorRegistry)
 * @tags node-behavior, guardian, threat-hunter, vpn, tunnel, promote, defense, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  /* ── injected dependencies ───────────────────────────────────────── */
  let nodes = [];
  let edges = [];
  let healSpeedMultiplier = 1.0;
  let nodesHaveClearView = () => true;
  let ParticleSystem = null;
  let colors = null;
  let logEvent = () => {};
  let isPaused = false;

  function configure(deps = {}) {
    if (deps.nodes !== undefined) nodes = deps.nodes;
    if (deps.edges !== undefined) edges = deps.edges;
    if (deps.healSpeedMultiplier !== undefined) healSpeedMultiplier = deps.healSpeedMultiplier;
    if (deps.nodesHaveClearView !== undefined) nodesHaveClearView = deps.nodesHaveClearView;
    if (deps.ParticleSystem !== undefined) ParticleSystem = deps.ParticleSystem;
    if (deps.colors !== undefined) colors = deps.colors;
    if (deps.logEvent !== undefined) logEvent = deps.logEvent;
    if (deps.isPaused !== undefined) isPaused = deps.isPaused;
    return this;
  }

const GUARDIAN_VPN_TUNNEL_RANGE = 200;
const GUARDIAN_VPN_TUNNEL_LIMIT = 3;

function clearGuardianVpnTunnels(node) {
  if (!node || !node.guardianVpnTunnels) return;

  node.guardianVpnTunnels.forEach((tunnel) => {
    if (!tunnel || !tunnel.edge) return;
    const index = edges.indexOf(tunnel.edge);
    if (index !== -1) {
      edges.splice(index, 1);
    }
  });

  node.guardianVpnTunnels = [];
}

function updateGuardianVpnTunnels() {
  const now = Date.now();
  const GUARDIAN_VPN_TUNNEL_REFRESH_INTERVAL = 6000 / healSpeedMultiplier;
  const GUARDIAN_FIREWALL_ATTEMPT_DURATION = 2000 / healSpeedMultiplier;

  nodes.forEach((node) => {
    if (!node.guardianVpnTunnels) {
      node.guardianVpnTunnels = [];
    }

    const isActiveGuardian = node.isGuardian && node.state === "alive";

    if (!isActiveGuardian) {
      clearGuardianVpnTunnels(node);
      return;
    }

    // Clean up stale VPN tunnels (target removed, dead, or no clear view)
    node.guardianVpnTunnels = node.guardianVpnTunnels.filter((tunnel) => {
      if (!tunnel || !tunnel.edge || !tunnel.target) {
        return false;
      }
      if (tunnel.target.state !== "alive") {
        const idx = edges.indexOf(tunnel.edge);
        if (idx !== -1) edges.splice(idx, 1);
        return false;
      }
      // Remove if blocked beyond the one-branch VPN crossing allowance.
      if (!nodesHaveGuardianVpnReach(node, tunnel.target)) {
        const idx = edges.indexOf(tunnel.edge);
        if (idx !== -1) edges.splice(idx, 1);
        return false;
      }
      return true;
    });

    // Finalize firewall attempts
    node.guardianVpnTunnels.forEach((tunnel) => {
      if (!tunnel || !tunnel.firewallAttempt) return;
      const attempt = tunnel.firewallAttempt;
      if (attempt.completed) return;

      const elapsed = now - attempt.startTime;
      if (elapsed >= GUARDIAN_FIREWALL_ATTEMPT_DURATION) {
        attempt.completed = true;
        if (
          attempt.success &&
          tunnel.target &&
          tunnel.target.state === "alive" &&
          !tunnel.target.hasFirewall
        ) {
          tunnel.target.hasFirewall = true;
          tunnel.target.shieldStrength = Math.max(
            tunnel.target.shieldStrength,
            0.75
          );
          tunnel.target.shieldFlashTimer = 0;
          ParticleSystem.createPopParticles(
            tunnel.target.x,
            tunnel.target.y,
            colors.neonGreen
          );
          logEvent("guardianFirewallSuccess", {
            guardian: node,
            target: tunnel.target,
          });
        }
      }
    });

    if (
      now - node.lastGuardianBridgeUpdate <
      GUARDIAN_VPN_TUNNEL_REFRESH_INTERVAL
    ) {
      return;
    }

    node.lastGuardianBridgeUpdate = now;
    clearGuardianVpnTunnels(node);

    if (!node.guardianVpnTunnelCreationTimes) {
      node.guardianVpnTunnelCreationTimes = {};
    }

    const candidates = nodes
      .filter((target) => {
        if (!target || target === node) return false;
        if (target.state !== "alive") return false;
        if (target.parent === null) return false; // skip central node
        if (target.isSatellite) return false; // skip satellites - they don't need firewalls
        if (target.status !== "green") return false;
        const dx = target.x - node.x;
        const dy = target.y - node.y;
        const distance = Math.hypot(dx, dy);
        if (distance > GUARDIAN_VPN_TUNNEL_RANGE) return false;

        // Avoid duplicate guardian VPN tunnels only (overlays are allowed)
        const alreadyGuardianTunnel = edges.some((edge) => {
          if (!edge.from || !edge.to) return false;
          if (!edge.isGuardianVpnTunnel) return false;
          const sameDirection = edge.from === node && edge.to === target;
          const oppositeDirection =
            edge.from === target && edge.to === node;
          return sameDirection || oppositeDirection;
        });
        if (alreadyGuardianTunnel) return false;

        return true;
      })
      .sort((a, b) => {
        const da = Math.hypot(a.x - node.x, a.y - node.y);
        const db = Math.hypot(b.x - node.x, b.y - node.y);
        return da - db;
      })
      .slice(0, GUARDIAN_VPN_TUNNEL_LIMIT);

    candidates.forEach((target) => {
      // Skip if blocked beyond the one-branch VPN crossing allowance.
      if (!nodesHaveGuardianVpnReach(node, target)) return;

      const creationKey = String(target.id);
      if (!node.guardianVpnTunnelCreationTimes[creationKey]) {
        node.guardianVpnTunnelCreationTimes[creationKey] = now;
      }

      const edge = {
        from: node,
        to: target,
        isGuardianVpnTunnel: true,
        guardianOwnerId: node.id,
        createdAt: node.guardianVpnTunnelCreationTimes[creationKey],
      };
      edges.push(edge);

      const tunnel = {
        edge,
        target,
        firewallAttempt: null,
      };

      if (!target.hasFirewall) {
        const success = Math.random() < 0.75;
        tunnel.firewallAttempt = {
          startTime: now,
          success,
          completed: false,
        };
        edge.guardianFirewallAttempt = tunnel.firewallAttempt;
        node.lastGuardianFirewallAttempt = now;
      } else {
        edge.guardianFirewallAttempt = null;
      }

      node.guardianVpnTunnels.push(tunnel);
      logEvent("guardianVpnCreated", { guardian: node, target });
    });

    const selectedTargetIds = new Set(candidates.map((t) => String(t.id)));
    Object.keys(node.guardianVpnTunnelCreationTimes).forEach((key) => {
      if (!selectedTargetIds.has(key)) {
        delete node.guardianVpnTunnelCreationTimes[key];
      }
    });
  });
}

function nodesHaveGuardianVpnReach(nodeA, nodeB) {
  if (nodesHaveClearView(nodeA, nodeB)) return true;
  if (!nodeA || !nodeB) return false;

  const ax = nodeA.x;
  const ay = nodeA.y;
  const bx = nodeB.x;
  const by = nodeB.y;
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSquared = abx * abx + aby * aby;
  if (abLengthSquared === 0) return false;

  for (const node of nodes) {
    if (node === nodeA || node === nodeB) continue;
    if (node.state !== "alive" || node.isSatellite) continue;
    const apx = node.x - ax;
    const apy = node.y - ay;
    let t = (apx * abx + apy * aby) / abLengthSquared;
    t = Math.max(0, Math.min(1, t));
    const closestX = ax + abx * t;
    const closestY = ay + aby * t;
    const clearance = node.radius + 12;
    if (Math.hypot(node.x - closestX, node.y - closestY) < clearance) {
      return false;
    }
  }

  let crossedBranches = 0;
  for (const edge of edges) {
    if (!edge || !edge.from || !edge.to) continue;
    if (edge.from === nodeA || edge.from === nodeB || edge.to === nodeA || edge.to === nodeB) continue;
    if (edge.isWirelessLink || edge.isGuardianVpnTunnel || edge.isDatacenterVpnTunnel || edge.isBotnetMesh || edge.isDDOSAttack) continue;
    if (
      window.NodeNet.Geometry.segmentsIntersect(
        ax,
        ay,
        bx,
        by,
        edge.from.x,
        edge.from.y,
        edge.to.x,
        edge.to.y
      )
    ) {
      crossedBranches += 1;
      if (crossedBranches > 1) return false;
    }
  }
  return true;
}



function promoteToGuardian(node, logKey, extraContext = {}) {
  if (
    !node ||
    node.parent === null ||
    node.state !== "alive" ||
    node.isGuardian ||
    node.isGroundStation ||
    node.isSatellite
  ) {
    return false;
  }

  if (node.isDatacenter) {
    window.NodeNet.DatacenterNodeBehavior.demoteDatacenter(node, "promoted to guardian");
  }

  node.isGuardian = true;
  node.hasFirewall = true;
  node.shieldStrength = Math.max(node.shieldStrength, 0.8);
  node.currentColor = { ...colors.white };
  node.targetRadius = node.baseRadius * 1.15;
  node.guardianStreamCount = 0;
  clearGuardianVpnTunnels(node);
  node.lastGuardianBridgeUpdate = 0;
  node.lastGuardianFirewallAttempt = 0;
  ParticleSystem.createPopParticles(node.x, node.y, colors.white);

  if (logKey) {
    logEvent(logKey, { node, ...extraContext });
  }

  return true;
}

function demoteGuardian(node, logKey, extraContext = {}) {
  if (!node || !node.isGuardian) return;

  clearGuardianVpnTunnels(node);
  node.guardianVpnTunnelCreationTimes = null;
  node.isGuardian = false;
  node.guardianStreamCount = 0;
  node.guardianImmunityLastSpawn = 0;
  node.hasFirewall = false;

  if (logKey) {
    logEvent(logKey, { node, ...extraContext });
  }
}

function trySpawnGuardian(node) {
  if (
    !node ||
    node.parent === null ||
    node.state !== "alive" ||
    node.isGuardian ||
    node.isGroundStation ||
    node.isSatellite
  )
    return;

  const GUARDIAN_SPAWN_CHANCE = 0.25;
  if (Math.random() >= GUARDIAN_SPAWN_CHANCE) return;

  promoteToGuardian(node, "guardianPromotionPhishing");
}

  /* ── drawing behaviour (registered with NodeBehaviorRegistry) ─────── */

  function matches(node) {
    return node.isGuardian;
  }

  function drawIcon(node) {
    const ctx = Registry.getCtx();
    if (!ctx) return;
    const iconSize = node.radius * 1.3;
    if (iconSize < 4) return;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    ctx.fillText("🕶", 0, iconSize * 0.05);
    ctx.restore();
  }

  function drawEffects(/* node */) { /* no-op */ }

  if (Registry) {
    Registry.register({
      name: "guardian-node",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }

  window.NodeNet.GuardianNodeBehavior = {
    configure,
    clearGuardianVpnTunnels,
    updateGuardianVpnTunnels,
    promoteToGuardian,
    demoteGuardian,
    trySpawnGuardian,
  };
})();
