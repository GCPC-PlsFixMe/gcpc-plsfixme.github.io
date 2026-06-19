/**
 * @module CleanupSystem
 * @summary Reclaims orphaned nodes and dangling connections to keep the graph consistent.
 * @description Over a long-running simulation, nodes can become detached from the central
 *   backbone (e.g. a parent is reaped while a child lingers) and edges can be left pointing
 *   at removed/dead nodes. This janitor runs on a throttled tick:
 *     1. Orphaned nodes — any alive node whose parent chain no longer terminates at the
 *        central node is marked for retraction (graceful fade-out via TopologySystem).
 *     2. Orphaned edges — edges with a missing, removed, or dead endpoint are spliced out.
 *     3. Orphaned satellites — satellites whose host/ground-station is gone are untethered.
 *   It mutates the shared `nodes`/`edges` arrays in place so references held by other
 *   systems stay valid.
 * @exports window.NodeNet.CleanupSystem
 * @tags cleanup, garbage-collection, orphan, reclaim, topology, edges, satellites, maintenance
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────────── */
  const dependencies = {
    getNodes: () => [],
    getEdges: () => [],
    markBranchForRetraction: () => {},
    untetherSatellite: null,
    logEvent: () => {},
  };

  /**
   * Determine whether a node can trace its parent chain back to the central node.
   * Any break in the chain (missing parent, parent not in the live set, dead
   * parent, or a cycle) means the node is orphaned.
   * @param {Object} node
   * @param {Object} central nodes[0]
   * @param {Set} nodeSet set of all currently-live node references
   * @returns {boolean} true if a healthy path to central exists
   */
  function reachesCentral(node, central, nodeSet) {
    let cur = node;
    const seen = new Set();
    let guard = 0;
    while (cur && guard++ < 10000) {
      if (cur === central) return true;
      if (seen.has(cur)) return false; // cycle — treat as orphaned
      seen.add(cur);
      if (!cur.parent) return false; // chain ended before reaching central
      if (!nodeSet.has(cur.parent)) return false; // parent was removed
      if (cur.parent.state === "dead") return false; // parent is being torn down
      cur = cur.parent;
    }
    return false;
  }

  /**
   * Run one reclamation pass over the graph.
   * @returns {{nodes:number, edges:number, satellites:number}} counts reclaimed
   */
  function reclaimOrphans() {
    const nodes = dependencies.getNodes();
    const edges = dependencies.getEdges();
    const result = { nodes: 0, edges: 0, satellites: 0 };
    if (!nodes || nodes.length === 0) return result;

    const central = nodes[0];
    const nodeSet = new Set(nodes);

    /* 1. Orphaned NODES ─────────────────────────────────────────────────── */
    const orphanRoots = [];
    for (const node of nodes) {
      if (node === central) continue;
      if (node.isSatellite) continue; // satellites handled in step 3
      if (node.state !== "alive" && node.state !== "spawning") continue;
      if (!reachesCentral(node, central, nodeSet)) {
        orphanRoots.push(node);
      }
    }
    // Retract only the topmost alive orphan of each broken subtree;
    // markBranchForRetraction recurses into descendants. A child whose parent is
    // also an orphan root is skipped (it'll be retracted by the parent).
    const orphanSet = new Set(orphanRoots);
    for (const node of orphanRoots) {
      if (orphanSet.has(node.parent)) continue;
      if (node.state === "retracting") continue;
      dependencies.markBranchForRetraction(node);
      result.nodes++;
    }

    /* 2. Orphaned EDGES ─────────────────────────────────────────────────── */
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if (
        !e.from ||
        !e.to ||
        !nodeSet.has(e.from) ||
        !nodeSet.has(e.to) ||
        e.from.state === "dead" ||
        e.to.state === "dead"
      ) {
        edges.splice(i, 1);
        result.edges++;
      }
    }

    /* 3. Orphaned SATELLITES ────────────────────────────────────────────── */
    if (typeof dependencies.untetherSatellite === "function") {
      for (const node of nodes) {
        if (!node.isSatellite) continue;
        if (node.isDrifting || node.state !== "alive") continue;
        const host = node.satelliteHost || node.launchedFrom;
        // Untether when the satellite is bound to a host that no longer exists
        // or is no longer a functioning ground station.
        if (host && (!nodeSet.has(host) || host.state === "dead" || !host.isGroundStation)) {
          dependencies.untetherSatellite(node);
          result.satellites++;
        }
      }
    }

    /* Summary logging (only when something was actually reclaimed) */
    const total = result.nodes + result.edges + result.satellites;
    if (total > 0) {
      dependencies.logEvent("custom", {
        alert: "🧹 Reclaimed orphaned network resources.",
        details: {
          nodes: result.nodes,
          edges: result.edges,
          satellites: result.satellites,
        },
      });
    }

    return result;
  }

  const CleanupSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },
    reclaimOrphans,
    reachesCentral,
  };

  window.NodeNet.CleanupSystem = CleanupSystem;
})();
