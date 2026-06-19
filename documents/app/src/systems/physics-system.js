/**
 * @module PhysicsSystem
 * @summary Per-node positioning forces — tree springs, sibling separation, expansion, mesh clustering, integration.
 * @description Public API: `PhysicsSystem.configure(deps)` and
 *   `PhysicsSystem.applyPerNodeForces(node)` (runs all per-node physics).
 * @exports window.NodeNet.PhysicsSystem
 * @tags physics, forces, spring, separation, repulsion, integration, layout, botnet-mesh, damping
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────── */
  let nodes = [];
  let edges = [];
  let getNodes = () => nodes;
  let getEdges = () => edges;
  let canvasRef = null;
  let padding = 0;
  let getDraggedNode = () => null;

  function refresh() {
    nodes = getNodes();
    edges = getEdges();
  }

  function getDepthFromCenter(node) {
    let depth = 0;
    let current = node;
    while (current && current.parent) {
      depth += 1;
      current = current.parent;
      if (depth > 64) break;
    }
    return depth;
  }

  /* ══════════════════════════════════════════════════════════════════════
     applyPerNodeForces  —  per-node physics: springs, repulsion, expansion,
     centrality positioning, botnet clustering, boundary repulsion, damping
     ══════════════════════════════════════════════════════════════════════ */

  function applyPerNodeForces(node) {
    if (node.state !== "alive" || node === getDraggedNode()) return;

      const damping = 0.85;
      const centerX = canvasRef.width / 2;
      const centerY = canvasRef.height / 2;

      if (node.parent === null && !node.isSatellite) {
        // Central node: Strong anchor to center
        node.fx += (centerX - node.x) * 0.05;
        node.fy += (centerY - node.y) * 0.05;
      } else if (node.isSatellite) {
        // FREE-FLOATING SATELLITES: No parent physics
        // Orbital mechanics are handled separately below
      } else {
        // === SIMPLIFIED TREE PHYSICS ===
        // Four forces: first-gen anchor, parent spring, outward expansion, node repulsion.

        const dx = node.x - node.parent.x;
        const dy = node.y - node.parent.y;
        const distToParent = Math.sqrt(dx * dx + dy * dy);
        const isFirstGen = node.parent.parent === null;

        // 1. FIRST-GEN ANCHOR: lock main branch roots to their spawn position
        if (isFirstGen) {
          const anchorStrength = 0.08 * node.forceMultiplier;
          node.fx += (node.baseX - node.x) * anchorStrength;
          node.fy += (node.baseY - node.y) * anchorStrength;
        }

        // 2. PARENT SPRING: maintain ideal link length
        // First-gen nodes get a stiffer spring so branches stay taut;
        // deeper nodes get a weaker spring so they can stretch outward.
        const idealEdgeLength = isFirstGen ? 145 : 105;
        const springStrength = isFirstGen ? 0.05 : 0.025;
        if (distToParent > 0.1) {
          const springForce =
            (distToParent - idealEdgeLength) *
            springStrength *
            node.forceMultiplier;
          node.fx -= (dx / distToParent) * springForce;
          node.fy -= (dy / distToParent) * springForce;
        }

        // 3. OUTWARD EXPANSION: strong push away from center toward edges
        if (!node.isSatellite && !node.isGroundStation) {
          const toCenterX = node.x - centerX;
          const toCenterY = node.y - centerY;
          const distToCenter = Math.sqrt(
            toCenterX * toCenterX + toCenterY * toCenterY
          );
          if (distToCenter > 0.1) {
            // Base outward push (constant) + distance-scaled push (grows as node moves out)
            const expansionStrength = 0.035 * node.forceMultiplier;
            const distanceScale = 1.0 + distToCenter * 0.002;
            node.fx +=
              (toCenterX / distToCenter) *
              expansionStrength *
              distanceScale;
            node.fy +=
              (toCenterY / distToCenter) *
              expansionStrength *
              distanceScale;
          }
        }

        // 4. NODE REPULSION: simple Coulomb-like push from all nearby non-family nodes
        if (!node.isSatellite) {
          for (const other of getNodes()) {
            if (
              other === node ||
              other === node.parent ||
              other.state !== "alive"
            )
              continue;
            if (node.children && node.children.includes(other)) continue;
            if (other.isSatellite) continue;

            const ox = node.x - other.x;
            const oy = node.y - other.y;
            const oDist = Math.sqrt(ox * ox + oy * oy);
            const minDist = 90;

            if (oDist < minDist && oDist > 0.1) {
              const repelForce =
                (minDist - oDist) * 0.018 * node.forceMultiplier;
              node.fx += (ox / oDist) * repelForce;
              node.fy += (oy / oDist) * repelForce;
            }
          }
        }

        // 5. BOTNET MESH CLUSTERING: keep infected nodes in rings around C&C
        const isInfected =
          node.status === "malware" ||
          node.status === "botnet" ||
          node.status === "commandControl";
        if (isInfected && node.status !== "commandControl") {
          const ccConnection = getEdges().find(
            (e) =>
              e.isBotnetMesh &&
              ((e.from === node && e.to.status === "commandControl") ||
                (e.to === node && e.from.status === "commandControl"))
          );
          if (ccConnection) {
            const ccNode =
              ccConnection.from === node ? ccConnection.to : ccConnection.from;
            const MIGRATION_DURATION = 5000;
            const timeSinceFormation =
              Date.now() - (node.botnetFormationTime || 0);
            const inMigration = timeSinceFormation < MIGRATION_DURATION;
            const migrationStrength = inMigration
              ? Math.max(0.3, 1 - timeSinceFormation / MIGRATION_DURATION)
              : 0.15;
            const allBotnets = getEdges()
              .filter(
                (e) =>
                  e.isBotnetMesh && (e.from === ccNode || e.to === ccNode)
              )
              .map((e) => (e.from === ccNode ? e.to : e.from))
              .filter((n) => n && n.state === "alive" && n !== node);
            const myMeshCount = getEdges().filter(
              (e) => e.isBotnetMesh && (e.from === node || e.to === node)
            ).length;
            const INNER_RING = 55;
            const OUTER_RING = 90;
            const targetRadius = myMeshCount >= 3 ? INNER_RING : OUTER_RING;
            const dxCC = node.x - ccNode.x;
            const dyCC = node.y - ccNode.y;
            const distCC = Math.sqrt(dxCC * dxCC + dyCC * dyCC);
            if (distCC > 0.1) {
              const radialDisplacement = distCC - targetRadius;
              const radialForce =
                radialDisplacement * 0.04 * migrationStrength;
              node.fx -= (dxCC / distCC) * radialForce;
              node.fy -= (dyCC / distCC) * radialForce;
              const myAngle = Math.atan2(dyCC, dxCC);
              const sameRingNodes = allBotnets.filter((n) => {
                const nMesh = getEdges().filter(
                  (e) => e.isBotnetMesh && (e.from === n || e.to === n)
                ).length;
                const nRing = nMesh >= 3 ? INNER_RING : OUTER_RING;
                return Math.abs(nRing - targetRadius) < 20;
              });
              const idealAngleSep =
                (Math.PI * 2) / Math.max(1, sameRingNodes.length + 1);
              const minAngularDist = Math.min(idealAngleSep * 0.6, Math.PI / 3);
              sameRingNodes.forEach((sibling) => {
                const sdxCC = sibling.x - ccNode.x;
                const sdyCC = sibling.y - ccNode.y;
                const sibAngle = Math.atan2(sdyCC, sdxCC);
                let angleDiff = myAngle - sibAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                if (Math.abs(angleDiff) < minAngularDist) {
                  const pushDir = angleDiff > 0 ? 1 : -1;
                  const perpX = -dyCC / distCC;
                  const perpY = dxCC / distCC;
                  const angularForce =
                    (minAngularDist - Math.abs(angleDiff)) *
                    2.0 *
                    migrationStrength;
                  node.fx += perpX * angularForce * pushDir;
                  node.fy += perpY * angularForce * pushDir;
                }
              });
              allBotnets.forEach((sibling) => {
                const sdx = node.x - sibling.x;
                const sdy = node.y - sibling.y;
                const sibDist = Math.sqrt(sdx * sdx + sdy * sdy);
                const minSibDist = 40;
                if (sibDist < minSibDist && sibDist > 0.1) {
                  const repelForce =
                    (minSibDist - sibDist) * 0.03 * migrationStrength;
                  node.fx += (sdx / sibDist) * repelForce;
                  node.fy += (sdy / sibDist) * repelForce;
                }
              });
            }
            if (inMigration && node.parent) {
              const tdx = node.x - node.parent.x;
              const tdy = node.y - node.parent.y;
              const tDist = Math.sqrt(tdx * tdx + tdy * tdy);
              if (tDist > 0.1) {
                const counterForce = 0.015 * migrationStrength;
                node.fx += (tdx / tDist) * counterForce * (tDist - 80);
                node.fy += (tdy / tDist) * counterForce * (tDist - 80);
              }
            }
          }
        }
      }

      // BOUNDARY REPULSION (skip for satellites - they wrap around)
      if (!node.isSatellite) {
        const boundaryBuffer = 60;
        const boundaryStrength = 0.04;

        if (node.x < padding + boundaryBuffer) {
          node.fx +=
            (padding + boundaryBuffer - node.x) * boundaryStrength;
        }
        if (node.x > canvasRef.width - padding - boundaryBuffer) {
          node.fx -=
            (node.x - (canvasRef.width - padding - boundaryBuffer)) *
            boundaryStrength;
        }
        if (node.y < padding + boundaryBuffer) {
          node.fy +=
            (padding + boundaryBuffer - node.y) * boundaryStrength;
        }
        if (node.y > canvasRef.height - padding - boundaryBuffer) {
          node.fy -=
            (node.y - (canvasRef.height - padding - boundaryBuffer)) *
            boundaryStrength;
        }
      }

      // SatelliteSystem owns launch arcs, elliptical orbit motion, and uplink fading.
      SatelliteSystem.updateOrbit(node);

      // ANGULAR DAMPING: Reduce rotational momentum around center
      // Skip for satellites - they maintain lateral momentum
      if (!node.isSatellite) {
        const toCenterX = node.x - centerX;
        const toCenterY = node.y - centerY;
        const distFromCenter = Math.sqrt(
          toCenterX * toCenterX + toCenterY * toCenterY
        );

        if (distFromCenter > 10) {
          // Normalize radial direction
          const radialX = toCenterX / distFromCenter;
          const radialY = toCenterY / distFromCenter;

          // Tangential direction (perpendicular to radial)
          const tangentX = -radialY;
          const tangentY = radialX;

          // Project current force onto tangential direction
          const tangentialForce = node.fx * tangentX + node.fy * tangentY;

          // Apply counter-force to reduce rotation (40% damping)
          const angularDamping = 0.4;
          node.fx -= tangentX * tangentialForce * angularDamping;
          node.fy -= tangentY * tangentialForce * angularDamping;
        }
      }

      // Apply physics forces smoothly
      node.x += node.fx;
      node.y += node.fy;

      // IMPROVED: Dynamic damping
      if (node.currentDamping < 0.85) {
        node.currentDamping += 0.005;
      }

      const effectiveDamping = node.isSatellite
        ? 0.98
        : Math.min(node.currentDamping || 0.78, 0.82);
      node.fx *= effectiveDamping;
      node.fy *= effectiveDamping;

      // Update base position to follow actual position (for drawing/reference)
      node.baseX = node.x;
      node.baseY = node.y;

      // Hard clamp as safety net (skip for satellites - they can orbit off-screen)
      if (!node.isSatellite) {
        const hardPadding = padding + 15;
        node.x = Math.max(
          hardPadding,
          Math.min(canvasRef.width - hardPadding, node.x)
        );
        node.y = Math.max(
          hardPadding,
          Math.min(canvasRef.height - hardPadding, node.y)
        );
      }
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  const PhysicsSystem = {
    configure(deps = {}) {
      if (deps.getNodes !== undefined) getNodes = deps.getNodes;
      if (deps.getEdges !== undefined) getEdges = deps.getEdges;
      if (deps.canvas !== undefined) canvasRef = deps.canvas;
      if (deps.padding !== undefined) padding = deps.padding;
      if (deps.getDraggedNode !== undefined) getDraggedNode = deps.getDraggedNode;
      return this;
    },

    applyPerNodeForces,
  };

  window.NodeNet.PhysicsSystem = PhysicsSystem;
})();
