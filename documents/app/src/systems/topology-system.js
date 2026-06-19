/**
 * @module TopologySystem
 * @summary Network tree structure — branch sprouting, growth, pruning, crossing resolution, leaf expansion.
 * @description Public API: `configure(deps)` then per-tick `updateNetworkTopology()`,
 *   plus sprout/grow/prune/markBranchForRetraction/resolveCrossings/spontaneouslySprout
 *   helpers. Respects branch-count, depth, density, and sprout/prune balance controls.
 * @exports window.NodeNet.TopologySystem
 * @tags topology, tree, sprout, grow, prune, retract, crossings, branches, network-density
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────── */
  let nodes = [];
  let edges = [];
  let pulses = [];
  let getNodes = () => nodes;
  let getEdges = () => edges;
  let getPulses = () => pulses;
  let setPulses = (v) => { pulses = v; };
  let canvasRef = null;
  let padding = 0;
  let createNode = null;
  let desiredBranchCount = 6;
  let MAX_BRANCH_DEPTH = 8;
  let networkSoftCap = 200;
  let getMaxBranchDepth = () => MAX_BRANCH_DEPTH;
  let getNetworkSoftCap = () => networkSoftCap;
  let sproutMultiplier = 1.0;
  let pruneMultiplier = 1.0;
  let healSpeedMultiplier = () => 1;
  let simSpeedMultiplier = () => 1;
  let isPausedRef = () => false;
  let simulationStartTimeRef = { value: 0 };
  let lastCrossingCheckRef = { value: 0 };
  let initialBranchTimeoutRef = { value: null };

  /* ── injected functions ─────────────────────────────────────────────── */
  let logEventFn = () => {};
  let incrementStatFn = () => {};
  let getLogNodeRefFn = () => "";
  let countDescendantsFn = () => 0;
  let getNodeDepthFn = () => 0;
  let clearDepthCacheFn = () => {};
  let isDescendantFn = () => false;
  let getRootBranchFn = () => null;
  let getNodeBandwidthGrowthScoreFn = () => 1;
  let chooseBandwidthWeightedNodeFn = () => null;
  let clampValueFn = (v) => v;
  let linesIntersectFn = () => false;
  let segmentsIntersectFn = () => false;
  let pointToLineDistanceFn = () => 0;
  let segmentCrossesExistingEdgesFn = () => false;
  let nudgeEndpointToAvoidCrossingFn = () => null;

  /* ── collision helpers ──────────────────────────────────────────────── */

  /**
   * Returns the parameter t (0-1 along segment AB) where lines AB and CD intersect,
   * or null if they are parallel.
   */
  function getLineIntersectionT(ax, ay, bx, by, cx, cy, dx, dy) {
    const denom = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / denom;
    return t;
  }

  /**
   * Returns the parameter t (0-1) of the closest point on segment AB to point P.
   */
  function closestPointOnSegmentT(ax, ay, bx, by, px, py) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return 0;
    let t = (apx * abx + apy * aby) / abLenSq;
    return Math.max(0, Math.min(1, t));
  }

  /**
   * Walks the proposed segment parent->endpoint and returns the first collision
   * point with an existing edge or node.  If there is no collision, returns null.
   * The returned point is backed off by a small buffer so the new node does not
   * sit exactly on the obstacle.
   */
  function clampEndpointToCollision(parentNode, endpoint) {
    const px = parentNode.x, py = parentNode.y;
    const ex = endpoint.x, ey = endpoint.y;
    let closestT = 1;
    const BACKOFF = 0.03; // 3 % of segment length before collision

    // 1. Edge-edge intersections
    for (const edge of edges) {
      if (!edge.from || !edge.to || edge.from.state !== "alive" || edge.to.state !== "alive") continue;
      if (edge.from === parentNode || edge.to === parentNode) continue;
      if (edge.isBotnetMesh || edge.isGuardianVpnTunnel || edge.isDatacenterVpnTunnel ||
          edge.isWirelessLink || edge.isDDOSAttack) continue;

      if (segmentsIntersectFn(px, py, ex, ey, edge.from.x, edge.from.y, edge.to.x, edge.to.y)) {
        const t = getLineIntersectionT(px, py, ex, ey, edge.from.x, edge.from.y, edge.to.x, edge.to.y);
        if (t !== null && t >= 0 && t < closestT) {
          closestT = Math.max(0, t - BACKOFF);
        }
      }
    }

    // 2. Node proximity (segment passes through a node's circular zone)
    const NODE_CLEARANCE = 22;
    for (const node of nodes) {
      if (node === parentNode || node.state !== "alive") continue;
      if (node.isSatellite) continue;

      const t = closestPointOnSegmentT(px, py, ex, ey, node.x, node.y);
      const projX = px + (ex - px) * t;
      const projY = py + (ey - py) * t;
      const dist = Math.hypot(projX - node.x, projY - node.y);
      if (dist < node.radius + NODE_CLEARANCE && t < closestT) {
        closestT = Math.max(0, t - BACKOFF);
      }
    }

    if (closestT < 1) {
      return { x: px + (ex - px) * closestT, y: py + (ey - py) * closestT };
    }
    return null;
  }

  /* ── helpers ────────────────────────────────────────────────────────── */
  function refresh() {
    nodes = getNodes();
    edges = getEdges();
    pulses = getPulses();
  }

  function applyParentStatusToChild(parentNode, childNode) {
    if (!parentNode || !childNode) return;
    if (childNode.isSatellite) return;
    if (
      parentNode.status === "red" || parentNode.status === "yellow" ||
      parentNode.status === "malware" || parentNode.status === "botnet" ||
      parentNode.status === "commandControl"
    ) {
      childNode.status = "yellow";
      childNode.statusChangedAt = Date.now();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     createGraph  —  reset and build initial network
     ══════════════════════════════════════════════════════════════════════ */

  function createGraph() {
    refresh();
    simulationStartTimeRef.value = Date.now();
    clearTimeout(initialBranchTimeoutRef.value);
    nodes.length = 0;
    edges.length = 0;
    pulses.length = 0;

    const canvas = canvasRef;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const root = createNode(0, centerX, centerY);
    root.baseRadius = 30;
    root.currentColor = { r: 59, g: 130, b: 246 };
    root.status = "blue";
    root.state = "alive";
    root.opacity = 1;
    root.radius = root.baseRadius;
    root.forceMultiplier = 1.0;
    nodes.push(root);

    createInitialBranches(0, desiredBranchCount);
  }

  function createInitialBranches(index, total) {
    if (index >= total) return;
    const angle = (index / total) * Math.PI * 2;
    sproutNewBranch(angle);
    initialBranchTimeoutRef.value = setTimeout(
      () => createInitialBranches(index + 1, total), 800
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     sproutNewBranch  —  create new main branch from center
     ══════════════════════════════════════════════════════════════════════ */

    /* ="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""=
     scorePosition  —  evaluate a candidate position for node placement
     ="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""= */

  function scorePosition(x, y, parentNode) {
    let score = 100;
    const canvas = canvasRef;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const PERSONAL_SPACE = 55;
    for (const node of nodes) {
      if (node.state !== "alive" || node === parentNode) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PERSONAL_SPACE) score -= (PERSONAL_SPACE - dist) * 2.5;
    }

    const EDGE_CLEARANCE = 35;
    for (const edge of edges) {
      if (!edge.from || !edge.to || edge.from.state !== "alive" || edge.to.state !== "alive") continue;
      if (edge.isBotnetMesh || edge.isGuardianVpnTunnel || edge.isDatacenterVpnTunnel || edge.isWirelessLink || edge.isDDOSAttack) continue;
      const dist = pointToLineDistanceFn(x, y, edge.from.x, edge.from.y, edge.to.x, edge.to.y);
      if (dist < EDGE_CLEARANCE) score -= (EDGE_CLEARANCE - dist) * 1.5;
    }

    const parentDist = Math.sqrt((x - parentNode.x) ** 2 + (y - parentNode.y) ** 2);
    const isFirstGen = parentNode.parent === null;
    const idealDist = isFirstGen ? 180 : 70;
    score -= Math.abs(parentDist - idealDist) * 0.6;

    const parentAngleFromCenter = Math.atan2(parentNode.y - centerY, parentNode.x - centerX);
    const candidateAngleFromCenter = Math.atan2(y - centerY, x - centerX);
    const parentDistFromCenter = Math.sqrt((parentNode.x - centerX) ** 2 + (parentNode.y - centerY) ** 2);
    const candidateDistFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

    if (candidateDistFromCenter > parentDistFromCenter) score += 15;

    let angleDiff = Math.abs(candidateAngleFromCenter - parentAngleFromCenter);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    score += Math.max(0, 12 - angleDiff * 6);

    const SOFT_BOUNDARY = 80;
    const HARD_BOUNDARY = 40;
    const distToLeft = x - padding;
    const distToRight = canvas.width - padding - x;
    const distToTop = y - padding;
    const distToBottom = canvas.height - padding - y;
    const minDistToBoundary = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    if (minDistToBoundary < HARD_BOUNDARY) score -= (HARD_BOUNDARY - minDistToBoundary) * 5;
    else if (minDistToBoundary < SOFT_BOUNDARY) score -= (SOFT_BOUNDARY - minDistToBoundary) * 1.5;

    if (parentNode && segmentCrossesExistingEdgesFn(parentNode, { x, y })) score -= 1000;
    return score;
  }

  /* ="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""=
     findOptimalBranchPosition  —  search for best node placement
     ="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""="""= */

  function findOptimalBranchPosition(parentNode, angle, distance, samples = 8) {
    const allCandidates = [];
    const parentAnchorX = Number.isFinite(parentNode.anchorX) ? parentNode.anchorX : parentNode.baseX;
    const parentAnchorY = Number.isFinite(parentNode.anchorY) ? parentNode.anchorY : parentNode.baseY;

    const sampleOnce = (count, cone = Math.PI / 3, distJitter = 0.2) => {
      const candidates = [];
      for (let i = 0; i < count; i++) {
        const angleVariation = (i / count - 0.5) * cone;
        const testAngle = angle + angleVariation;
        const distVariation = distance * (1 - distJitter + Math.random() * (2 * distJitter));
        const x = parentAnchorX + Math.cos(testAngle) * distVariation;
        const y = parentAnchorY + Math.sin(testAngle) * distVariation;
        const canvas = canvasRef;
        const clampedX = Math.max(padding, Math.min(canvas.width - padding, x));
        const clampedY = Math.max(padding, Math.min(canvas.height - padding, y));
        const candidate = { x: clampedX, y: clampedY, angle: testAngle };
        candidate.score = scorePosition(candidate.x, candidate.y, parentNode);
        candidates.push(candidate);
        allCandidates.push(candidate);
      }
      const safe = candidates.filter((c) => !segmentCrossesExistingEdgesFn(parentNode, c));
      if (safe.length > 0) { safe.sort((a, b) => b.score - a.score); return safe[0]; }
      return null;
    };

    const attempts = [
      { count: samples, cone: Math.PI / 3, jitter: 0.2 },
      { count: Math.max(12, samples + 4), cone: Math.PI / 2, jitter: 0.3 },
      { count: Math.max(18, samples + 10), cone: (2 * Math.PI) / 3, jitter: 0.35 },
    ];

    for (const a of attempts) {
      const pick = sampleOnce(a.count, a.cone, a.jitter);
      if (pick) return pick;
    }

    allCandidates.sort((a, b) => b.score - a.score);
    return allCandidates[0] || { x: parentNode.x, y: parentNode.y, angle };
  }

  function setTopologyAnchor(node, x = node.x, y = node.y, branchAngle = null) {
    if (!node) return;
    node.anchorX = x;
    node.anchorY = y;
    if (Number.isFinite(branchAngle)) node.branchAngle = branchAngle;
  }

function sproutNewBranch(angle = null) {
    refresh();
    const root = nodes[0];
    let newAngle = angle;

    if (newAngle === null) {
      const mainBranches = root.children.filter((n) => n.state !== "retracting");
      if (mainBranches.length < 2) {
        newAngle = Math.random() * Math.PI * 2;
      } else {
        const angles = mainBranches
          .map((branch) => Math.atan2(branch.baseY - root.baseY, branch.baseX - root.baseX))
          .sort((a, b) => a - b);
        let maxGap = 0;
        let angleForMaxGap = 0;

        for (let i = 0; i < angles.length; i++) {
          const nextAngle = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
          const gap = nextAngle - angles[i];
          if (gap > maxGap) { maxGap = gap; angleForMaxGap = angles[i]; }
        }
        newAngle = angleForMaxGap + maxGap / 2;
      }
    }

    const maxDepth = getMaxBranchDepth();
    let branchDepth = Math.max(1, maxDepth - 1);
    const targetDist = 105 + Math.random() * 70;

    const optimal = findOptimalBranchPosition(root, newAngle, targetDist, 12);
    let endpoint = { x: optimal.x, y: optimal.y };
    let growthAngle = optimal.angle;

    const clamped = clampEndpointToCollision(root, endpoint);
    if (clamped) endpoint = clamped;
    const distFromRoot = Math.hypot(endpoint.x - root.x, endpoint.y - root.y);
    if (distFromRoot < 25) return;

    const mainNode = createNode(Date.now() + Math.random(), endpoint.x, endpoint.y, root);
    setTopologyAnchor(mainNode, endpoint.x, endpoint.y, newAngle);
    mainNode.branchLane = 0;
    root.children.push(mainNode);
    nodes.push(mainNode);
    edges.push({ from: root, to: mainNode });
    applyParentStatusToChild(root, mainNode);

    growBranchSequentially(mainNode, branchDepth, growthAngle);
    root.pulseEffect = 1;

    if (window.NodeNet?.SatelliteSystem) {
      window.NodeNet.SatelliteSystem.scheduleGroundStationPromotion(mainNode);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     growBranchSequentially  —  recursive child node spawning
     ══════════════════════════════════════════════════════════════════════ */

  function growBranchSequentially(parentNode, depth, parentAngle) {
    refresh();
    if (depth <= 0) return;
    if (getNodeDepthFn(parentNode) >= getMaxBranchDepth()) return;
    if (parentNode.isGroundStation) return;

    const bandwidthScore = getNodeBandwidthGrowthScoreFn(parentNode, Date.now());
    let numChildren = Math.floor(Math.random() * 3);
    const cfg = window.NodeNetConfig || {};
    const bandwidthBias = Math.max(0, bandwidthScore - 1) * (cfg.linkQuality?.branchSequentialBandwidthBias || 0);
    if (Math.random() < bandwidthBias) numChildren += 1;
    const lowBandwidthTrimChance = Math.max(0, 1 - bandwidthScore) * (cfg.linkQuality?.branchSequentialBandwidthBias || 0);
    if (numChildren > 0 && Math.random() < lowBandwidthTrimChance) numChildren -= 1;
    numChildren = Math.max(0, Math.min(3, numChildren));

    for (let i = 0; i < numChildren; i++) {
      setTimeout(() => {
        if (parentNode.state === "retracting" || parentNode.state === "dead") return;
        if (parentNode.isGroundStation) return;

        refresh();
        const canvas = canvasRef;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const guideAngle = Number.isFinite(parentNode.branchAngle)
          ? parentNode.branchAngle
          : Math.atan2(parentNode.baseY - centerY, parentNode.baseX - centerX);
        const depthRatio = getNodeDepthFn(parentNode) / Math.max(1, getMaxBranchDepth());
        const spread = 0.55 + depthRatio * 0.25;
        let angleOffset;
        if (numChildren <= 1) {
          angleOffset = (Math.random() < 0.5 ? -1 : 1) * spread * 0.55;
        } else if (numChildren === 2) {
          angleOffset = (i === 0 ? -1 : 1) * spread;
        } else {
          angleOffset = (i === 0) ? -spread : (i === 1) ? 0 : spread;
        }
        const blendedAngle = guideAngle + angleOffset + (Math.random() - 0.5) * 0.08;
        const dist = 95 + Math.random() * 35 - depthRatio * 12;

        const optimal = findOptimalBranchPosition(parentNode, blendedAngle, dist);
        let endpoint = { x: optimal.x, y: optimal.y };

        const clamped = clampEndpointToCollision(parentNode, endpoint);
        if (clamped) endpoint = clamped;
        const distFromParent = Math.hypot(endpoint.x - parentNode.x, endpoint.y - parentNode.y);
        if (distFromParent < 20) return;

        // Store the actual edge direction so children continue naturally
        const actualAngle = Math.atan2(endpoint.y - parentNode.y, endpoint.x - parentNode.x);

        const childNode = createNode(Date.now() + Math.random(), endpoint.x, endpoint.y, parentNode);
        setTopologyAnchor(childNode, endpoint.x, endpoint.y, actualAngle);
        childNode.branchLane = Math.sign(angleOffset) || (Math.random() < 0.5 ? -1 : 1);
        parentNode.children.push(childNode);
        nodes.push(childNode);
        edges.push({ from: parentNode, to: childNode });
        applyParentStatusToChild(parentNode, childNode);

        setTimeout(() => {
          growBranchSequentially(childNode, depth - 1, actualAngle);
        }, 1500);
      }, i * (1000 + Math.random() * 400));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     markBranchForRetraction  —  mark branch for removal
     ══════════════════════════════════════════════════════════════════════ */

  function markBranchForRetraction(node, options = {}) {
    if (!node) return;
    const allowGroundStation = options.allowGroundStation === true;

    if (node.isGroundStation) {
      if (window.NodeNet?.SatelliteSystem) {
        window.NodeNet.SatelliteSystem.removeSatelliteChain(node);
      }
      if (allowGroundStation) {
        node.isGroundStation = false;
        node.groundStationEstablishedAt = null;
        node.lastSatelliteLaunch = null;
        node.groundStationCountdown = 0;
        node.lastCountdownUpdate = null;
        node.satelliteChain = [];
        node.satelliteEdges = [];
      }
    }
    if (node.isSatellite && window.NodeNet?.SatelliteSystem) {
      window.NodeNet.SatelliteSystem.untetherSatellite(node);
    }

    node.state = "retracting";

    if (node.attachedImmunityPackets && node.attachedImmunityPackets.length > 0) {
      node.attachedImmunityPackets.forEach((packet) => {
        packet.active = false;
        packet.isAttached = false;
        packet.attachedNode = null;
      });
      node.attachedImmunityPackets = [];
      node.isImmunityHealing = false;
      node.immunityHealingStartTime = 0;
    }

    node.isTargeted = false;
    pulses = pulses.filter((p) => p.target !== node);

    node.children.forEach((child) => markBranchForRetraction(child, options));
  }

  /* ══════════════════════════════════════════════════════════════════════
     pruneRandomBranch  —  remove weighted-random branch
     ══════════════════════════════════════════════════════════════════════ */

  function pruneRandomBranch() {
    refresh();
    const now = Date.now();
    const potentialBranches = nodes.filter(
      (n) =>
        n.parent === nodes[0] && n.state === "alive" &&
        now - n.createdAt > 10000 &&
        n.status !== "botnet" && n.status !== "commandControl" &&
        !(window.NodeNet?.InfectionSystem?.hasBotnetMeshConnections(n))
    );

    if (potentialBranches.length > desiredBranchCount) {
      const branchWeights = potentialBranches.map((branch) => {
        const descendantCount = countDescendantsFn(branch);
        return Math.max(1, 10 - descendantCount);
      });

      const totalWeight = branchWeights.reduce((sum, w) => sum + w, 0);
      let randomValue = Math.random() * totalWeight;
      let selectedIndex = 0;
      for (let i = 0; i < branchWeights.length; i++) {
        randomValue -= branchWeights[i];
        if (randomValue <= 0) { selectedIndex = i; break; }
      }

      markBranchForRetraction(potentialBranches[selectedIndex]);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     pruneSingleNodeBranches  —  clean up single-node branches
     ══════════════════════════════════════════════════════════════════════ */

  function pruneSingleNodeBranches() {
    refresh();
    const now = Date.now();
    const singleNodeBranches = nodes.filter(
      (n) =>
        n.parent === nodes[0] && n.state === "alive" &&
        n.children.length === 0 && !n.isGroundStation &&
        now - n.createdAt > 5000 &&
        n.status !== "botnet" && n.status !== "commandControl" &&
        !(window.NodeNet?.InfectionSystem?.hasBotnetMeshConnections(n))
    );

    singleNodeBranches.forEach((branch) => markBranchForRetraction(branch));
  }

  /* ══════════════════════════════════════════════════════════════════════
     pruneDeepLeaves  —  prune leaves at any depth
     ══════════════════════════════════════════════════════════════════════ */

  function pruneDeepLeaves() {
    refresh();
    const now = Date.now();
    const candidates = nodes.filter((n) => {
      if (!n.parent) return false;
      if (n.state !== "alive") return false;
      if (n.children.length !== 0) return false;
      if (n.isSatellite || n.isGroundStation) return false;
      if (n.isGuardian || n.isDatacenter || n.isHoneypot) return false;
      if (n.status === "botnet" || n.status === "commandControl") return false;
      if (window.NodeNet?.InfectionSystem?.hasBotnetMeshConnections(n)) return false;
      if (now - n.createdAt < 10000) return false;
      return true;
    });

    if (candidates.length === 0) return;

    const softCap = getNetworkSoftCap();
    let branchNodeCount = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.parent && n.state === "alive" && !n.isSatellite && !n.isGroundStation) branchNodeCount++;
    }

    const maxDepth = getMaxBranchDepth();
    let pruneRate = 0.02;
    if (branchNodeCount > softCap) {
      const overshoot = (branchNodeCount - softCap) / softCap;
      pruneRate = Math.min(0.5, 0.08 + overshoot * 0.6);
    }
    pruneRate = Math.min(0.6, pruneRate * pruneMultiplier);

    candidates.forEach((leaf) => {
      const depth = getNodeDepthFn(leaf);
      if (depth < maxDepth && branchNodeCount <= softCap) return;
      const distance = maxDepth - depth;
      let protection;
      if (distance < 0) protection = 1.5;
      else if (distance === 0) protection = branchNodeCount > softCap ? 0.5 : 0.08;
      else if (distance === 1) protection = 0.2;
      else protection = 1.0;
      const effectiveRate = Math.min(1.0, pruneRate * protection);
      if (Math.random() < effectiveRate) markBranchForRetraction(leaf);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     resolveCrossings  —  untangle crossed edges
     ══════════════════════════════════════════════════════════════════════ */

  function resolveCrossings() {
    refresh();
    const CROSSING_CHECK_DELAY = 1000;
    if (Date.now() - lastCrossingCheckRef.value < CROSSING_CHECK_DELAY) return;
    lastCrossingCheckRef.value = Date.now();

    const edgesToCheck = edges.filter(
      (e) =>
        e.from && e.to && e.from.state === "alive" && e.to.state === "alive" &&
        !e.isWirelessLink && !e.isBotnetMesh && !e.isGuardianVpnTunnel &&
        !e.isDatacenterVpnTunnel && !e.isDDOSAttack
    );

    for (let i = 0; i < edgesToCheck.length; i++) {
      for (let j = i + 1; j < edgesToCheck.length; j++) {
        const edge1 = edgesToCheck[i], edge2 = edgesToCheck[j];
        if (edge1.from === edge2.from || edge1.from === edge2.to ||
            edge1.to === edge2.from || edge1.to === edge2.to) continue;

        if (linesIntersectFn(edge1.from, edge1.to, edge2.from, edge2.to)) {
          const nodeToMove = getNodeDepthFn(edge1.to) > getNodeDepthFn(edge2.to) ? edge1.to : edge2.to;
          const potentialNewParent = nodeToMove === edge1.to ? edge2.from : edge1.from;
          const oldParent = nodeToMove.parent;

          if (
            oldParent && nodeToMove.status !== "malware" &&
            !nodeToMove.isGroundStation && !nodeToMove.isSatellite &&
            (potentialNewParent.status === "green" || potentialNewParent.status === "blue") &&
            !isDescendantFn(nodeToMove, potentialNewParent) &&
            potentialNewParent !== nodeToMove
          ) {
            oldParent.children = oldParent.children.filter((c) => c.id !== nodeToMove.id);
            nodeToMove.parent = potentialNewParent;
            potentialNewParent.children.push(nodeToMove);

            const edgeToUpdate = edges.find((e) => e.to.id === nodeToMove.id);
            if (edgeToUpdate) edgeToUpdate.from = potentialNewParent;
            return;
          }
        }
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     spontaneouslySprout  —  random leaf growth
     ══════════════════════════════════════════════════════════════════════ */

  function spontaneouslySprout() {
    refresh();
    const now = Date.now();
    const cfg = window.NodeNetConfig || {};
    const baseSproutChance = cfg.linkQuality?.branchSpawnBaseChance || 0.05;
    const softCap = getNetworkSoftCap();

    let branchNodeCount = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.parent && n.state === "alive" && !n.isSatellite && !n.isGroundStation) branchNodeCount++;
    }
    if (branchNodeCount >= softCap) return;

    const potentialParents = nodes.filter((n) => {
      if (n.state !== "alive" || n.status !== "green") return false;
      if (n.isSatellite || n.isGroundStation) return false;
      const depth = getNodeDepthFn(n);
      if (depth >= getMaxBranchDepth()) return false;
      const maxDepth = getMaxBranchDepth();
      const maxChildrenAtDepth = depth <= 1 ? 3 : depth === 2 ? 2 : (depth < maxDepth - 1 ? 1 : 0);
      if (n.children.length >= maxChildrenAtDepth) return false;
      return true;
    });
    if (potentialParents.length === 0) return;

    const averageBandwidthScore = potentialParents.reduce(
      (sum, node) => sum + getNodeBandwidthGrowthScoreFn(node, now), 0
    ) / potentialParents.length;
    const baseChance = clampValueFn(
      baseSproutChance * averageBandwidthScore,
      baseSproutChance * 0.45, baseSproutChance * 2.2
    );
    const sproutChance = Math.min(0.25, baseChance * sproutMultiplier);
    if (Math.random() > sproutChance) return;

    const parentNode = chooseBandwidthWeightedNodeFn(potentialParents, now) ||
      potentialParents[Math.floor(Math.random() * potentialParents.length)];

    const canvas = canvasRef;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const depthRatio = getNodeDepthFn(parentNode) / Math.max(1, getMaxBranchDepth());
    const guideAngle = Number.isFinite(parentNode.branchAngle)
      ? parentNode.branchAngle
      : Math.atan2(parentNode.baseY - centerY, parentNode.baseX - centerX);
    const side = Math.random() < 0.5 ? -1 : 1;
    const spread = 0.55 + depthRatio * 0.25;
    const angle = guideAngle + side * spread + (Math.random() - 0.5) * 0.08;
    const dist = 95 + Math.random() * 35 - depthRatio * 12;

    const optimal = findOptimalBranchPosition(parentNode, angle, dist);
    let endpoint = { x: optimal.x, y: optimal.y };
    const clamped = clampEndpointToCollision(parentNode, endpoint);
    if (clamped) endpoint = clamped;
    const distFromParent = Math.hypot(endpoint.x - parentNode.x, endpoint.y - parentNode.y);
    if (distFromParent < 20) return;

    // Store the actual edge direction so children continue naturally
    const actualAngle = Math.atan2(endpoint.y - parentNode.y, endpoint.x - parentNode.x);

    const childNode = createNode(Date.now() + Math.random(), endpoint.x, endpoint.y, parentNode);
    setTopologyAnchor(childNode, endpoint.x, endpoint.y, actualAngle);
    childNode.branchLane = side;
    parentNode.children.push(childNode);
    nodes.push(childNode);
    edges.push({ from: parentNode, to: childNode });
    applyParentStatusToChild(parentNode, childNode);
  }

  /* ══════════════════════════════════════════════════════════════════════
     simulateNetworkEvents  —  main simulation tick coordinator
     ══════════════════════════════════════════════════════════════════════ */

  let _simTickCounter = 0;

  function simulateNetworkEvents() {
    refresh();
    if (isPausedRef()) return;
    clearDepthCacheFn();
    _simTickCounter++;

    const rootNode = nodes[0];
    if (rootNode) {
      const SELF_HEAL_DELAY = 5000 / healSpeedMultiplier();
      if (
        (rootNode.status === "malware" || rootNode.status === "botnet" || rootNode.status === "commandControl") &&
        !rootNode.isSelfHealing &&
        Date.now() > rootNode.statusChangedAt + SELF_HEAL_DELAY
      ) {
        rootNode.isSelfHealing = true;
        rootNode.selfHealingStartTime = Date.now();
        const directChildren = (rootNode.children || []).filter((ch) => ch && ch.state === "alive");
        rootNode.selfHealingPacketCap = directChildren.length * 4 * 2;
        rootNode.selfHealingPacketsCreated = 0;
        rootNode.selfHealingDispatchAllowance = 0;
        logEventFn("centralSelfHealingStarted");
      }
    }

    const aliveNodes = nodes.filter((n) => n.state === "alive" && n.parent !== null && !n.isSatellite);
    if (aliveNodes.length === 0) return;

    const RED_NODE_TIMEOUT = 10000 / healSpeedMultiplier();
    aliveNodes
      .filter((n) => n.status === "red")
      .forEach((node) => {
        if (Date.now() > node.statusChangedAt + RED_NODE_TIMEOUT) {
          let malwareChance = 0.1;
          const recoveredFromPing = node.hitByPingOfDeath === true;
          if (recoveredFromPing) { malwareChance = 0.5; node.hitByPingOfDeath = false; }
          const newStatus = Math.random() < malwareChance ? "malware" : "green";
          if (window.NodeNet?.HealingSystem) {
            window.NodeNet.HealingSystem.updateNodeStatus(node, newStatus);
          }
        }
      });

    // --- coordinated sub-system ticks ---
    if (window.NodeNet?.HealingSystem) window.NodeNet.HealingSystem.healNetwork();
    spontaneouslySprout();
    // tryRandomHoneypotSpawn() stays in app
    if (window.NodeNet?.SatelliteSystem) {
      window.NodeNet.SatelliteSystem.sproutGroundStationFromHealthyNode();
      window.NodeNet.SatelliteSystem.checkSatelliteLifespans();
      window.NodeNet.SatelliteSystem.checkGroundStationLifespans();
      window.NodeNet.SatelliteSystem.groundStationsLaunchSatellites();
      window.NodeNet.SatelliteSystem.updateSatelliteWirelessLinks();
    }
    if (window.NodeNet?.HealingSystem) window.NodeNet.HealingSystem.adoptRedNodes();
    if (window.NodeNet?.InfectionSystem) window.NodeNet.InfectionSystem.spreadMalware();
    if (window.NodeNet?.InfectionSystem) window.NodeNet.InfectionSystem.detectAndFormBotnets();
    if (window.NodeNet?.ImmunityPacketSystem) window.NodeNet.ImmunityPacketSystem.evaluateBotDefenseMode();

    // Throttled systems (every other tick)
    if (_simTickCounter % 2 === 0) {
      if (window.NodeNet?.InfectionSystem) window.NodeNet.InfectionSystem.optimizeBotnetMesh();
      resolveCrossings();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     updateNetworkTopology  —  per-tick topology maintenance
     ══════════════════════════════════════════════════════════════════════ */

  function updateNetworkTopology() {
    refresh();
    if (isPausedRef()) return;
    clearDepthCacheFn();
    const currentBranches = nodes.filter(
      (n) => n.parent === nodes[0] && (n.state === "alive" || n.state === "spawning")
    ).length;

    if (currentBranches > desiredBranchCount) {
      pruneRandomBranch();
      pruneSingleNodeBranches();
      pruneDeepLeaves();
      return;
    }

    if (Math.random() < 0.1) pruneRandomBranch();
    pruneSingleNodeBranches();
    pruneDeepLeaves();

    if (currentBranches < desiredBranchCount && Math.random() < 0.1 * sproutMultiplier) {
      sproutNewBranch();
    }
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  const TopologySystem = {
    configure(deps = {}) {
      if (deps.getNodes !== undefined) getNodes = deps.getNodes;
      if (deps.getEdges !== undefined) getEdges = deps.getEdges;
      if (deps.getPulses !== undefined) getPulses = deps.getPulses;
      if (deps.setPulses !== undefined) setPulses = deps.setPulses;
      if (deps.canvas !== undefined) canvasRef = deps.canvas;
      if (deps.padding !== undefined) padding = deps.padding;
      if (deps.createNode !== undefined) createNode = deps.createNode;
      if (deps.desiredBranchCount !== undefined) desiredBranchCount = deps.desiredBranchCount;
      if (deps.MAX_BRANCH_DEPTH !== undefined) MAX_BRANCH_DEPTH = deps.MAX_BRANCH_DEPTH;
      if (deps.getMaxBranchDepth !== undefined) getMaxBranchDepth = deps.getMaxBranchDepth;
      if (deps.getNetworkSoftCap !== undefined) getNetworkSoftCap = deps.getNetworkSoftCap;
      if (deps.getSproutMultiplier !== undefined) sproutMultiplier = deps.getSproutMultiplier();
      if (deps.getPruneMultiplier !== undefined) pruneMultiplier = deps.getPruneMultiplier();
      if (deps.getHealSpeedMultiplier !== undefined) healSpeedMultiplier = deps.getHealSpeedMultiplier;
      if (deps.isPaused !== undefined) isPausedRef = deps.isPaused;
      if (deps.simulationStartTimeRef !== undefined) simulationStartTimeRef = deps.simulationStartTimeRef;
      if (deps.lastCrossingCheckRef !== undefined) lastCrossingCheckRef = deps.lastCrossingCheckRef;
      if (deps.initialBranchTimeoutRef !== undefined) initialBranchTimeoutRef = deps.initialBranchTimeoutRef;
      if (deps.logEvent !== undefined) logEventFn = deps.logEvent;
      if (deps.incrementStat !== undefined) incrementStatFn = deps.incrementStat;
      if (deps.getLogNodeRef !== undefined) getLogNodeRefFn = deps.getLogNodeRef;
      if (deps.countDescendants !== undefined) countDescendantsFn = deps.countDescendants;
      if (deps.getNodeDepth !== undefined) getNodeDepthFn = deps.getNodeDepth;
      if (deps.clearDepthCache !== undefined) clearDepthCacheFn = deps.clearDepthCache;
      if (deps.isDescendant !== undefined) isDescendantFn = deps.isDescendant;
      if (deps.getRootBranch !== undefined) getRootBranchFn = deps.getRootBranch;
      if (deps.getNodeBandwidthGrowthScore !== undefined) getNodeBandwidthGrowthScoreFn = deps.getNodeBandwidthGrowthScore;
      if (deps.chooseBandwidthWeightedNode !== undefined) chooseBandwidthWeightedNodeFn = deps.chooseBandwidthWeightedNode;
      if (deps.clampValue !== undefined) clampValueFn = deps.clampValue;
      if (deps.linesIntersect !== undefined) linesIntersectFn = deps.linesIntersect;
      if (deps.segmentsIntersect !== undefined) segmentsIntersectFn = deps.segmentsIntersect;
      if (deps.pointToLineDistance !== undefined) pointToLineDistanceFn = deps.pointToLineDistance;
      if (deps.segmentCrossesExistingEdges !== undefined) segmentCrossesExistingEdgesFn = deps.segmentCrossesExistingEdges;
      if (deps.nudgeEndpointToAvoidCrossing !== undefined) nudgeEndpointToAvoidCrossingFn = deps.nudgeEndpointToAvoidCrossing;
      // findOptimalBranchPosition is defined locally
      return this;
    },

    updateNetworkTopology,
    sproutNewBranch,
    growBranchSequentially,
    markBranchForRetraction,
    pruneRandomBranch,
    pruneSingleNodeBranches,
    pruneDeepLeaves,
    resolveCrossings,
    spontaneouslySprout,
    scorePosition,
    findOptimalBranchPosition,
  };

  window.NodeNet.TopologySystem = TopologySystem;
})();