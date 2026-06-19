/**
 * @module Geometry
 * @summary Pure geometry helpers — intersection tests, line-of-sight, Bezier math, edge queries.
 * @description Some functions read the global `nodes` / `edges` / `canvas` defined
 *   by the coordinator; safe because they only read those globals at call time.
 * @exports window.NodeNet.Geometry
 * @tags geometry, intersection, line-of-sight, bezier, quadratic, edge, clamp, math, collision
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  // --- Geometric utility for resolving crossed lines ---
  function linesIntersect(p1, q1, p2, q2) {
    // Helper to find orientation of ordered triplet (p, q, r)
    function orientation(p, q, r) {
      if (!p || !q || !r) return 0; // Prevent errors on missing nodes
      const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
      if (val === 0) return 0; // Collinear
      return val > 0 ? 1 : 2; // Clockwise or Counterclockwise
    }

    // Helper to check if point q lies on segment pr
    function onSegment(p, q, r) {
      if (!p || !q || !r) return false;
      return (
        q.x <= Math.max(p.x, r.x) &&
        q.x >= Math.min(p.x, r.x) &&
        q.y <= Math.max(p.y, r.y) &&
        q.y >= Math.min(p.y, r.y)
      );
    }

    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);

    // General case of intersection
    if (o1 !== o2 && o3 !== o4) return true;

    // Special Cases for collinear points on a segment
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;

    return false;
  }

  // --- Guardian VPN arched path helpers ---

  /**
   * Returns a point on a quadratic Bezier curve at parameter t.
   * @param {{x:number,y:number}} p0
   * @param {{x:number,y:number}} p1
   * @param {{x:number,y:number}} p2
   * @param {number} t
   */
  function getPointOnQuadraticBezier(p0, p1, p2, t) {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const uu = u * u;
    const tt = clampedT * clampedT;
    return {
      x: uu * p0.x + 2 * u * clampedT * p1.x + tt * p2.x,
      y: uu * p0.y + 2 * u * clampedT * p1.y + tt * p2.y,
    };
  }

  /**
   * Returns the (non-normalized) tangent vector of a quadratic Bezier curve at parameter t.
   * @param {{x:number,y:number}} p0
   * @param {{x:number,y:number}} p1
   * @param {{x:number,y:number}} p2
   * @param {number} t
   */
  function getTangentOnQuadraticBezier(p0, p1, p2, t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      x:
        2 * (1 - clampedT) * (p1.x - p0.x) + 2 * clampedT * (p2.x - p1.x),
      y:
        2 * (1 - clampedT) * (p1.y - p0.y) + 2 * clampedT * (p2.y - p1.y),
    };
  }

  /**
   * Computes the control point for a Guardian VPN tunnel so the curve bulges outward at its midpoint.
   * Outward is defined relative to the central node (nodes[0]) if available, otherwise the canvas center.
   * @param {{x:number,y:number}} fromNode
   * @param {{x:number,y:number}} toNode
   */
  function getGuardianVpnTunnelControlPoint(fromNode, toNode) {
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;

    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return { x: midX, y: midY };

    // Candidate normal (perpendicular) direction
    let nx = -dy / len;
    let ny = dx / len;

    const centerNode =
      typeof nodes !== "undefined" && nodes && nodes[0] ? nodes[0] : null;
    const centerX = centerNode
      ? centerNode.x
      : typeof canvas !== "undefined"
      ? canvas.width / 2
      : midX;
    const centerY = centerNode
      ? centerNode.y
      : typeof canvas !== "undefined"
      ? canvas.height / 2
      : midY;

    const outX = midX - centerX;
    const outY = midY - centerY;
    if (nx * outX + ny * outY < 0) {
      nx = -nx;
      ny = -ny;
    }

    // Scale arc height by edge length, with a clamp to avoid extreme bends.
    const arcHeight = Math.min(60, len * 0.3);
    return {
      x: midX + nx * arcHeight,
      y: midY + ny * arcHeight,
    };
  }

  /**
   * Computes a stable, gently curved control point for Datacenter VPN tunnels.
   * This avoids hard, blocky straight segments and gives a softer mesh feel.
   * @param {{x:number,y:number}} fromNode
   * @param {{x:number,y:number}} toNode
   * @param {{pulseSeed?:number}} edge
   */
  function getDatacenterVpnTunnelControlPoint(fromNode, toNode, edge) {
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;

    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return { x: midX, y: midY };

    // Candidate perpendicular direction
    let nx = -dy / len;
    let ny = dx / len;

    // Always arch convexly outward from the central node / canvas center,
    // matching the guardian VPN tunnel convention.
    const centerNode =
      typeof nodes !== "undefined" && nodes && nodes[0] ? nodes[0] : null;
    const centerX = centerNode
      ? centerNode.x
      : typeof canvas !== "undefined"
      ? canvas.width / 2
      : midX;
    const centerY = centerNode
      ? centerNode.y
      : typeof canvas !== "undefined"
      ? canvas.height / 2
      : midY;

    const outX = midX - centerX;
    const outY = midY - centerY;
    if (nx * outX + ny * outY < 0) {
      nx = -nx;
      ny = -ny;
    }

    const arcHeight = Math.min(55, len * 0.25);
    return {
      x: midX + nx * arcHeight,
      y: midY + ny * arcHeight,
    };
  }

  /**
   * Samples a point on an edge at parameter t and returns a perpendicular unit vector for lateral offsets.
   * For VPN tunnels, the centerline is an arched quadratic Bezier curve.
   * @param {{from:{x:number,y:number},to:{x:number,y:number},isGuardianVpnTunnel?:boolean,isDatacenterVpnTunnel?:boolean,pulseSeed?:number}} edge
   * @param {number} t
   */
  function getPointAndPerpOnEdge(edge, t) {
    if (!edge || !edge.from || !edge.to) return null;

    const fromNode = edge.from;
    const toNode = edge.to;
    const clampedT = Math.max(0, Math.min(1, t));

    if (edge.isGuardianVpnTunnel || edge.isDatacenterVpnTunnel) {
      const control = edge.isGuardianVpnTunnel
        ? getGuardianVpnTunnelControlPoint(fromNode, toNode)
        : getDatacenterVpnTunnelControlPoint(fromNode, toNode, edge);
      const pt = getPointOnQuadraticBezier(fromNode, control, toNode, clampedT);
      const tan = getTangentOnQuadraticBezier(fromNode, control, toNode, clampedT);
      const tanLen = Math.hypot(tan.x, tan.y);

      if (tanLen > 0) {
        const tx = tan.x / tanLen;
        const ty = tan.y / tanLen;
        return { x: pt.x, y: pt.y, perpX: -ty, perpY: tx };
      }

      // Fallback to straight-line orientation if tangent degenerates
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const len = Math.hypot(dx, dy);
      if (len <= 0) return { x: pt.x, y: pt.y, perpX: 0, perpY: 0 };
      return {
        x: pt.x,
        y: pt.y,
        perpX: -dy / len,
        perpY: dx / len,
      };
    }

    const normalControl = getNormalEdgeFlexControl(edge);
    if (normalControl) {
      const pt = getPointOnQuadraticBezier(fromNode, normalControl, toNode, clampedT);
      const tan = getTangentOnQuadraticBezier(fromNode, normalControl, toNode, clampedT);
      const tanLen = Math.hypot(tan.x, tan.y);
      if (tanLen > 0) {
        const tx = tan.x / tanLen;
        const ty = tan.y / tanLen;
        return { x: pt.x, y: pt.y, perpX: -ty, perpY: tx };
      }
    }

    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return { x: fromNode.x, y: fromNode.y, perpX: 0, perpY: 0 };

    return {
      x: fromNode.x + dx * clampedT,
      y: fromNode.y + dy * clampedT,
      perpX: -dy / len,
      perpY: dx / len,
    };
  }

  function getNormalEdgeFlexControl(edge, now = Date.now()) {
    if (
      !edge ||
      !edge.from ||
      !edge.to ||
      edge.isGuardianVpnTunnel ||
      edge.isDatacenterVpnTunnel ||
      edge.isWirelessLink
    ) {
      return null;
    }
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1) return null;

    const flexSeed = edge.pulseSeed || 0;
    const flexAmp = Math.min(22, len * 0.09);
    const wobble =
      (Math.sin(now * 0.0009 + flexSeed) * 0.75 +
        Math.sin(now * 0.00055 + flexSeed * 1.7) * 0.35) *
      flexAmp;
    return {
      x: (edge.from.x + edge.to.x) / 2 + (-dy / len) * wobble,
      y: (edge.from.y + edge.to.y) / 2 + (dx / len) * wobble,
    };
  }

  /**
   * Returns true if there is an active Guardian VPN tunnel directly between two nodes.
   * @param {any} nodeA
   * @param {any} nodeB
   */
  function isGuardianVpnTunnelBetween(nodeA, nodeB) {
    if (!nodeA || !nodeB) return false;

    if (
      nodeA.guardianVpnTunnels &&
      nodeA.guardianVpnTunnels.some((t) => t && t.target === nodeB)
    ) {
      return true;
    }

    if (
      nodeB.guardianVpnTunnels &&
      nodeB.guardianVpnTunnels.some((t) => t && t.target === nodeA)
    ) {
      return true;
    }

    return false;
  }

  function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getEdgeBetweenNodes(nodeA, nodeB) {
    if (!nodeA || !nodeB) return null;
    return (
      edges.find(
        (edge) =>
          (edge.from === nodeA && edge.to === nodeB) ||
          (edge.from === nodeB && edge.to === nodeA)
      ) || null
    );
  }

  // --- Line-of-sight & collision helpers ---

  function orientation(ax, ay, bx, by, cx, cy) {
    const value = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(value) < 1e-6) return 0;
    return value > 0 ? 1 : -1;
  }

  function onSegment(ax, ay, bx, by, cx, cy) {
    return (
      Math.min(ax, bx) - 1e-6 <= cx &&
      cx <= Math.max(ax, bx) + 1e-6 &&
      Math.min(ay, by) - 1e-6 <= cy &&
      cy <= Math.max(ay, by) + 1e-6
    );
  }

  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const o1 = orientation(ax, ay, bx, by, cx, cy);
    const o2 = orientation(ax, ay, bx, by, dx, dy);
    const o3 = orientation(cx, cy, dx, dy, ax, ay);
    const o4 = orientation(cx, cy, dx, dy, bx, by);

    if (o1 !== o2 && o3 !== o4) return true;

    if (o1 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
    if (o2 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
    if (o3 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
    if (o4 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;

    return false;
  }

  function nodesHaveClearView(nodeA, nodeB) {
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
      if (node.state !== "alive") continue;
      // Satellites pass through wireless links - ignore them in clear view checks
      if (node.isSatellite) continue;
      const apx = node.x - ax;
      const apy = node.y - ay;
      let t = (apx * abx + apy * aby) / abLengthSquared;
      t = Math.max(0, Math.min(1, t));
      const closestX = ax + abx * t;
      const closestY = ay + aby * t;
      const dx = node.x - closestX;
      const dy = node.y - closestY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const clearance = node.radius + 12;
      if (distance < clearance) {
        return false;
      }
    }

    for (const edge of edges) {
      if (!edge || !edge.from || !edge.to) continue;
      if (
        edge.from === nodeA ||
        edge.from === nodeB ||
        edge.to === nodeA ||
        edge.to === nodeB
      )
        continue;
      // Skip wireless links - wireless can pass through wireless
      if (edge.isWirelessLink) continue;
      if (
        segmentsIntersect(
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
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a botnet mesh edge crosses any healthy (uninfected) tree branches.
   * Returns true if the path is clear of healthy branches.
   */
  function botnetMeshHasClearPath(nodeA, nodeB) {
    if (!nodeA || !nodeB) return false;
    const ax = nodeA.x,
      ay = nodeA.y;
    const bx = nodeB.x,
      by = nodeB.y;

    for (const edge of edges) {
      if (!edge || !edge.from || !edge.to) continue;
      // Skip non-tree edges (mesh, VPN, wireless, DDOS)
      if (
        edge.isBotnetMesh ||
        edge.isGuardianVpnTunnel ||
        edge.isDatacenterVpnTunnel ||
        edge.isWirelessLink ||
        edge.isDDOSAttack
      )
        continue;
      // Skip edges involving the mesh endpoints
      if (
        edge.from === nodeA ||
        edge.from === nodeB ||
        edge.to === nodeA ||
        edge.to === nodeB
      )
        continue;
      // Skip if both endpoints of the tree edge are infected
      const fromInfected =
        edge.from.status === "malware" ||
        edge.from.status === "botnet" ||
        edge.from.status === "commandControl";
      const toInfected =
        edge.to.status === "malware" ||
        edge.to.status === "botnet" ||
        edge.to.status === "commandControl";
      if (fromInfected && toInfected) continue; // Infected branch, allow crossing

      // Check if mesh edge crosses this healthy branch
      if (
        segmentsIntersect(
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
        return false; // Blocked by healthy branch
      }
    }
    return true;
  }

  window.NodeNet.Geometry = {
    linesIntersect,
    getPointOnQuadraticBezier,
    getTangentOnQuadraticBezier,
    getGuardianVpnTunnelControlPoint,
    getDatacenterVpnTunnelControlPoint,
    getNormalEdgeFlexControl,
    getPointAndPerpOnEdge,
    isGuardianVpnTunnelBetween,
    clampValue,
    getEdgeBetweenNodes,
    orientation,
    onSegment,
    segmentsIntersect,
    nodesHaveClearView,
    botnetMeshHasClearPath,
  };
})();
