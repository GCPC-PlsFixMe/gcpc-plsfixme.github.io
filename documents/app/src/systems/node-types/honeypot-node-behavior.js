/**
 * @module HoneypotNodeBehavior
 * @summary Draws honeypot trap nodes — honey pot (🍯) with viscous glow, drips, and swirl effects.
 * @exports registers "honeypot" behavior with window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, honeypot, trap, honey, glow, draw, defense
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  /**
   * Matches honeypot nodes regardless of status so the emoji persists
   * through impacted and down states.
   * @param {object} node
   * @returns {boolean}
   */
  function matches(node) {
    return node.isHoneypot;
  }

  /**
   * Draw the honeypot emoji icon.
   * @param {object} node
   */
  function drawIcon(node) {
    const ctx = Registry.getCtx();
    if (!ctx) return;

    const iconSize = node.radius * 1.2;
    if (iconSize < 4) return;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = `rgba(0, 0, 0, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    ctx.fillText("🍯", 0, iconSize * 0.05);
    ctx.restore();
  }

  /**
   * Draw the viscous honey effect — golden glow, drips, and swirls.
   * @param {object} node
   */
  function drawEffects(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    if (!ctx || !colors) return;

    const now = Date.now();
    const phase = node.honeyPhase + now * 0.001;

    ctx.save();
    ctx.translate(node.x, node.y);

    // Outer honey glow with breathing effect
    const breathe = Math.sin(phase * 0.8) * 0.3 + 0.7;
    const glowRadius = node.radius * (1.6 + Math.sin(phase * 0.5) * 0.2);
    const gradient = ctx.createRadialGradient(0, 0, node.radius * 0.5, 0, 0, glowRadius);
    gradient.addColorStop(0, `rgba(${colors.honeypot.r}, ${colors.honeypot.g}, ${colors.honeypot.b}, ${0.4 * breathe * node.opacity})`);
    gradient.addColorStop(0.6, `rgba(${colors.honeypot.r}, ${colors.honeypot.g}, ${colors.honeypot.b}, ${0.2 * breathe * node.opacity})`);
    gradient.addColorStop(1, `rgba(${colors.honeypot.r}, ${colors.honeypot.g}, ${colors.honeypot.b}, 0)`);

    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Viscous honey drips
    const dripCount = 5;
    for (let i = 0; i < dripCount; i++) {
      const dripPhase = phase + (i * Math.PI * 2 / dripCount);
      const angle = (i / dripCount) * Math.PI * 2 + Math.sin(dripPhase * 0.3) * 0.2;
      const dripLength = node.radius * (0.3 + Math.sin(dripPhase) * 0.15 + Math.sin(dripPhase * 2.3) * 0.1);
      const dripWidth = node.radius * (0.25 + Math.sin(dripPhase * 1.7) * 0.08);

      const baseX = Math.cos(angle) * node.radius;
      const baseY = Math.sin(angle) * node.radius;
      const tipX = Math.cos(angle) * (node.radius + dripLength);
      const tipY = Math.sin(angle) * (node.radius + dripLength);

      ctx.beginPath();
      ctx.moveTo(baseX - Math.sin(angle) * dripWidth * 0.5, baseY + Math.cos(angle) * dripWidth * 0.5);
      ctx.quadraticCurveTo(tipX, tipY, baseX + Math.sin(angle) * dripWidth * 0.5, baseY - Math.cos(angle) * dripWidth * 0.5);
      ctx.closePath();

      const dripAlpha = 0.5 + Math.sin(dripPhase * 0.5) * 0.2;
      ctx.fillStyle = `rgba(${colors.honeypot.r}, ${colors.honeypot.g}, ${colors.honeypot.b}, ${dripAlpha * node.opacity})`;
      ctx.fill();
    }

    // Inner honey swirl
    const swirlCount = 3;
    for (let i = 0; i < swirlCount; i++) {
      const swirlPhase = phase * 0.7 + (i * Math.PI * 2 / swirlCount);
      const swirlAngle = swirlPhase * 0.5;
      const swirlRadius = node.radius * (0.4 + i * 0.15);
      const swirlX = Math.cos(swirlAngle) * swirlRadius * 0.3;
      const swirlY = Math.sin(swirlAngle) * swirlRadius * 0.3;

      ctx.beginPath();
      ctx.arc(swirlX, swirlY, swirlRadius * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 100, ${0.15 * node.opacity})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // Register with the behavior registry
  if (Registry) {
    Registry.register({
      name: "honeypot-node",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }
})();