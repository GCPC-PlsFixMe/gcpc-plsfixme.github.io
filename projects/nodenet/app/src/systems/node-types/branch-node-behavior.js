/**
 * @module BranchNodeBehavior
 * @summary Draws regular branch nodes by status (green → check/firewall shield, red → stop, yellow → warning) plus the shared immunity heal ring.
 * @exports registers "branch" behavior with window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, branch, healthy, warning, down, firewall, immunity-ring, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  /**
   * Returns true for regular branch nodes that are NOT special types
   * (guardian, datacenter, honeypot, ground station, satellite, C&C, malware/botnet).
   * @param {object} node
   * @returns {boolean}
   */
  function matches(node) {
    return (
      node.parent !== null &&
      !node.isGuardian &&
      !node.isDatacenter &&
      !node.isHoneypot &&
      !node.isGroundStation &&
      !node.isSatellite &&
      node.status !== "commandControl" &&
      node.status !== "malware" &&
      node.status !== "botnet"
    );
  }

  /**
   * Draw the status icon (checkmark/stop/triangle) for a branch node.
   * @param {object} node
   */
  function drawIcon(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    if (!ctx || !colors) return;

    const iconSize = node.radius * 1.2;
    if (iconSize < 4) return;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (node.status === "green") {
      ctx.fillStyle = node.hasFirewall
        ? `rgba(0, 0, 0, ${node.opacity})`
        : `rgba(255, 255, 255, ${node.opacity})`;
      ctx.font = `bold ${iconSize}px sans-serif`;
      const icon = node.hasFirewall ? "🛡️" : "✔️";
      ctx.fillText(icon, 0, iconSize * 0.1);
    } else if (node.status === "red") {
      ctx.fillStyle = `rgba(0, 0, 0, ${node.opacity})`;
      ctx.font = `bold ${iconSize}px sans-serif`;
      ctx.fillText("⛔", 0, iconSize * 0.1);
    } else if (node.status === "yellow") {
      ctx.fillStyle = `rgba(0, 0, 0, ${node.opacity})`;
      ctx.font = `bold ${iconSize}px sans-serif`;
      ctx.fillText("⚠️", 0, 0);
    }

    ctx.restore();
  }

  /**
   * Draw the immunity healing progress ring (shared by all branch nodes).
   * @param {object} node
   */
  function drawEffects(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    const healSpeedMult = Registry.getHealSpeedMultiplier();

    if (!ctx || !colors) return;
    if (!node.isImmunityHealing || node.attachedImmunityPackets.length === 0) return;

    const BASE_HEAL_TIME = 120000 / healSpeedMult;

    let regularCount = 0;
    let superchargedCount = 0;
    node.attachedImmunityPackets.forEach((packet) => {
      if (packet.isSupercharged) superchargedCount++;
      else regularCount++;
    });

    const effectivePackets = (regularCount + superchargedCount * 2) / 2;
    const healTime = BASE_HEAL_TIME / effectivePackets;
    const elapsed = Date.now() - node.immunityHealingStartTime;
    const progress = Math.min(1, elapsed / healTime);

    ctx.save();
    ctx.translate(node.x, node.y);

    const progressBarRadius = node.radius + 12;
    const lineWidth = 3;

    // Background circle
    ctx.beginPath();
    ctx.arc(0, 0, progressBarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${node.opacity * 0.2})`;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Progress arc
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + progress * Math.PI * 2;
    ctx.arc(0, 0, progressBarRadius, startAngle, endAngle);

    if (superchargedCount > 0) {
      ctx.strokeStyle = `rgba(${colors.gold.r}, ${colors.gold.g}, ${colors.gold.b}, ${node.opacity})`;
      ctx.shadowColor = `rgba(${colors.gold.r}, ${colors.gold.g}, ${colors.gold.b}, 1)`;
    } else {
      ctx.strokeStyle = `rgba(255, 255, 255, ${node.opacity})`;
      ctx.shadowColor = `rgba(255, 255, 255, 0.5)`;
    }
    ctx.shadowBlur = 8;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // Register with the behavior registry
  if (Registry) {
    Registry.register({
      name: "branch-node",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }
})();