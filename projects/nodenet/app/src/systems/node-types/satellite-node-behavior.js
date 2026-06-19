/**
 * @module SatelliteNodeBehavior
 * @summary Draws orbital satellite nodes — launch (rocket body, plume, trail, stage separation) and in-orbit (🛰️).
 * @exports registers "satellite" behavior with window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, satellite, orbit, launch, rocket, wireless, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  const SATELLITE_LAUNCH_DURATION = 6000;

  /**
   * Matches satellite nodes.
   * @param {object} node
   * @returns {boolean}
   */
  function matches(node) {
    return node.isSatellite;
  }

  /**
   * Draw the satellite: rocket during launch, emoji in orbit.
   * @param {object} node
   */
  function drawIcon(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    const canvas = Registry.getCanvas();
    if (!ctx || !colors || !canvas) return;

    const iconSize = node.radius * 1.0;
    if (iconSize < 3) return;

    const hasActiveLaunch =
      node.launchStartTime &&
      Date.now() - node.launchStartTime < SATELLITE_LAUNCH_DURATION;

    if (hasActiveLaunch) {
      drawRocketLaunch(node, ctx, colors, canvas, iconSize);
      return;
    }

    // In orbit: draw satellite emoji
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    ctx.fillText("🛰️", 0, 0);
    ctx.restore();
  }

  /**
   * Draw the full rocket launch animation.
   */
  function drawRocketLaunch(node, ctx, colors, canvas, iconSize) {
    const now = Date.now();
    const launchElapsed = now - node.launchStartTime;
    const launchProgress = Math.max(0, Math.min(1, launchElapsed / SATELLITE_LAUNCH_DURATION));
    const eased = launchProgress;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const targetX = centerX + Math.cos(node.orbitalAngle) * node.orbitalRadiusX;
    const targetY = centerY + Math.sin(node.orbitalAngle) * node.orbitalRadiusY;

    const launchX = node.launchX ?? node.launchedFrom?.x ?? node.x;
    const launchY = node.launchY ?? node.launchedFrom?.y ?? node.y;

    const midX = (launchX + targetX) / 2;
    const midY = (launchY + targetY) / 2;

    const outX = midX - centerX;
    const outY = midY - centerY;
    const outLen = Math.hypot(outX, outY) || 1;
    const outUnitX = outX / outLen;
    const outUnitY = outY / outLen;

    const segDx = targetX - launchX;
    const segDy = targetY - launchY;
    const segLen = Math.hypot(segDx, segDy) || 1;

    const arcHeight = Math.min(520, Math.max(140, segLen * (node.launchArcHeight || 0.6)));

    const tanX = -outUnitY;
    const tanY = outUnitX;
    const side = node.orbitalDirection || 1;
    const sideOffset = Math.min(420, Math.max(160, arcHeight * 0.95)) * -side;

    const perpX = outUnitX * arcHeight + tanX * sideOffset;
    const perpY = outUnitY * arcHeight + tanY * sideOffset;

    const p0x = launchX, p0y = launchY;
    const p1x = midX + perpX, p1y = midY + perpY;
    const p2x = targetX, p2y = targetY;

    // Rocket direction (tangent of bezier at current t)
    const t = eased;
    const tx = 2 * (1 - t) * (p1x - p0x) + 2 * t * (p2x - p1x);
    const ty = 2 * (1 - t) * (p1y - p0y) + 2 * t * (p2y - p1y);
    const rocketAngle = Math.atan2(ty, tx);

    // Fading launch trail
    if (node.launchTrail && node.launchTrail.length >= 2) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const trailDuration = SATELLITE_LAUNCH_DURATION;
      const step = node.launchTrail.length > 110 ? 3 : node.launchTrail.length > 70 ? 2 : 1;
      for (let i = step; i < node.launchTrail.length; i += step) {
        const a = node.launchTrail[i - 1];
        const b = node.launchTrail[i];
        const age = Math.max(0, Math.min(1, (now - (b?.t ?? now)) / trailDuration));
        const p = 1 - age;
        const alpha = 0.03 + 0.38 * p;
        ctx.strokeStyle = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${alpha * node.opacity})`;
        ctx.lineWidth = 1.0 + p * 2.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Rocket body + plume
    const rocketLen = Math.max(10, iconSize * 1.25);
    const rocketWid = Math.max(5, iconSize * 0.55);

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.rotate(rocketAngle);

    // Engine plume — conical flame with red glow
    const plumePulse = 0.65 + 0.35 * Math.sin(now * 0.02);
    const plumeLen = rocketLen * 1.4;
    const plumeBase = rocketWid * 0.9;

    // Outer red glow
    ctx.beginPath();
    ctx.moveTo(-rocketLen * 0.35, -plumeBase * 0.8);
    ctx.lineTo(-rocketLen * 0.35 + plumeLen * 0.7, 0);
    ctx.lineTo(-rocketLen * 0.35, plumeBase * 0.8);
    ctx.lineTo(-rocketLen * 0.35 - plumeLen, 0);
    ctx.closePath();
    ctx.fillStyle = `rgba(220, 38, 38, ${0.25 * plumePulse * node.opacity})`;
    ctx.shadowColor = "rgba(220, 38, 38, 1)";
    ctx.shadowBlur = 16;
    ctx.fill();

    // Inner bright core
    ctx.beginPath();
    ctx.moveTo(-rocketLen * 0.35, -plumeBase * 0.4);
    ctx.lineTo(-rocketLen * 0.35 + plumeLen * 0.5, 0);
    ctx.lineTo(-rocketLen * 0.35, plumeBase * 0.4);
    ctx.lineTo(-rocketLen * 0.35 - plumeLen * 0.7, 0);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 180, 50, ${0.55 * plumePulse * node.opacity})`;
    ctx.shadowColor = "rgba(255, 180, 50, 1)";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Rocket triangle body
    ctx.beginPath();
    ctx.moveTo(rocketLen * 0.6, 0);
    ctx.lineTo(-rocketLen * 0.35, rocketWid * 0.55);
    ctx.lineTo(-rocketLen * 0.35, -rocketWid * 0.55);
    ctx.closePath();

    ctx.fillStyle = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.85 * node.opacity})`;
    ctx.shadowColor = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, 1)`;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${0.85 * node.opacity})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Stage separation animation
    if (node.stageSeparationTime) {
      const sepElapsed = now - node.stageSeparationTime;
      if (sepElapsed > 0 && sepElapsed < 1200) {
        const sepT = sepElapsed / 1200;
        const drift = rocketLen * (0.15 + sepT * 0.9);
        const wobble = Math.sin(now * 0.03) * rocketWid * 0.18;
        ctx.save();
        ctx.globalAlpha = (1 - sepT) * node.opacity;
        ctx.translate(-drift, wobble);
        ctx.rotate(-0.6 * sepT);
        ctx.fillStyle = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, 0.9)`;
        ctx.shadowColor = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, 1)`;
        ctx.shadowBlur = 10;
        ctx.fillRect(-rocketLen * 0.12, -rocketWid * 0.22, rocketLen * 0.24, rocketWid * 0.44);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /** No additional effects for satellite nodes. */
  function drawEffects(/* node */) { /* no-op */ }

  // Register with the behavior registry
  if (Registry) {
    Registry.register({
      name: "satellite-node",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }
})();