/**
 * @module EventLoggingSystem
 * @summary Event log — message templates, buffering, DOM rendering, type filters, and the live event feed.
 * @exports window.NodeNet.EventLoggingSystem
 * @tags event-log, logging, feed, templates, filters, dom, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    config: {},
    tickerSystem: null,
  };

  // External event subscribers (e.g. REACTIONS, NEWS). Each is called with
  // (key, context, message) for every logged event so downstream UX systems can
  // react without coupling EventLoggingSystem to them.
  const eventSubscribers = [];

function formatEventMessage(alert, details) {
  const tech = formatEventTechDetails(details);
  if (!tech) return (alert ?? "").trim();
  return `${(alert ?? "").trim()} (${tech})`;
}

/** Format technical details for event logs (string | array | object). */
function formatEventTechDetails(details) {
  if (!details) return "";
  if (typeof details === "string") return details.trim();
  if (Array.isArray(details)) {
    return details
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim())
      .join(", ");
  }
  if (typeof details === "object") {
    return Object.entries(details)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `${k}=${String(v).trim()}`)
      .join(", ");
  }
  return String(details).trim();
}

/** Normalize node identifiers for log output (uses 'central' for nodes[0]).
 *  Prefers the human-readable friendly name; falls back to the MAC id. */
function getLogNodeRef(node) {
  if (!node) return "?";
  const _nodes = dependencies.getNodes(); if (_nodes && _nodes[0] && node === _nodes[0]) {
    return "central";
  }
  return node.friendlyName ?? node.id ?? "?";
}
const LOG_MESSAGES = {
  recoveryShieldExpired: ({ node }) =>
    formatEventMessage("🛡️ Recovery shield expired after 15 seconds.", {
      node: getLogNodeRef(node),
    }),
  recoveryShieldActivated: ({ node }) =>
    formatEventMessage(
      "🛡️ Recovery shield activated! Duration: 15s, Resistance: 99%.",
      { node: getLogNodeRef(node) }
    ),
  recoveryShieldAttack: ({ target }) =>
    formatEventMessage(
      "⚔️ Attack attempted while recovery shield was active! Resistance: 99%.",
      { target: getLogNodeRef(target) }
    ),
  firewallBlockedPing: ({ firewallNode }) =>
    formatEventMessage("🛡️ Ping of Death blocked by firewall.", {
      node: getLogNodeRef(firewallNode),
    }),
  phishingSuccess: ({ target }) =>
    formatEventMessage("🎣 Phishing attack successful.", {
      target: getLogNodeRef(target),
    }),
  centralCompromised: ({ node }) =>
    formatEventMessage("🚨 CRITICAL ALERT: CENTRAL NODE COMPROMISED!", {
      node: getLogNodeRef(node),
    }),
  firewallGained: ({ node }) =>
    formatEventMessage("🛡️ Firewall capability gained during recovery.", {
      node: getLogNodeRef(node),
    }),
  commandControlDetected: ({ node, clusterSize }) =>
    formatEventMessage("☠️ C&C server detected.", {
      node: getLogNodeRef(node),
      clusterSize: clusterSize ?? "?",
    }),
  ccMeshBridged: ({ node, count }) =>
    formatEventMessage("🕸️ Botnet mesh bridge created.", {
      cc: getLogNodeRef(node),
      botnetNodes: count ?? "?",
    }),
  botnetBridged: () =>
    "🦾 Botnet clusters bridged - mesh network expanding.",
  centralUnderAttack: () =>
    "⚠️ WARNING: Network core is under attack! Immediate defense required!",
  groundStationEstablished: ({ node }) =>
    formatEventMessage("📡 Ground station established.", {
      node: getLogNodeRef(node),
    }),
  guardianPromotionDispatch: ({ node }) =>
    formatEventMessage("🌟 New Guardian defender inspired by dispatch packet!", {
      node: getLogNodeRef(node),
    }),
  guardianPromotionPingRecovery: ({ node }) =>
    formatEventMessage(
      "🛡️ Guardian revealed after recovery from Ping of Death!",
      { node: getLogNodeRef(node) }
    ),
  guardianPromotionPhishing: ({ node }) =>
    formatEventMessage("🕶 A failed phishing attack exposed a Guardian!", {
      node: getLogNodeRef(node),
    }),
  guardianDemoted: ({ node }) =>
    formatEventMessage("🛡️ Guardian corrupted and reverted to malware.", {
      node: getLogNodeRef(node),
    }),
  guardianFirewallSuccess: ({ guardian, target }) =>
    formatEventMessage("🛡️ Firewall configured by Guardian.", {
      guardian: getLogNodeRef(guardian),
      target: getLogNodeRef(target),
    }),
  commandControlAggressiveAttack: ({ ccNode, target }) =>
    formatEventMessage("⚔️ C&C aggressively attacking connected green node!", {
      cc: getLogNodeRef(ccNode),
      target: getLogNodeRef(target),
    }),
  pingOfDeathSent: ({ ccNode, target, targetType, pathLength }) =>
    formatEventMessage("💀 Ping of Death sent.", {
      from: getLogNodeRef(ccNode),
      to: getLogNodeRef(target),
      targetType: targetType ?? "node",
      pathLength: pathLength ?? "?",
    }),
  pingOfDeathFailed: ({ ccNode }) =>
    formatEventMessage(
      "⚠️ Ping of Death failed: no path found to target node.",
      { from: getLogNodeRef(ccNode) }
    ),
  commandControlPhishBurst: ({ ccNode, burstSize }) =>
    formatEventMessage("🎣 Phishing burst launched.", {
      cc: getLogNodeRef(ccNode),
      burstSize: burstSize ?? "?",
    }),
  satelliteChainEstablished: ({ node, count }) =>
    formatEventMessage("🛰️ Satellite chain deployed.", {
      groundStation: getLogNodeRef(node),
      satellites: count ?? 0,
    }),
  satelliteUntethered: ({ node }) =>
    formatEventMessage(
      "🛰️ Satellite lost ground station tether and is drifting.",
      { satellite: getLogNodeRef(node) }
    ),
  nodeDefended: ({ node }) =>
    formatEventMessage("🛡️ Attack defended successfully.", {
      node: getLogNodeRef(node),
    }),
  nodeInfected: ({ node }) =>
    formatEventMessage("☣️ Infection successful.", {
      node: getLogNodeRef(node),
    }),
  statusDown: ({ node, previousStatus, isGroundStation }) =>
    formatEventMessage(
      `${isGroundStation ? "🟥 Ground station" : "🟥 Node"} went DOWN.`,
      { node: getLogNodeRef(node), from: previousStatus ?? "unknown" }
    ),
  statusMalware: ({ node, previousStatus, isGroundStation }) =>
    formatEventMessage(
      `${isGroundStation ? "☣️ Ground station" : "☣️ Node"} became infected.`,
      { node: getLogNodeRef(node), from: previousStatus ?? "unknown" }
    ),
  statusBotnet: ({ node, previousStatus }) =>
    formatEventMessage("🤖 Node joined a botnet cluster.", {
      node: getLogNodeRef(node),
      from: previousStatus ?? "unknown",
    }),
  statusRecovered: ({ node, previousStatus }) =>
    formatEventMessage("✅ Node restored to healthy status.", {
      node: getLogNodeRef(node),
      from: previousStatus ?? "unknown",
    }),
  statusWarning: ({ node, previousStatus }) =>
    formatEventMessage("⚠️ Node entered warning state.", {
      node: getLogNodeRef(node),
      from: previousStatus ?? "unknown",
    }),
  statusCommandControl: ({ node, previousStatus }) =>
    formatEventMessage("☠️ Node elevated to Command & Control.", {
      node: getLogNodeRef(node),
      from: previousStatus ?? "unknown",
    }),
  statusBlue: ({ node, previousStatus }) =>
    formatEventMessage("🌐 Central node restored.", {
      from: previousStatus ?? "unknown",
    }),
  phishingBlocked: ({ node, defender }) =>
    formatEventMessage("🛡️ Phishing attack blocked.", {
      defender: defender ?? "Defender",
      node: getLogNodeRef(node),
    }),
  phishingDefended: ({ node }) =>
    formatEventMessage("🛡️ Phishing defense successful.", {
      node: getLogNodeRef(node),
    }),
  dispatchBlocked: ({ target }) =>
    formatEventMessage(
      "⚠️ Remediation packet intercepted by infected nodes.",
      { target: getLogNodeRef(target) }
    ),
  dispatchSuccessful: ({ target }) =>
    formatEventMessage("✨ Remediation packet delivered - cleanup initiated.", {
      target: getLogNodeRef(target),
    }),
  immunityHealingStarted: ({ node, packetCount }) =>
    formatEventMessage("💊 Immunity healing started.", {
      node: getLogNodeRef(node),
      packets: packetCount ?? "?",
    }),
  immunityHealingCompleted: ({ node }) =>
    formatEventMessage("✅ Node fully healed by immunity packets!", {
      node: getLogNodeRef(node),
    }),
  immunityPacketUpgraded: ({ node, totalPackets, superchargedCount }) =>
    formatEventMessage("⚡ Immunity packet upgraded to supercharged!", {
      node: getLogNodeRef(node),
      supercharged: `${superchargedCount ?? "?"}/${totalPackets ?? "?"}`,
    }),
  pingOfDeathHit: ({ target, targetType }) =>
    formatEventMessage("💀 Ping of Death struck target!", {
      targetType: targetType ?? "node",
      target: getLogNodeRef(target),
    }),
  guardianVpnCreated: ({ guardian, target }) =>
    formatEventMessage("🔒 Guardian VPN tunnel established.", {
      guardian: getLogNodeRef(guardian),
      target: getLogNodeRef(target),
    }),
  datacenterFormed: ({ node, clusterSize }) =>
    formatEventMessage("🏢 Datacenter established.", {
      node: getLogNodeRef(node),
      clusterSize: clusterSize ?? "?",
    }),
  datacenterDissolved: ({ node, reason }) =>
    formatEventMessage("🏢 Datacenter dissolved.", {
      node: getLogNodeRef(node),
      reason: reason ?? "cluster degraded",
    }),
  datacenterVpnCreated: ({ fromNode, toNode }) =>
    formatEventMessage("🔷 Datacenter VPN tunnel created.", {
      from: getLogNodeRef(fromNode),
      to: getLogNodeRef(toNode),
    }),
  datacenterVpnExpired: ({ fromNode, toNode }) =>
    formatEventMessage("🔹 Datacenter VPN tunnel expired.", {
      from: getLogNodeRef(fromNode),
      to: getLogNodeRef(toNode),
    }),
  datacenterFortified: ({ datacenter, node }) =>
    formatEventMessage("🛡️ Upstream node fortified with firewall.", {
      datacenter: getLogNodeRef(datacenter),
      node: getLogNodeRef(node),
    }),
  honeypotCreated: ({ node }) =>
    formatEventMessage("🍯 Honeypot deployed! Attackers beware...", {
      node: getLogNodeRef(node),
    }),
  honeypotConversion: ({ honeypot, attacker }) =>
    formatEventMessage("🍯✨ Honeypot trapped and converted attacker into a Guardian!", {
      honeypot: getLogNodeRef(honeypot),
      attacker: getLogNodeRef(attacker),
    }),
  honeypotDepleted: ({ node }) =>
    formatEventMessage(
      "🍯➡️🛡️ Honeypot exhausted (2 conversions) - reverting to firewall node.",
      { node: getLogNodeRef(node) }
    ),
  honeypotDefended: ({ node }) =>
    formatEventMessage("🍯🛡️ Honeypot resisted an attack!", {
      node: getLogNodeRef(node),
    }),
  remediationStarted: ({ node }) =>
    formatEventMessage("🔄 Remediation process started...", {
      node: getLogNodeRef(node),
    }),
  immunitySupercharged: ({ packetCount }) =>
    formatEventMessage("⚡ Central node supercharged immunity packets!", {
      packets: packetCount ?? "?",
    }),
  satelliteRespawning: ({ groundStation }) =>
    formatEventMessage("🛰️ Satellite chain relaunched...", {
      groundStation: getLogNodeRef(groundStation),
    }),
  ddosCharging: ({ ccNode, botnetCount, targetBranch }) =>
    formatEventMessage("⚡ DDOS charging...", {
      cc: getLogNodeRef(ccNode),
      botnets: botnetCount ?? "?",
      targetBranch: getLogNodeRef(targetBranch),
    }),
  ddosLaunched: ({ ccNode, targetBranch, botnetCount }) =>
    formatEventMessage("🚨 DDOS ATTACK! Branch overwhelmed.", {
      cc: getLogNodeRef(ccNode),
      botnets: botnetCount ?? "?",
      targetBranch: getLogNodeRef(targetBranch),
    }),
  ddosEnded: ({ ccNode, targetBranch }) =>
    formatEventMessage("✅ DDOS attack ended - network recovering.", {
      cc: getLogNodeRef(ccNode),
      targetBranch: getLogNodeRef(targetBranch),
    }),
  branchSprouted: ({ parent, child }) =>
    formatEventMessage("🌱 New branch sprouted.", {
      from: getLogNodeRef(parent),
      to: getLogNodeRef(child),
    }),
  branchPruned: ({ branch, nodeCount }) =>
    formatEventMessage("✂️ Branch pruned.", {
      branch: getLogNodeRef(branch),
      removed: nodeCount ?? 0,
    }),
  satelliteLaunching: ({ groundStation, satellite }) =>
    formatEventMessage("🚀 Satellite launching...", {
      groundStation: getLogNodeRef(groundStation),
      satellite: getLogNodeRef(satellite),
    }),
  satelliteOrbiting: ({ satellite }) =>
    formatEventMessage("🛰️ Satellite reached stable orbit.", {
      satellite: getLogNodeRef(satellite),
    }),
  groundStationExpired: ({ node }) =>
    formatEventMessage("📡 Ground station decommissioned (lifespan expired).", {
      node: getLogNodeRef(node),
    }),
  botnetClusterFormed: ({ nodeCount }) =>
    formatEventMessage("🤖 Botnet cluster formed.", {
      infectedNodes: nodeCount ?? 0,
    }),
  counterStrikeHit: ({ guardian, target, newStatus }) =>
    formatEventMessage("⚡ Counter-strike hit target.", {
      guardian: getLogNodeRef(guardian),
      target: getLogNodeRef(target),
      newStatus: newStatus ?? "down",
    }),
  counterStrikeMissed: ({ guardian }) =>
    formatEventMessage("⚠️ Counter-strike missed target.", {
      guardian: getLogNodeRef(guardian),
    }),
  centralSelfHealingStarted: () =>
    `🚨 Central node compromised! Self-healing protocol initiated...`,
  centralSelfHealingCompleted: () =>
    `✅ Central node recovered - self-healing complete.`,
  guardianVpnExpired: ({ guardian, target }) =>
    formatEventMessage("🔓 Guardian VPN tunnel expired.", {
      guardian: getLogNodeRef(guardian),
      target: getLogNodeRef(target),
    }),
  custom: ({ message, alert, details }) => {
    if (alert) return formatEventMessage(alert, details);
    return message ?? "";
  },
};
const eventLogBuffers = {
  critical: [],
  attack: [],
  defense: [],
  success: [],
  warning: [],
  info: [],
};
const MAX_LOG_ENTRIES_PER_TYPE = (dependencies.config && dependencies.config.logging && dependencies.config.logging.maxEntriesPerType) || 10;
function logEvent(key, context = {}) {
  const template = LOG_MESSAGES[key];
  if (!template) {
    console.warn(
      `[logEvent] Missing log message for key: ${key}`,
      context
    );
    return;
  }

  const message =
    typeof template === "function" ? template(context) : template;
  if (message) {
    console.log(message);

    // Add to UI event log
    addEventToLog(message, key);

    // Notify external UX subscribers (REACTIONS, NEWS, etc.). Failures in a
    // subscriber must never break event logging, so each call is guarded.
    for (let i = 0; i < eventSubscribers.length; i++) {
      try {
        eventSubscribers[i](key, context || {}, message);
      } catch (err) {
        console.warn("[logEvent] subscriber threw:", err);
      }
    }
  }
}

