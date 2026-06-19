/**
 * @module GroundStationBehavior
 * @summary Draws ground station (wireless tower) nodes — dish (📡), launch (🚀) with rings/status, and a 7-segment countdown timer.
 * @exports registers "groundStation" behavior with window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, ground-station, antenna, launch, countdown, wireless, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  const SATELLITE_LAUNCH_DURATION = 6000;

  /**
   * Matches ground station nodes.
   * @param {object} node
   * @returns {boolean}
   */
  function matches(node) {
    return node.isGroundStation;
  }

  /**
   * Draw the ground station icon (📡 or 🚀 during launch).
   * @param {object} node
   */
  function drawIcon(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    if (!ctx || !colors) return;

    const iconSize = node.radius * 1.1;
    if (iconSize < 4) return;

    // If countdown is active, the countdown display handles visuals
    if (node.groundStationCountdown > 0) return;

    const isLaunching =
      node.launchAnimationUntil &&
      Date.now() < node.launchAnimationUntil;
    const launchDuration = node.lastSatelliteLaunch && node.launchAnimationUntil
      ? Math.max(1, node.launchAnimationUntil - node.lastSatelliteLaunch)
      : SATELLITE_LAUNCH_DURATION;
    const launchElapsed = isLaunching ? Date.now() - node.lastSatelliteLaunch : 0;
    const launchProgress = isLaunching ? Math.min(1, launchElapsed / launchDuration) : 0;
    const launchPulse = isLaunching ? 1 + Math.sin(Date.now() * 0.04 + node.radius) * 0.2 : 1;
    const icon = isLaunching ? "🚀" : "📡";

    ctx.save();
    ctx.translate(node.x, node.y);

    if (isLaunching) {
      // Launch glow halo
      const glowRadius = node.radius * 1.55 * launchPulse;
      const launchAlpha = node.opacity * (1 - Math.min(1, launchProgress + 0.1));
      const glowGradient = ctx.createRadialGradient(0, 0, node.radius * 0.5, 0, 0, glowRadius);
      glowGradient.addColorStop(0, `rgba(${colors.neonGreen.r}, ${colors.neonGreen.g}, ${colors.neonGreen.b}, ${0.75 * launchAlpha})`);
      glowGradient.addColorStop(0.75, `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${0.2 * launchAlpha})`);
      glowGradient.addColorStop(1, `rgba(0, 0, 0, 0)`);

      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Animated launch rings
      for (let i = 0; i < 3; i++) {
        const ringRadius = node.radius * (1.35 + i * 0.2 + Math.max(0, launchProgress - i * 0.12));
        const ringAlpha = (0.22 * (1 - i * 0.2)) * (1 - launchProgress);
        if (ringAlpha <= 0) continue;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colors.satellite.r}, ${colors.satellite.g}, ${colors.satellite.b}, ${ringAlpha * node.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Launch status text
      const launchText = node.launchStatusText || "IGNITION";

      ctx.save();
      ctx.globalAlpha = (1 - launchProgress) * 0.8;
      ctx.font = `bold ${Math.max(8, iconSize * 0.55)}px monospace`;
      ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(launchText, 0, -node.radius * 1.8);
      ctx.restore();
    }

    ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    ctx.fillText(icon, 0, iconSize * 0.05);
    ctx.restore();
  }

  /**
   * Draw the 7-segment LED countdown timer when active.
   * @param {object} node
   */
  function drawEffects(node) {
    const ctx = Registry.getCtx();
    const CONFIG = Registry.getConfig();
    if (!ctx || !CONFIG) return;
    if (node.groundStationCountdown <= 0) return;

    const countdownDuration = CONFIG.groundStation?.launchCountdown || 10000;
    const safeCountdown = Math.max(0, Math.min(countdownDuration, node.groundStationCountdown || 0));
    const now = Date.now();
    const opacity = node.opacity;
    const progress = Math.max(0, Math.min(1, 1 - safeCountdown / countdownDuration));
    const tickDuration = 1000;
    const remainingSeconds = Math.max(0, Math.ceil(safeCountdown / tickDuration));
    const tickProgress = 1 - ((safeCountdown % tickDuration) / tickDuration || 1);

    const pulse = 0.5 + 0.5 * Math.sin(now * 0.012 + node.radius * 0.3);
    const tickEase = 1 - Math.pow(1 - tickProgress, 3);
    const redChannel = Math.round(215 + 40 * pulse);
    const amberChannel = Math.round(70 + 60 * pulse);
    const segmentOnColor = `rgba(${redChannel}, ${amberChannel}, 28, ${opacity})`;
    const segmentHotColor = `rgba(255, 210, 96, ${opacity})`;
    const segmentShadowColor = `rgba(255, 60, 24, ${Math.min(0.75, 0.35 + 0.25 * pulse) * opacity})`;
    const segmentOffColor = `rgba(42, 10, 8, ${Math.max(0.28, opacity * 0.38)})`;

    const glyphStates = {
      0: [1, 1, 1, 1, 1, 1, 0], 1: [0, 1, 1, 0, 0, 0, 0],
      2: [1, 1, 0, 1, 1, 0, 1], 3: [1, 1, 1, 1, 0, 0, 1],
      4: [0, 1, 1, 0, 0, 1, 1], 5: [1, 0, 1, 1, 0, 1, 1],
      6: [1, 0, 1, 1, 1, 1, 1], 7: [1, 1, 1, 0, 0, 0, 0],
      8: [1, 1, 1, 1, 1, 1, 1], 9: [1, 1, 1, 1, 0, 1, 1],
      T: [0, 1, 1, 0, 0, 0, 1], "-": [0, 0, 0, 0, 0, 0, 1],
    };

    const drawSegment = (x, y, w, h, on, flash = 0) => {
      const radius = Math.max(0.6, Math.min(w, h) * 0.45);
      const drawRoundRect = (rx, ry, rw, rh) => {
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, radius);
        ctx.fill();
      };
      if (on) {
        ctx.shadowColor = segmentShadowColor;
        ctx.shadowBlur = 5 + flash * 7;
        ctx.fillStyle = segmentShadowColor;
        drawRoundRect(x - 0.45 - flash, y - 0.45 - flash, w + 0.9 + flash * 2, h + 0.9 + flash * 2);
        ctx.fillStyle = flash > 0
          ? segmentHotColor
          : segmentOnColor;
        drawRoundRect(x, y, w, h);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = segmentOffColor;
        drawRoundRect(x, y, w, h);
      }
    };

    const drawGlyph = (glyphKey, centerX, centerY, width, thickness, flash = 0) => {
      const pattern = glyphStates[glyphKey] || glyphStates[0];
      const w = width, t = thickness;
      const h = Math.max(w * 1.45, t * 4);
      const vLen = Math.max(0.8, (h - 3 * t) / 2);
      const x = centerX - w / 2, y = centerY - h / 2;

      [
        { x: x + t, y: y, w: w - 2 * t, h: t, on: pattern[0] },
        { x: x + w - t, y: y + t, w: t, h: vLen, on: pattern[1] },
        { x: x + w - t, y: y + t + vLen + t, w: t, h: vLen, on: pattern[2] },
        { x: x + t, y: y + 2 * (t + vLen), w: w - 2 * t, h: t, on: pattern[3] },
        { x: x, y: y + t + vLen + t, w: t, h: vLen, on: pattern[4] },
        { x: x, y: y + t, w: t, h: vLen, on: pattern[5] },
        { x: x + t, y: y + t + vLen, w: w - 2 * t, h: t, on: pattern[6] },
      ].forEach((seg) => drawSegment(seg.x, seg.y, seg.w, seg.h, seg.on, flash));
    };

    ctx.save();
    ctx.translate(node.x, node.y);

    // Countdown ring
    const ringRadius = Math.max(6, node.radius - 2);
    const ringWidth = Math.max(1.6, node.radius * 0.1);

    // 7-segment digits
    const digits = String(remainingSeconds).padStart(2, "0").slice(-2);
    let digitWidth = Math.max(3.2, node.radius * 0.34);
    let prefixWidth = Math.max(2.2, node.radius * 0.22);
    let dashWidth = Math.max(2.0, node.radius * 0.19);
    let gap = Math.max(0.7, node.radius * 0.055);
    let thickness = Math.max(0.85, node.radius * 0.082);

    let totalWidth = prefixWidth + gap + dashWidth + gap + digitWidth + gap + digitWidth;
    const maxTextWidth = node.radius * 1.5;
    if (totalWidth > maxTextWidth) {
      const scale = maxTextWidth / totalWidth;
      digitWidth *= scale; prefixWidth *= scale; dashWidth *= scale;
      gap *= scale; thickness = Math.max(0.7, thickness * scale);
      totalWidth = prefixWidth + gap + dashWidth + gap + digitWidth + gap + digitWidth;
    }

    const panelWidth = Math.max(node.radius * 1.72, totalWidth + node.radius * 0.22);
    const panelHeight = Math.max(node.radius * 0.72, digitWidth * 1.58 + node.radius * 0.12);
    const panelGradient = ctx.createLinearGradient(0, -panelHeight / 2, 0, panelHeight / 2);
    panelGradient.addColorStop(0, `rgba(12, 18, 22, ${0.86 * opacity})`);
    panelGradient.addColorStop(0.5, `rgba(28, 8, 8, ${0.78 * opacity})`);
    panelGradient.addColorStop(1, `rgba(4, 8, 12, ${0.88 * opacity})`);
    ctx.shadowColor = `rgba(0, 0, 0, ${0.7 * opacity})`;
    ctx.shadowBlur = 7;
    ctx.fillStyle = panelGradient;
    ctx.beginPath();
    ctx.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, Math.max(3, node.radius * 0.12));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 100, 40, ${0.35 * opacity})`;
    ctx.lineWidth = Math.max(0.7, node.radius * 0.035);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.45})`;
    ctx.lineWidth = ringWidth;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = `rgba(${redChannel}, ${amberChannel}, 28, ${opacity * (0.68 + 0.22 * pulse)})`;
    ctx.lineWidth = ringWidth;
    ctx.lineCap = "round";
    ctx.stroke();

    const startX = -totalWidth / 2;
    const digitFlash = Math.max(0, 1 - tickEase) * 0.55;
    const digitYOffset = Math.sin(tickEase * Math.PI) * -0.35;
    drawGlyph("T", startX + prefixWidth / 2, 0, prefixWidth, thickness * 0.95);
    drawGlyph("-", startX + prefixWidth + gap + dashWidth / 2, 0, dashWidth, thickness * 0.95);
    drawGlyph(Number(digits[0]), startX + prefixWidth + gap + dashWidth + gap + digitWidth / 2, digitYOffset, digitWidth, thickness, digitFlash);
    drawGlyph(Number(digits[1]), startX + prefixWidth + gap + dashWidth + gap + digitWidth + gap + digitWidth / 2, digitYOffset, digitWidth, thickness, digitFlash);

    ctx.restore();
  }

  // Register with the behavior registry
  if (Registry) {
    Registry.register({
      name: "ground-station",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }
})();