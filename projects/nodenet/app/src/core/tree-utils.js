/**
 * @module TreeUtils
 * @summary Pure helpers for traversing/querying the node tree (depth, descendants, ancestry, paths).
 * @exports window.NodeNet.TreeUtils
 * @tags tree, traversal, depth, descendants, ancestor, path, central-node, graph
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /**
   * Check if a node has a healthy path to the central node through its tree structure.
   */
  function hasHealthyPathToCentral(node) {
    if (!node || node.state !== "alive") return false;

    // Central node is always healthy (blue or green)
    if (node.parent === null) {
      return node.status === "blue" || node.status === "green";
    }

    // Check if this node and all ancestors up to central are healthy
    let current = node;
    while (current) {
      // Red, malware, botnet, or commandControl nodes block the path
      if (
        current.status === "red" ||
        current.status === "malware" ||
        current.status === "botnet" ||
        current.status === "commandControl"
      ) {
        return false;
      }

      // If we reached the central node and it's healthy, path is good
      if (current.parent === null) {
        return current.status === "blue" || current.status === "green";
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Count non-satellite descendants of a node.
   */
  function countDescendants(node) {
    let count = node.children.filter(
      (child) => child && !child.isSatellite
    ).length;
    node.children.forEach((child) => {
      if (!child || child.isSatellite) return;
      count += countDescendants(child);
    });
    return count;
  }

  // Per-tick cache for getNodeDepth(). Cleared at the start of each
  // simulateNetworkEvents / updateNetworkTopology tick. Avoids walking
  // the parent chain hundreds of times per tick during sprouting / pruning
  // / mesh evaluation. The Map is keyed on the node object reference so
  // it's safe across detached/reparented nodes (a stale entry would only
  // ever survive within a single tick).
  const _depthCache = new Map();

  function clearDepthCache() {
    _depthCache.clear();
  }

  function getNodeDepth(node) {
    const cached = _depthCache.get(node);
    if (cached !== undefined) return cached;
    let depth = 0;
    let current = node;
    while (current.parent) {
      depth++;
      current = current.parent;
    }
    _depthCache.set(node, depth);
    return depth;
  }

  function isDescendant(parent, potentialChild) {
    if (parent.children.length === 0) return false;
    for (const child of parent.children) {
      if (child.id === potentialChild.id) return true;
      if (isDescendant(child, potentialChild)) return true;
    }
    return false;
  }

  function getRootBranch(node) {
    if (!node || !node.parent) return null;
    let currentNode = node;
    while (currentNode.parent && currentNode.parent.parent !== null) {
      currentNode = currentNode.parent;
    }
    return currentNode;
  }

  let _getCentralNode = () => null;

  function configure(deps = {}) {
    if (deps.getCentralNode !== undefined) _getCentralNode = deps.getCentralNode;
    return this;
  }

  function buildNodePath(origin, target) {
    const actualOrigin = origin || _getCentralNode();
    if (!actualOrigin || !target) return [];

    const ancestorSet = new Set();
    let current = actualOrigin;
    while (current) {
      ancestorSet.add(current);
      current = current.parent;
    }

    const downwardPath = [];
    current = target;
    while (current && !ancestorSet.has(current)) {
      downwardPath.push(current);
      current = current.parent;
    }

    if (!current) {
      return [];
    }

    const lca = current;
    const path = [];
    current = actualOrigin;
    while (current && current !== lca) {
      path.push(current);
      current = current.parent;
    }

    if (!current) {
      return [];
    }

    path.push(current); // include LCA once

    for (let i = downwardPath.length - 1; i >= 0; i--) {
      path.push(downwardPath[i]);
    }

    return path;
  }

  window.NodeNet.TreeUtils = {
    configure,
    hasHealthyPathToCentral,
    countDescendants,
    clearDepthCache,
    getNodeDepth,
    isDescendant,
    getRootBranch,
    buildNodePath,
  };
})();
