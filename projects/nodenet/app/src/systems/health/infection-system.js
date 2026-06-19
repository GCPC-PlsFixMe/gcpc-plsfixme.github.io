/**
 * @module InfectionSystem
 * @summary Malware propagation, botnet mesh formation, and C&C node creation.
 * @description Public API: `configure(deps)`, `spreadMalware()` (3-strategy),
 *   `optimizeBotnetMesh()` (edge restructuring), `detectAndFormBotnets()`
 *   (cluster detection + C&C), `hasBotnetMeshConnections()` (utility check).
 * @exports window.NodeNet.InfectionSystem
 * @tags infection, malware, botnet, mesh, command-control, propagation, threat
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────── */
  let nodes = [];
  let edges = [];
  let getNodes = () => nodes;
  let getEdges = () => edges;
  let attackFreqMultiplier = () => 1;
  let logEventFn = () => {};
  let incrementStatFn = () => {};
  let getLogNodeRefFn = () => "";
  let countDescendantsFn = () => 0;
  let botnetMeshHasClearPathFn = () => true;
  let getRootBranchFn = (n) => n;
  let pulsesRef = () => [];
  let updateNodeStatusFn = () => {};

  function refresh() {
    nodes = getNodes();
    edges = getEdges();
  }

  /* ══════════════════════════════════════════════════════════════════════
     spreadMalware  —  3-strategy malware propagation
     ══════════════════════════════════════════════════════════════════════ */

  function spreadMalware() {
    refresh();
    const afm = attackFreqMultiplier();
    const MULTI_INFECTION_CHANCE = 0.1 * afm;
    const DOWNSTREAM_INFECTION_CHANCE = 0.08 * afm;
    const UPSTREAM_ATTACK_CHANCE = 0.02 * afm;

    const malwareNodes = nodes.filter(
      (n) =>
        (n.status === "malware" || n.status === "botnet" || n.status === "commandControl") &&
        n.state === "alive" && n.spreadingInfections.length === 0 &&
        n.canSpread && n.infectedAt && Date.now() > n.infectedAt + n.spreadDelay
    );

    malwareNodes.forEach((node) => {
      if (Math.random() < MULTI_INFECTION_CHANCE) {
        const directChildren = node.children.filter(
          (n) =>
            !n.isGroundStation && n.state === "alive" &&
            n.status !== "malware" && n.status !== "botnet" &&
            n.status !== "red" && !n.isBeingInfected
        );

        directChildren.forEach((target) => {
          node.spreadingInfections.push({ target, startTime: Date.now() });
          if (target.parent !== null) target.isBeingInfected = true;
        });
      } else {
        if (Math.random() < DOWNSTREAM_INFECTION_CHANCE) {
          const potentialTargets = node.children.filter(
            (n) =>
              n && !n.isGroundStation && n.state === "alive" &&
              n.status !== "malware" && n.status !== "red" && !n.isBeingInfected
          );
          if (potentialTargets.length > 0) {
            const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
            node.spreadingInfections.push({ target, startTime: Date.now() });
            target.isBeingInfected = true;
            return;
          }
        }

        if (Math.random() < UPSTREAM_ATTACK_CHANCE) {
          const parent = node.parent;
          if (
            parent && !parent.isSatellite &&
            parent.state === "alive" &&
            parent.status !== "malware" && parent.status !== "botnet" &&
            parent.status !== "red" && !parent.isBeingInfected
          ) {
            node.spreadingInfections.push({ target: parent, startTime: Date.now() });
            if (parent.parent !== null) parent.isBeingInfected = true;
          }
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     optimizeBotnetMesh  —  edge restructuring for efficiency
     ══════════════════════════════════════════════════════════════════════ */

  function optimizeBotnetMesh() {
    refresh();
    if (Math.random() > 0.05) return;

    const MAX_MESH_CONNECTIONS = 5;
    const MAX_CC_MESH_CONNECTIONS = 10;

    const getMaxConnections = (node) =>
      node.status === "commandControl" || node.isCommandControl ? MAX_CC_MESH_CONNECTIONS : MAX_MESH_CONNECTIONS;

    const botnetNodes = nodes.filter(
      (n) =>
        (n.status === "botnet" || n.status === "commandControl") &&
        n.state === "alive" && n.parent !== null
    );

    if (botnetNodes.length < 3) return;

    botnetNodes.forEach((node) => {
      const isInActiveDDOS = nodes.some(
        (n) =>
          n.status === "commandControl" && n.ddosState === "active" &&
          n.ddosBotnets && n.ddosBotnets.includes(node)
      );
      if (isInActiveDDOS) return;

      const currentMeshEdges = edges.filter(
        (edge) => edge.isBotnetMesh && (edge.from === node || edge.to === node)
      );
      if (currentMeshEdges.length === 0) return;

      let longestEdge = null;
      let longestDistance = 0;
      currentMeshEdges.forEach((edge) => {
        const other = edge.from === node ? edge.to : edge.from;
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > longestDistance) { longestDistance = distance; longestEdge = edge; }
      });

      const nearbyBotnets = botnetNodes.filter((other) => {
        if (other === node) return false;
        if (other.parent === node || node.parent === other) return false;
        const alreadyConnected = edges.some(
          (edge) =>
            edge.isBotnetMesh &&
            ((edge.from === node && edge.to === other) || (edge.from === other && edge.to === node))
        );
        if (alreadyConnected) return false;
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        return Math.sqrt(dx * dx + dy * dy) < longestDistance * 0.7;
      });

      if (nearbyBotnets.length === 0) return;

      let closestNode = null;
      let closestDistance = Infinity;
      nearbyBotnets.forEach((other) => {
        const otherMeshCount = edges.filter(
          (edge) => edge.isBotnetMesh && (edge.from === other || edge.to === other)
        ).length;
        if (otherMeshCount >= getMaxConnections(other)) return;
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < closestDistance) { closestDistance = distance; closestNode = other; }
      });

      if (closestNode && longestEdge) {
        const edgeIndex = edges.indexOf(longestEdge);
        if (edgeIndex !== -1) edges.splice(edgeIndex, 1);
        edges.push({ from: node, to: closestNode, isBotnetMesh: true });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     detectAndFormBotnets  —  cluster detection + C&C creation
     ══════════════════════════════════════════════════════════════════════ */

  function findConnectedInfected(node, cluster, visited) {
    if (
      visited.has(node.id) ||
      (node.status !== "malware" && node.status !== "botnet" && node.status !== "commandControl") ||
      node.parent === null
    )
      return;

    visited.add(node.id);
    cluster.push(node);

    const connected = [...node.children];
    if (node.parent) connected.push(node.parent);

    edges.forEach((edge) => {
      if (edge.isBotnetMesh) {
        if (edge.from === node && !connected.includes(edge.to)) connected.push(edge.to);
        else if (edge.to === node && !connected.includes(edge.from)) connected.push(edge.from);
      }
    });

    connected.forEach((connectedNode) => {
      if (
        connectedNode &&
        (connectedNode.status === "malware" || connectedNode.status === "botnet" || connectedNode.status === "commandControl")
      ) {
        findConnectedInfected(connectedNode, cluster, visited);
      }
    });
  }

  function detectAndFormBotnets() {
    refresh();
    const logEvent = logEventFn;
    const incrementStat = incrementStatFn;
    const getLogNodeRef = getLogNodeRefFn;
    const countDescendants = countDescendantsFn;
    const botnetMeshHasClearPath = botnetMeshHasClearPathFn;
    const getRootBranch = getRootBranchFn;
    const pulses = pulsesRef();

    // Remove stale botnet mesh edges (in-place to keep shared reference)
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      if (edge.isBotnetMesh) {
        const keep =
          (edge.from.status === "malware" || edge.from.status === "botnet" || edge.from.status === "commandControl") &&
          (edge.to.status === "malware" || edge.to.status === "botnet" || edge.to.status === "commandControl") &&
          edge.from.state === "alive" && edge.to.state === "alive";
        if (!keep) edges.splice(i, 1);
      }
    }

    const infectedNodes = nodes.filter(
      (n) =>
        (n.status === "malware" || n.status === "botnet" || n.status === "commandControl") &&
        n.state === "alive" && n.parent !== null
    );

    const visited = new Set();
    const clusters = [];

    infectedNodes.forEach((node) => {
      if (!visited.has(node.id)) {
        const cluster = [];
        findConnectedInfected(node, cluster, visited);
        clusters.push(cluster);
      }
    });

    const getMaxConnections = (node) =>
      node.status === "commandControl" || node.isCommandControl ? 10 : 5;

    clusters.forEach((cluster) => {
      if (cluster.length >= 7) {
        const botnetNodesInCluster = cluster.filter((n) => n.status === "botnet");
        if (botnetNodesInCluster.length >= 7) {
          const eligibleForCC = botnetNodesInCluster.filter((n) => n.parent !== nodes[0]);
          if (eligibleForCC.length < 7) return;

          const nodesWithDescendants = eligibleForCC
            .map((node) => ({ node, descendants: countDescendants(node) }))
            .sort((a, b) => a.descendants - b.descendants);

          const nodesToRemove = nodesWithDescendants.slice(0, 4).map((n) => n.node);
          const ccNode = nodesWithDescendants[4].node;

          nodesToRemove.forEach((node, index) => {
            setTimeout(() => {
              const meshConnectedNodes = [];
              edges.forEach((edge) => {
                if (edge.isBotnetMesh) {
                  if (edge.from === node && edge.to.state === "alive" && !nodesToRemove.includes(edge.to))
                    meshConnectedNodes.push(edge.to);
                  else if (edge.to === node && edge.from.state === "alive" && !nodesToRemove.includes(edge.from))
                    meshConnectedNodes.push(edge.from);
                }
              });

              if (node.children.length > 0) {
                node.children.forEach((child) => {
                  let safeParent = node.parent;
                  if (nodesToRemove.includes(safeParent)) safeParent = ccNode;
                  if (!nodesToRemove.includes(child) && safeParent && safeParent.state === "alive") {
                    child.parent = safeParent;
                    safeParent.children.push(child);
                    for (let k = edges.length - 1; k >= 0; k--) {
                      if (edges[k].from === node && edges[k].to === child) edges.splice(k, 1);
                    }
                    if (!edges.some((e) => e.from === safeParent && e.to === child)) {
                      edges.push({ from: safeParent, to: child });
                    }
                  }
                });
                node.children = [];
              }

              meshConnectedNodes.forEach((connectedNode) => {
                const alreadyConnected = edges.some(
                  (e) => (e.from === ccNode && e.to === connectedNode) || (e.from === connectedNode && e.to === ccNode)
                );
                if (!alreadyConnected) {
                  edges.push({ from: ccNode, to: connectedNode, isBotnetMesh: true });
                }
              });

              if (node.parent) {
                node.parent.children = node.parent.children.filter((c) => c !== node);
              }

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

              node.state = "retracting";
              node.isTargeted = false;
              pulses.splice(0, pulses.length, ...pulses.filter((p) => p.target !== node));
              for (let k = edges.length - 1; k >= 0; k--) {
                if (edges[k].from === node || edges[k].to === node) edges.splice(k, 1);
              }
            }, index * 500);
          });

          setTimeout(() => {
            ccNode.status = "commandControl";
            ccNode.isCommandControl = true;
            ccNode.statusChangedAt = Date.now();
            ccNode.baseRadius = 11;
            ccNode.targetRadius = 11;
            ccNode.currentColor = { r: 139, g: 0, b: 0 };
            ccNode.isImmunityHealing = false;
            ccNode.immunityHealingStartTime = 0;
            ccNode.attachedImmunityPackets = [];

            pulses.push({
              x: ccNode.x, y: ccNode.y, radius: 0, maxRadius: 50,
              color: "rgba(139, 0, 0, 0.6)", startTime: Date.now(),
            });

            logEvent("ccFormed", { node: ccNode, clusterSize: cluster.length });
          }, 2000);
        }
      } else if (cluster.length >= 3) {
        // Promote malware nodes to botnet status
        cluster.forEach((node) => {
          if (node.status === "malware") {
            updateNodeStatusFn(node, "botnet");
          }
        });

        // Form mesh within cluster
        const meshCounts = new Map();
        cluster.forEach((n) => meshCounts.set(n.id, 0));

        for (let i = 0; i < cluster.length; i++) {
          for (let j = i + 1; j < cluster.length; j++) {
            const nodeA = cluster[i];
            const nodeB = cluster[j];
            if (nodeA.parent === nodeB || nodeB.parent === nodeA) continue;

            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (
              distance <= 150 &&
              meshCounts.get(nodeA.id) < getMaxConnections(nodeA) &&
              meshCounts.get(nodeB.id) < getMaxConnections(nodeB) &&
              !edges.some((e) => (e.from === nodeA && e.to === nodeB) || (e.from === nodeB && e.to === nodeA))
            ) {
              edges.push({ from: nodeA, to: nodeB, isBotnetMesh: true });
              meshCounts.set(nodeA.id, meshCounts.get(nodeA.id) + 1);
              meshCounts.set(nodeB.id, meshCounts.get(nodeB.id) + 1);
            }
          }
        }

        // Bridge to nearby infected nodes within same branch
        const BRIDGE_DISTANCE = 100;
        cluster.forEach((nodeA) => {
          if (meshCounts.get(nodeA.id) >= getMaxConnections(nodeA)) return;
          const isInActiveDDOS = nodes.some(
            (n) =>
              n.status === "commandControl" && n.ddosState === "active" &&
              n.ddosBotnets && n.ddosBotnets.includes(nodeA)
          );
          if (isInActiveDDOS) return;

          infectedNodes.forEach((nodeB) => {
            if (cluster.includes(nodeB)) return;
            if (!meshCounts.has(nodeB.id)) meshCounts.set(nodeB.id, 0);
            if (meshCounts.get(nodeB.id) >= getMaxConnections(nodeB)) return;
            if (meshCounts.get(nodeA.id) >= getMaxConnections(nodeA)) return;

            const branchA = getRootBranch(nodeA);
            const branchB = getRootBranch(nodeB);
            if (branchA !== branchB) return;
            if (nodeA.isUnderDDOS || (branchA && branchA.isUnderDDOS)) return;
            if (nodeB.isUnderDDOS || (branchB && branchB.isUnderDDOS)) return;

            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= BRIDGE_DISTANCE) {
              const edgeExists = edges.some(
                (edge) => (edge.from === nodeA && edge.to === nodeB) || (edge.from === nodeB && edge.to === nodeA)
              );
              if (!edgeExists && nodeA.parent !== nodeB && nodeB.parent !== nodeA && botnetMeshHasClearPath(nodeA, nodeB)) {
                edges.push({ from: nodeA, to: nodeB, isBotnetMesh: true });
                meshCounts.set(nodeA.id, meshCounts.get(nodeA.id) + 1);
                meshCounts.set(nodeB.id, meshCounts.get(nodeB.id) + 1);
                logEvent("botnetBridged");
              }
            }
          });
        });
      } else {
        // Cluster has fewer than 3 nodes - downgrade botnets to malware
        cluster.forEach((node) => {
          if (node.status === "botnet") {
            node.status = "malware";
            node.statusChangedAt = Date.now();
          }
        });
        for (let i = edges.length - 1; i >= 0; i--) {
          const edge = edges[i];
          if (edge.isBotnetMesh && (cluster.includes(edge.from) || cluster.includes(edge.to))) {
            edges.splice(i, 1);
          }
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     hasBotnetMeshConnections  —  utility check
     ══════════════════════════════════════════════════════════════════════ */

  function hasBotnetMeshConnections(node) {
    refresh();
    return edges.some((edge) => edge.isBotnetMesh && (edge.from === node || edge.to === node));
  }

  function cleanupBotnetMeshEdges() {
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      if (!edge.isBotnetMesh) continue;
      if (!edge.from || !edge.to) { edges.splice(i, 1); continue; }
      if (edge.from.state !== "alive" || edge.to.state !== "alive") {
        edges.splice(i, 1); continue;
      }
      if (!botnetMeshHasClearPathFn(edge.from, edge.to)) edges.splice(i, 1);
    }
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  const InfectionSystem = {
    configure(deps = {}) {
      if (deps.getNodes !== undefined) getNodes = deps.getNodes;
      if (deps.getEdges !== undefined) getEdges = deps.getEdges;
      if (deps.getAttackFreqMultiplier !== undefined) attackFreqMultiplier = deps.getAttackFreqMultiplier;
      if (deps.logEvent !== undefined) logEventFn = deps.logEvent;
      if (deps.incrementStat !== undefined) incrementStatFn = deps.incrementStat;
      if (deps.getLogNodeRef !== undefined) getLogNodeRefFn = deps.getLogNodeRef;
      if (deps.countDescendants !== undefined) countDescendantsFn = deps.countDescendants;
      if (deps.botnetMeshHasClearPath !== undefined) botnetMeshHasClearPathFn = deps.botnetMeshHasClearPath;
      if (deps.getRootBranch !== undefined) getRootBranchFn = deps.getRootBranch;
      if (deps.getPulses !== undefined) pulsesRef = deps.getPulses;
      if (deps.updateNodeStatus !== undefined) updateNodeStatusFn = deps.updateNodeStatus;
      return this;
    },

    spreadMalware,
    optimizeBotnetMesh,
    detectAndFormBotnets,
    findConnectedInfected,
    hasBotnetMeshConnections,
    cleanupBotnetMeshEdges,
  };

  window.NodeNet.InfectionSystem = InfectionSystem;
})();