/**
 * @module CommandControlBehavior
 * @summary Draws Command & Control (C&C) nodes — skull (💀) with a segmented warning ring.
 * @exports registers "commandControl" behavior with window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, command-control, c2, skull, botnet, ddos, draw, threat
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  /**
   * Matches nodes with commandControl status.
   * @param {object} node
   * @returns {boolean}
   */
  function matches(node) {
    return node.status === "commandControl";
  }

  /**
   * Draw the skull icon with segmented warning ring.
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

    // Draw segmented warning ring around node
    const ringRadius = node.radius * 1.8;
    const segments = 8;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const nextAngle = ((i + 1) / segments) * Math.PI * 2;

      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, angle, nextAngle);
        ctx.strokeStyle = `rgba(${colors.commandControl.r}, ${colors.commandControl.g}, ${colors.commandControl.b}, ${node.opacity * 0.8})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Draw skull emoji in center
    ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    ctx.fillText("💀", 0, iconSize * 0.05);

    ctx.restore();
  }

  /** C&C nodes have no additional effects drawn by this module. */
  function drawEffects(/* node */) { /* no-op */ }

  // Register with the behavior registry
  if (Registry) {
    Registry.register({
      name: "command-control",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }
})();