/**
 * Register a callback invoked for every logged event.
 * @param {(key:string, context:object, message:string)=>void} fn
 */
function subscribe(fn) {
  if (typeof fn === "function") eventSubscribers.push(fn);
}

function addEventToLog(message, eventKey) {
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Determine log type based on event key or message content
  let logType = "info";
  if (
    eventKey.includes("central") ||
    eventKey.includes("critical") ||
    message.includes("🚨")
  ) {
    logType = "critical";
  } else if (
    eventKey.includes("attack") ||
    eventKey.includes("infected") ||
    eventKey.includes("malware") ||
    message.includes("⚔️") ||
    message.includes("☣️") ||
    message.includes("💀")
  ) {
    logType = "attack";
  } else if (
    eventKey.includes("defend") ||
    eventKey.includes("blocked") ||
    eventKey.includes("shield") ||
    message.includes("🛡️") ||
    message.includes("🌟")
  ) {
    logType = "defense";
  } else if (
    eventKey.includes("recovered") ||
    eventKey.includes("healed") ||
    eventKey.includes("success") ||
    message.includes("✅") ||
    message.includes("✨")
  ) {
    logType = "success";
  } else if (
    eventKey.includes("warning") ||
    eventKey.includes("down") ||
    message.includes("⚠️")
  ) {
    logType = "warning";
  }

  // Add to appropriate buffer
  const buffer = eventLogBuffers[logType];
  if (!buffer) return;

  const logEntry = {
    timestamp,
    message,
    type: logType,
  };

  // Add to start of buffer
  buffer.unshift(logEntry);

  // Keep buffer size limited
  if (buffer.length > MAX_LOG_ENTRIES_PER_TYPE) {
    buffer.pop();
  }

  // Show the section if hidden AND filter is enabled
  const section = document.getElementById(`log-section-${logType}`);
  if (section && logFilterState[logType]) {
    section.style.display = "block";
  }

  // Add entry to DOM with animation
  addLogEntryToDOM(logEntry);

  // Add to Live Event Feed (new sectioned display)
  LiveEventFeed.add(message, logType, timestamp);

  // Add to legacy Ticker if critical or important (kept for compatibility)
  const TICKER_WORTHY_EVENTS = [
    "ddosLaunched",
    "ddosEnded",
    "commandControlDetected",
    "centralCompromised",
    "centralSelfHealingStarted",
    "centralSelfHealingCompleted",
    "botnetClusterFormed",
  ];
  if (logType === "critical" || TICKER_WORTHY_EVENTS.includes(eventKey)) {
    if (dependencies.tickerSystem) dependencies.tickerSystem.add(message, logType);
  }
}
function addLogEntryToDOM(log) {
  const container = document.getElementById(`logs-${log.type}`);
  if (!container) return;

  // Create log entry element
  const logEntry = document.createElement("div");
  logEntry.className = `log-entry log-${log.type}`;
  logEntry.innerHTML = `<span class="log-timestamp">${log.timestamp}</span>${log.message}`;

  // Insert at the top
  container.insertBefore(logEntry, container.firstChild);

  // Remove excess entries
  while (container.children.length > MAX_LOG_ENTRIES_PER_TYPE) {
    container.removeChild(container.lastChild);
  }
}
const LiveEventFeed = {
  maxEventsPerColumn: 8,
  counts: { critical: 0, attack: 0, defense: 0, success: 0 },

  add(message, type, timestamp) {
    // Map log types to feed columns
    let feedType = type;
    if (type === 'warning') feedType = 'critical';
    if (type === 'info') feedType = 'success';

    const container = document.getElementById(`feed-${feedType}`);
    const countEl = document.getElementById(`feed-${feedType}-count`);
    if (!container) return;

    // Increment count
    this.counts[feedType] = (this.counts[feedType] || 0) + 1;
    if (countEl) countEl.textContent = this.counts[feedType];

    // Replace with only the latest message
    container.innerHTML = `
      <div class="event-item">
        <span class="event-time">${timestamp}</span>
        <span class="event-text">${this.truncateMessage(message)}</span>
      </div>
    `;
  },

  truncateMessage(msg) {
    // Remove emojis for cleaner display and truncate
    const cleaned = msg.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    return cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
  },

  clear() {
    ['critical', 'attack', 'defense', 'success'].forEach(type => {
      const container = document.getElementById(`feed-${type}`);
      const countEl = document.getElementById(`feed-${type}-count`);
      if (container) container.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      this.counts[type] = 0;
    });
  }
};
const logFilterState = {
  critical: true,
  attack: true,
  defense: true,
  success: true,
  warning: true,
  info: true,
};

function initializeLogFilters() {
  const filterCheckboxes = document.querySelectorAll(
    ".log-filter-item input[type='checkbox']"
  );

  filterCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", function () {
      const logType = this.dataset.logType;
      logFilterState[logType] = this.checked;
      applyLogFilters();
    });
  });
}

function applyLogFilters() {
  Object.keys(logFilterState).forEach((logType) => {
    const section = document.getElementById(`log-section-${logType}`);
    if (section) {
      // Only show section if filter is enabled AND it has entries
      const container = section.querySelector(".log-entries-container");
      const hasEntries = container && container.children.length > 0;
      section.style.display =
        logFilterState[logType] && hasEntries ? "block" : "none";
    }
  });
}

  const EventLoggingSystem = {
    /**
     * Connect app-owned state and helper callbacks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    formatEventMessage,
    formatEventTechDetails,
    getLogNodeRef,
    logEvent,
    subscribe,
    addEventToLog,
    addLogEntryToDOM,
    LiveEventFeed,
    initializeLogFilters,
    applyLogFilters,
  };

  window.NodeNet.EventLoggingSystem = EventLoggingSystem;
})();
