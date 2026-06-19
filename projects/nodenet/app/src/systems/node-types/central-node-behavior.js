/**
 * @module CentralNodeBehavior
 * @summary Draws the central (root) node — rotating 3D globe, self-heal wrench (🛠️) + antibody spinner, bot-defense aura; delegates to malware draw when infected.
 * @exports registers "central" behavior with window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, central, root, globe, self-heal, bot-defense, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const Registry = window.NodeNet.NodeBehaviorRegistry;

  /**
   * Matches the central node (parent === null, not a satellite).
   * @param {object} node
   * @returns {boolean}
   */
  function matches(node) {
    return node.parent === null && !node.isSatellite;
  }

  // ---- Icon dispatch ----

  /**
   * Draw the appropriate icon for the central node based on its current state.
   * @param {object} node
   */
  function drawIcon(node) {
    if (node.isSelfHealing) {
      drawWrenchIcon(node);
    } else if (node.status === "malware") {
      // Delegate to malware behavior for the central node's malware icon
      drawMalwareIconForCentral(node);
    } else {
      drawGlobe(node);
    }
  }

  // ---- Effects ----

  /**
   * Draw state-specific effects for the central node.
   * @param {object} node
   */
  function drawEffects(node) {
    if (node.botDefenseModeActive) {
      drawBotDefenseMode(node);
    }
    if (node.isSelfHealing) {
      drawAntibodySpinner(node);
    }
  }

  // ---- Globe ----

  function drawGlobe(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    if (!ctx || !colors) return;

    ctx.save();

    const rotation = node.time * 0.008;
    const tilt = Math.PI / 6;

    // Atmospheric glow
    const gradient = ctx.createRadialGradient(node.x, node.y, node.radius * 0.8, node.x, node.y, node.radius * 1.4);
    gradient.addColorStop(0, `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, 0)`);
    gradient.addColorStop(0.5, `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, ${0.15 * node.opacity})`);
    gradient.addColorStop(1, `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, 0)`);

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Inner glow
    const innerGlow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
    innerGlow.addColorStop(0, `rgba(255, 255, 255, ${0.3 * node.opacity})`);
    innerGlow.addColorStop(0.5, `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, ${0.1 * node.opacity})`);
    innerGlow.addColorStop(1, `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, 0)`);

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = innerGlow;
    ctx.fill();

    // Latitude lines
    const latitudes = 7;
    for (let i = 1; i < latitudes; i++) {
      const lat = (i / latitudes) * Math.PI - Math.PI / 2;
      const y = Math.sin(lat);
      const radiusAtLat = Math.cos(lat);

      ctx.beginPath();
      ctx.ellipse(node.x, node.y + y * node.radius * Math.cos(tilt), radiusAtLat * node.radius, radiusAtLat * node.radius * Math.sin(tilt), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${node.opacity * 0.15})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Equator
    ctx.beginPath();
    ctx.ellipse(node.x, node.y, node.radius, node.radius * Math.sin(tilt), 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${node.opacity * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Longitude meridians
    const longitudes = 12;
    for (let i = 0; i < longitudes; i++) {
      const angle = (i / longitudes) * Math.PI + rotation;
      const visibility = Math.cos(angle);
      const opacity = visibility > 0 ? node.opacity * 0.3 * visibility : node.opacity * 0.08 * Math.abs(visibility);

      ctx.beginPath();
      ctx.ellipse(node.x, node.y, node.radius * Math.abs(Math.sin(angle)), node.radius, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.lineWidth = visibility > 0 ? 1 : 0.5;
      ctx.stroke();
    }

    // Prime meridian
    const primeMeridianAngle = rotation;
    const primeVisibility = Math.cos(primeMeridianAngle);
    if (primeVisibility > 0) {
      ctx.beginPath();
      ctx.ellipse(node.x, node.y, node.radius * Math.abs(Math.sin(primeMeridianAngle)), node.radius, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, ${node.opacity * 0.6 * primeVisibility})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Data points / continents
    const dataPoints = [
      { lat: 0.3, lon: 0 }, { lat: -0.2, lon: 0.8 }, { lat: 0.5, lon: 1.5 },
      { lat: -0.4, lon: 2.2 }, { lat: 0.1, lon: 3.0 }, { lat: 0.6, lon: 4.0 },
    ];

    dataPoints.forEach((point) => {
      const lon = point.lon + rotation;
      const lat = point.lat;
      const x3d = Math.cos(lat) * Math.sin(lon);
      const y3d = Math.sin(lat);
      const z3d = Math.cos(lat) * Math.cos(lon);

      if (z3d > 0) {
        const screenX = node.x + x3d * node.radius;
        const screenY = node.y + y3d * node.radius * Math.cos(tilt);
        const size = 2 + z3d * 2;
        const pointOpacity = node.opacity * z3d * 0.8;

        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, ${pointOpacity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(screenX, screenY, size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${node.currentColor.r}, ${node.currentColor.g}, ${node.currentColor.b}, ${pointOpacity * 0.2})`;
        ctx.fill();
      }
    });

    ctx.restore();
  }

  // ---- Bot Defense Mode ----

  function drawBotDefenseMode(node) {
    const ctx = Registry.getCtx();
    const colors = Registry.getColors();
    if (!ctx || !colors) return;

    const elapsed = Date.now() - node.botDefenseModeStart;
    const spin = elapsed * 0.003;
    const pulse = 0.5 + Math.sin(elapsed * 0.01) * 0.5;
    const outerRadius = node.radius * (1.9 + 0.2 * Math.sin(elapsed * 0.002));
    const innerRadius = outerRadius * 0.6;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.rotate(spin);

    // Outer ring (gold)
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colors.gold.r}, ${colors.gold.g}, ${colors.gold.b}, ${0.4 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner ring (white)
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colors.white.r}, ${colors.white.g}, ${colors.white.b}, ${0.25 + 0.35 * pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spokes (blue)
    const spokes = 8;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const len = innerRadius + (outerRadius - innerRadius) * (0.55 + 0.15 * Math.sin(elapsed * 0.004 + i));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.strokeStyle = `rgba(${colors.blue.r}, ${colors.blue.g}, ${colors.blue.b}, ${0.3 + 0.3 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---- Wrench Icon ----

  function drawWrenchIcon(node) {
    const ctx = Registry.getCtx();
    if (!ctx) return;

    const iconSize = node.radius * 1.2;
    if (iconSize < 4) return;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = `rgba(0, 0, 0, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${iconSize}px sans-serif`;
    ctx.fillText("🛠️", 0, iconSize * 0.05);
    ctx.restore();
  }

  // ---- Antibody Spinner ----

  function drawAntibodySpinner(node) {
    const ctx = Registry.getCtx();
    if (!ctx) return;

    ctx.save();
    ctx.translate(node.x, node.y);

    const elapsed = Date.now() - node.selfHealingStartTime;
    const duration = 5000;
    const progress = Math.min(1, elapsed / duration);
    const opacity = node.opacity;

    const progressBarRadius = node.radius + 10;
    const lineWidth = 4;

    // Background circle
    ctx.beginPath();
    ctx.arc(0, 0, progressBarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Progress arc
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + progress * Math.PI * 2;
    ctx.arc(0, 0, progressBarRadius, startAngle, endAngle);
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.restore();
  }

  // ---- Malware icon for central node (delegated) ----

  function drawMalwareIconForCentral(node) {
    const ctx = Registry.getCtx();
    if (!ctx) return;

    const iconSize = node.radius * 1.2;
    if (iconSize < 4) return;

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = `rgba(255, 255, 255, ${node.opacity})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${iconSize}px sans-serif`;
    const icon = node.status === "botnet" ? "🤖" : "👾";
    ctx.fillText(icon, 0, iconSize * 0.1);
    ctx.restore();
  }

  // Register with the behavior registry
  if (Registry) {
    Registry.register({
      name: "central-node",
      matches,
      drawIcon,
      drawEffects,
      drawBody: null,
    });
  }
})();