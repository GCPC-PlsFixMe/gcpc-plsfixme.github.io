/**
 * @module DDOSSystem
 * @summary DDOS lifecycle state machine — idle → charging → active → cooldown.
 * @description Public API: `configure(deps)`, `manageDDOSAttacks()` (per-frame
 *   state machine), `isNodeInDDOSBranch()` (utility check).
 * @exports window.NodeNet.DDOSSystem
 * @tags ddos, attack, state-machine, charging, botnet, command-control, flood
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

  function refresh() {
    nodes = getNodes();
    edges = getEdges();
  }

  /* ══════════════════════════════════════════════════════════════════════
     manageDDOSAttacks  —  per-frame DDOS state machine
     ══════════════════════════════════════════════════════════════════════ */

  function manageDDOSAttacks() {
    refresh();
    const now = Date.now();
    const afm = attackFreqMultiplier();
    const DDOS_CHARGE_TIME = 6000 / afm;
    const DDOS_DURATION = 12000;
    const DDOS_COOLDOWN = 25000 / afm;

    const logEvent = logEventFn;
    const incrementStat = incrementStatFn;
    const getLogNodeRef = getLogNodeRefFn;
    const countDescendants = countDescendantsFn;

    const ccNodes = nodes.filter(
      (n) => n.status === "commandControl" && n.state === "alive" && n.parent !== null
    );

    ccNodes.forEach((ccNode) => {
      if (ccNode.ddosState === "charging") {
        const elapsed = now - ccNode.ddosChargeStart;
        if (elapsed >= DDOS_CHARGE_TIME) {
          const centralNode = nodes[0];
          const isBlocked =
            centralNode && centralNode.state === "alive" && Math.random() < 0.5;

          if (isBlocked) {
            // Attack reflected back to source
            let sourceBranch = ccNode;
            while (sourceBranch.parent && sourceBranch.parent.parent !== null) {
              sourceBranch = sourceBranch.parent;
            }

            ccNode.ddosState = "active";
            ccNode.ddosActiveStart = now;
            ccNode.ddosTargetBranch = sourceBranch;
            ccNode.isSelfInflictedDDOS = true;
            ccNode.ddosAttackPaths = null;

            if (ccNode.ddosTargetBranch) {
              ccNode.ddosTargetBranch.isUnderDDOS = true;
              ccNode.ddosTargetBranch.ddosAttacker = ccNode;
            }

            logEvent("custom", {
              alert: "🛡️ Central node REFLECTED DDOS attack! Backfiring on source branch.",
              details: { cc: getLogNodeRef(ccNode), sourceBranch: getLogNodeRef(sourceBranch) },
            });
            incrementStat("totalDefenses");
          } else {
            // Attack successful
            ccNode.ddosState = "active";
            ccNode.ddosActiveStart = now;

            if (ccNode.ddosTargetBranch) {
              ccNode.ddosTargetBranch.isUnderDDOS = true;
              ccNode.ddosTargetBranch.ddosAttacker = ccNode;
            }

            logEvent("ddosLaunched", {
              ccNode,
              targetBranch: ccNode.ddosTargetBranch,
              botnetCount: ccNode.ddosBotnets.length,
            });
            incrementStat("totalDDOSAttacks");
          }
        }
      } else if (ccNode.ddosState === "active") {
        const elapsed = now - ccNode.ddosActiveStart;

        // Build attack paths if needed
        if (ccNode.ddosBotnets && ccNode.ddosBotnets.length > 0 && ccNode.ddosTargetBranch) {
          if (!ccNode.ddosAttackPaths) {
            ccNode.ddosAttackPaths = [];

            ccNode.ddosBotnets.forEach((botnet) => {
              if (botnet.state !== "alive") return;

              const path = [];
              let current = botnet;
              while (current && current.parent && current.parent.parent !== null) {
                const edge = edges.find(
                  (e) => (e.from === current && e.to === current.parent) || (e.to === current && e.from === current.parent)
                );
                if (edge) path.push({ edge, direction: edge.from === current ? 1 : -1, botnet });
                current = current.parent;
              }

              if (current && current.parent === nodes[0]) {
                const edgeToCentral = edges.find(
                  (e) => (e.from === current && e.to === nodes[0]) || (e.to === current && e.from === nodes[0])
                );
                if (edgeToCentral) path.push({ edge: edgeToCentral, direction: edgeToCentral.from === current ? 1 : -1, botnet });
              }

              const edgeToTarget = edges.find(
                (e) =>
                  (e.from === nodes[0] && e.to === ccNode.ddosTargetBranch) ||
                  (e.to === nodes[0] && e.from === ccNode.ddosTargetBranch)
              );
              if (edgeToTarget) path.push({ edge: edgeToTarget, direction: edgeToTarget.from === nodes[0] ? 1 : -1, botnet });

              if (path.length > 0) {
                const attackPath = { botnet, path, startTime: now, target: ccNode.ddosTargetBranch };
                ccNode.ddosAttackPaths.push(attackPath);

                path.forEach((seg) => {
                  seg.edge.ddosAttackData = { attackPath, edgeInPath: seg, startTime: now };
                });
              }
            });
          }
        }

        if (elapsed >= DDOS_DURATION) {
          // DDOS complete — cooldown
          ccNode.ddosState = "idle";
          ccNode.ddosCooldownUntil = now + DDOS_COOLDOWN;
          ccNode.isSelfInflictedDDOS = false;

          if (ccNode.ddosTargetBranch) {
            ccNode.ddosTargetBranch.isUnderDDOS = false;
            ccNode.ddosTargetBranch.ddosAttacker = null;
            logEvent("ddosEnded", { ccNode, targetBranch: ccNode.ddosTargetBranch });
          }

          if (ccNode.ddosAttackPaths) {
            ccNode.ddosAttackPaths.forEach((attackPath) => {
              attackPath.path.forEach((seg) => { if (seg.edge) delete seg.edge.ddosAttackData; });
            });
            ccNode.ddosAttackPaths = [];
          }

          ccNode.ddosTargetBranch = null;
          ccNode.ddosBotnets = [];
        }
      } else if (ccNode.ddosState === "idle") {
        if (now < ccNode.ddosCooldownUntil) return;

        // Find connected botnets
        const connectedBotnets = [];
        edges.forEach((edge) => {
          let otherNode = null;
          if (edge.from === ccNode && edge.to && edge.to.status === "botnet" && edge.to.state === "alive")
            otherNode = edge.to;
          else if (edge.to === ccNode && edge.from && edge.from.status === "botnet" && edge.from.state === "alive")
            otherNode = edge.from;
          if (otherNode && !connectedBotnets.includes(otherNode)) connectedBotnets.push(otherNode);
        });

        if (connectedBotnets.length < 3) return;

        const centralNode = nodes[0];
        if (!centralNode) return;

        // Find which branch the C&C belongs to
        let ccBranch = ccNode;
        while (ccBranch.parent && ccBranch.parent.parent !== null) ccBranch = ccBranch.parent;

        const validBranches = centralNode.children.filter(
          (branch) =>
            branch && branch.state === "alive" && !branch.isSatellite &&
            !branch.isUnderDDOS && branch !== ccBranch && branch.hasFirewall
        );

        if (validBranches.length === 0) return;

        validBranches.sort((a, b) => countDescendants(b) - countDescendants(a));

        if (Math.random() < Math.min(1, 0.2 * afm)) {
          ccNode.ddosState = "charging";
          ccNode.ddosChargeStart = now;
          ccNode.ddosTargetBranch = validBranches[0];
          ccNode.ddosBotnets = connectedBotnets;

          logEvent("ddosCharging", {
            ccNode, botnetCount: connectedBotnets.length, targetBranch: ccNode.ddosTargetBranch,
          });
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     isNodeInDDOSBranch  —  utility check
     ══════════════════════════════════════════════════════════════════════ */

  function isNodeInDDOSBranch(node) {
    if (!node || node.parent === null) return false;

    let current = node;
    while (current.parent && current.parent.parent !== null) current = current.parent;
    return current.isUnderDDOS === true;
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  const DDOSSystem = {
    configure(deps = {}) {
      if (deps.getNodes !== undefined) getNodes = deps.getNodes;
      if (deps.getEdges !== undefined) getEdges = deps.getEdges;
      if (deps.getAttackFreqMultiplier !== undefined) attackFreqMultiplier = deps.getAttackFreqMultiplier;
      if (deps.logEvent !== undefined) logEventFn = deps.logEvent;
      if (deps.incrementStat !== undefined) incrementStatFn = deps.incrementStat;
      if (deps.getLogNodeRef !== undefined) getLogNodeRefFn = deps.getLogNodeRef;
      if (deps.countDescendants !== undefined) countDescendantsFn = deps.countDescendants;
      return this;
    },

    manageDDOSAttacks,
    isNodeInDDOSBranch,
  };

  window.NodeNet.DDOSSystem = DDOSSystem;
})();