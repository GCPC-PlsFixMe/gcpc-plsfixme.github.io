/**
 * @module NodeInfoCard
 * @summary Floating info card shown when hovering a node on the canvas.
 * @description Listens for pointer movement over the network canvas, resolves the node
 *   under the cursor (reusing ToolState's screen→world hit-testing), and renders a compact
 *   overlay near the cursor with the node's friendly name, MAC address (id), type, status,
 *   tree depth, child count, defenses, and uptime. Pure DOM/CSS — drawn outside the canvas
 *   so it stays crisp under zoom. The card is created lazily and self-manages show/hide.
 * @exports window.NodeNet.NodeInfoCard
 * @tags ux, hover, tooltip, info-card, node-inspector, mac-address, friendly-name, overlay
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies ─────────────────────────────────────────────── */
  const dependencies = {
    getCanvas: () => null,
    getNodeAtPosition: () => null, // (screenX, screenY) => node|null
    getCentralNode: () => null,
  };

  let cardEl = null;
  let currentNode = null;
  let lastMouse = { x: 0, y: 0 };

  /* ── human-readable label maps ─────────────────────────────────────────── */
  const STATUS_LABELS = {
    green: "✅ Healthy",
    blue: "🔵 Core",
    yellow: "⚠️ Warning",
    red: "🟥 Down",
    malware: "☣️ Malware",
    botnet: "🤖 Botnet",
    commandControl: "☠️ Command & Control",
  };

  /**
   * Derive a descriptive type label for a node from its role flags.
   * @param {Object} node
   * @param {Object} central
   * @returns {string}
   */
  function getTypeLabel(node, central) {
    if (node === central || node.parent === null) return "🌐 Central Node";
    if (node.isSatellite) return "🛰️ Satellite";
    if (node.isGroundStation) return "📡 Ground Station";
    if (node.isCommandControl || node.status === "commandControl") return "☠️ C&C Server";
    if (node.isDatacenter) return "🏢 Datacenter";
    if (node.isHoneypot) return "🍯 Honeypot";
    if (node.isGuardian) return "🕶️ Guardian";
    if (node.hasFirewall) return "🛡️ Firewall Node";
    return "🟢 Standard Node";
  }

  /**
   * Compute a node's depth by walking the parent chain.
   * @param {Object} node
   * @returns {number}
   */
  function getDepth(node) {
    let depth = 0;
    let cur = node;
    let guard = 0;
    while (cur && cur.parent && guard++ < 10000) {
      depth++;
      cur = cur.parent;
    }
    return depth;
  }

  /**
   * Format a millisecond duration as a compact "Mm Ss" / "Ss" uptime string.
   * @param {number} ms
   * @returns {string}
   */
  function formatUptime(ms) {
    if (!ms || ms < 0) return "0s";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  /** Lazily create the card DOM element and append it to the body. */
  function ensureCard() {
    if (cardEl) return cardEl;
    cardEl = document.createElement("div");
    cardEl.id = "nodeInfoCard";
    cardEl.style.display = "none";
    document.body.appendChild(cardEl);
    return cardEl;
  }

  /** Build a single "label : value" row of card markup. */
  function row(label, value) {
    return (
      `<div class="nic-row"><span class="nic-label">${label}</span>` +
      `<span class="nic-value">${value}</span></div>`
    );
  }

  /**
   * Populate the card's inner HTML from a node's current state.
   * @param {Object} node
   */
  function renderCard(node) {
    const central = dependencies.getCentralNode();
    const statusLabel = STATUS_LABELS[node.status] || node.status || "unknown";
    const childCount = Array.isArray(node.children) ? node.children.length : 0;
    const immunityCount = Array.isArray(node.attachedImmunityPackets)
      ? node.attachedImmunityPackets.length
      : 0;
    const uptime = formatUptime(Date.now() - (node.createdAt || Date.now()));

    let defenses = [];
    if (node.hasFirewall) defenses.push("🛡️ Firewall");
    if (node.isGuardian) defenses.push("🕶️ Guardian");
    if (node.shieldActive) defenses.push("🔆 Shield");
    if (node.hasRecoveryShield) defenses.push("💙 Recovery");
    const defenseStr = defenses.length ? defenses.join(", ") : "None";

    cardEl.innerHTML =
      `<div class="nic-header">` +
      `<span class="nic-name">${node.friendlyName || "Unknown"}</span>` +
      `<span class="nic-type">${getTypeLabel(node, central)}</span>` +
      `</div>` +
      `<div class="nic-mac">${node.id}</div>` +
      `<div class="nic-body">` +
      row("Status", statusLabel) +
      row("Depth", node === central ? "0 (root)" : getDepth(node)) +
      row("Children", childCount) +
      row("Defenses", defenseStr) +
      (immunityCount > 0 ? row("Immunity", `💊 ${immunityCount}`) : "") +
      row("Uptime", uptime) +
      `</div>`;
  }

  /**
   * Position the card near the cursor, clamped inside the viewport.
   * @param {number} mouseX clientX
   * @param {number} mouseY clientY
   */
  function positionCard(mouseX, mouseY) {
    const offset = 16;
    const rect = cardEl.getBoundingClientRect();
    let left = mouseX + offset;
    let top = mouseY + offset;

    if (left + rect.width > window.innerWidth - 8) {
      left = mouseX - rect.width - offset;
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = mouseY - rect.height - offset;
    }
    cardEl.style.left = `${Math.max(8, left)}px`;
    cardEl.style.top = `${Math.max(8, top)}px`;
  }

  /** Hide the card and clear the hover reference. */
  function hide() {
    currentNode = null;
    if (cardEl) cardEl.style.display = "none";
  }

  /**
   * Handle pointer movement over the canvas: resolve the hovered node and
   * show/update/hide the card accordingly.
   * @param {MouseEvent} e
   */
  function handleMouseMove(e) {
    const canvas = dependencies.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastMouse = { x: e.clientX, y: e.clientY };

    const node = dependencies.getNodeAtPosition(x, y);
    if (!node) {
      hide();
      return;
    }

    ensureCard();
    // Re-render when the hovered node changes; otherwise just reposition.
    if (node !== currentNode) {
      currentNode = node;
      renderCard(node);
      cardEl.style.display = "block";
    }
    positionCard(e.clientX, e.clientY);
  }

  /** Wire pointer listeners on the canvas. Idempotent-ish; call once at boot. */
  function init() {
    const canvas = dependencies.getCanvas();
    if (!canvas) return;
    ensureCard();
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", hide);
  }

  const NodeInfoCard = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },
    init,
    hide,
  };

  window.NodeNet.NodeInfoCard = NodeInfoCard;
})();
