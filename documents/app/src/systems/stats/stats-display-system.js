/**
 * @module StatsDisplaySystem
 * @summary Stats — the tracking object, increment helpers, number formatting, and the stats-pane DOM update loop.
 * @exports window.NodeNet.StatsDisplaySystem
 * @tags stats, metrics, counters, formatting, stats-pane, dom, dashboard
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    getEdges: () => [],
    getDataPackets: () => [],
    getImmunityPackets: () => [],
    getRuntimeLinkMetrics: () => ({}),
    getRuntimePerformanceMetrics: () => ({}),
    getPingPacketSystem: () => null,
    getPingOfDeathSystem: () => null,
    getPhishPacketSystem: () => null,
    getDispatchPacketSystem: () => null,
  };

// Statistics tracking object
const stats = {
  // Packet counts (cumulative)
  totalDataPackets: 0,
  totalControlPackets: 0,
  totalSecurityPackets: 0,
  totalImmunityPackets: 0,
  totalPingPackets: 0,
  totalPhishPackets: 0,
  totalDispatchPackets: 0,
  totalDnsPackets: 0,
  totalHttpPackets: 0,
  totalHttpsPackets: 0,
  totalTlsPackets: 0,
  totalSmtpPackets: 0,
  totalSnmpPackets: 0,
  // Packet delivery stats
  packetsReceived: 0,
  packetsDropped: 0,
  packetsConsumedBySinkhole: 0,
  routeHijacks: 0,
  packetsRerouted: 0,
  routeCorruptedPackets: 0,
  routeHijacksBlocked: 0,
  // Combat stats
  totalAttacks: 0,
  totalDefenses: 0,
  totalInfections: 0,
  totalRecoveries: 0,
  pingDeaths: 0,
  phishSuccess: 0,
  // DDOS stats
  totalDDOSAttacks: 0,
  activeDDOSAttacks: 0,
  // Spider
  spiderNodesCrawled: 0,
};

// Stats increment functions
function incrementStat(statName) {
  if (stats.hasOwnProperty(statName)) {
    stats[statName]++;
  }
}
// Format large numbers for display
function formatStatNumber(value) {
  if (value == null) return "0";
  if (value > 999999) {
    return (value / 1000000).toFixed(2) + "M";
  }
  return value.toLocaleString();
}
// Sort stat items within a section by their values (highest first)
function sortStatsInSection(sectionElement, pinFirstItem = false) {
  const statItems = Array.from(
    sectionElement.querySelectorAll(".stat-item")
  );
  if (statItems.length === 0) return;

  // Get items to sort (exclude first if pinned)
  const itemsToSort = pinFirstItem ? statItems.slice(1) : statItems;
  const pinnedItem = pinFirstItem ? statItems[0] : null;

  // Extract values and sort
  const itemsWithValues = itemsToSort.map((item) => {
    const valueElement = item.querySelector(".stat-value");
    const valueText = valueElement.textContent;

    // Parse value (handle 'M' suffix for millions)
    let numericValue = 0;
    if (valueText.includes("M")) {
      numericValue = parseFloat(valueText.replace("M", "")) * 1000000;
    } else {
      numericValue = parseFloat(valueText.replace(/,/g, "")) || 0;
    }

    return { element: item, value: numericValue };
  });

  // Sort by value descending
  itemsWithValues.sort((a, b) => b.value - a.value);

  // Reorder DOM elements smoothly
  const fragment = document.createDocumentFragment();
  if (pinnedItem) {
    fragment.appendChild(pinnedItem);
  }
  itemsWithValues.forEach((item) => {
    fragment.appendChild(item.element);
  });

  // Clear and re-append in sorted order
  sectionElement
    .querySelectorAll(".stat-item")
    .forEach((item) => item.remove());
  sectionElement.appendChild(fragment);
}
// Update stats display in HUD
function updateStatsDisplay() {
  const nodes = dependencies.getNodes();
  const edges = dependencies.getEdges();
  const dataPackets = dependencies.getDataPackets();
  const immunityPackets = dependencies.getImmunityPackets();
  const runtimeLinkMetrics = dependencies.getRuntimeLinkMetrics();
  const runtimePerformanceMetrics = dependencies.getRuntimePerformanceMetrics();
  const PingPacketSystem = dependencies.getPingPacketSystem();
  const PingOfDeathSystem = dependencies.getPingOfDeathSystem();
  const PhishPacketSystem = dependencies.getPhishPacketSystem();
  const DispatchPacketSystem = dependencies.getDispatchPacketSystem();
  // Packet counts (cumulative totals with formatting)
  document.getElementById("stat-dataPackets").textContent =
    formatStatNumber(stats.totalDataPackets);
  document.getElementById("stat-controlPackets").textContent =
    formatStatNumber(stats.totalControlPackets);
  document.getElementById("stat-securityPackets").textContent =
    formatStatNumber(stats.totalSecurityPackets);
  document.getElementById("stat-immunityPackets").textContent =
    formatStatNumber(stats.totalImmunityPackets);
  document.getElementById("stat-pingPackets").textContent =
    formatStatNumber(stats.totalPingPackets);
  document.getElementById("stat-phishPackets").textContent =
    formatStatNumber(stats.totalPhishPackets);
  document.getElementById("stat-dispatchPackets").textContent =
    formatStatNumber(stats.totalDispatchPackets);
  document.getElementById("stat-packetsReceived").textContent =
    formatStatNumber(stats.packetsReceived);
  document.getElementById("stat-packetsDropped").textContent =
    formatStatNumber(stats.packetsDropped);
  document.getElementById("stat-packetsConsumedBySinkhole").textContent =
    formatStatNumber(stats.packetsConsumedBySinkhole);
  document.getElementById("stat-routeHijacks").textContent =
    formatStatNumber(stats.routeHijacks);
  document.getElementById("stat-packetsRerouted").textContent =
    formatStatNumber(stats.packetsRerouted);
  document.getElementById("stat-routeCorruptedPackets").textContent =
    formatStatNumber(stats.routeCorruptedPackets);
  document.getElementById("stat-routeHijacksBlocked").textContent =
    formatStatNumber(stats.routeHijacksBlocked);
  document.getElementById("stat-dnsPackets").textContent =
    formatStatNumber(stats.totalDnsPackets);
  document.getElementById("stat-httpPackets").textContent =
    formatStatNumber(stats.totalHttpPackets);
  document.getElementById("stat-httpsPackets").textContent =
    formatStatNumber(stats.totalHttpsPackets);
  document.getElementById("stat-tlsPackets").textContent =
    formatStatNumber(stats.totalTlsPackets);
  document.getElementById("stat-smtpPackets").textContent =
    formatStatNumber(stats.totalSmtpPackets);
  document.getElementById("stat-snmpPackets").textContent =
    formatStatNumber(stats.totalSnmpPackets);

  document.getElementById("stat-linksMonitored").textContent =
    formatStatNumber(runtimeLinkMetrics.monitoredLinks);
  document.getElementById("stat-avgLinkQuality").textContent = `${(
    runtimeLinkMetrics.avgQualityScore * 100
  ).toFixed(1)}%`;
  document.getElementById("stat-avgLatency").textContent = `${
    runtimeLinkMetrics.avgLatencyMs.toFixed(0)
  }ms`;
  document.getElementById("stat-avgReliability").textContent = `${(
    runtimeLinkMetrics.avgReliability * 100
  ).toFixed(1)}%`;
  document.getElementById("stat-congestedLinks").textContent =
    formatStatNumber(runtimeLinkMetrics.congestedLinks);
  document.getElementById("stat-highBandwidthLinks").textContent =
    formatStatNumber(runtimeLinkMetrics.highBandwidthLinks);
  document.getElementById("stat-fps").textContent =
    runtimePerformanceMetrics.fps.toFixed(1);
  document.getElementById("stat-frameTime").textContent = `${runtimePerformanceMetrics.frameTimeMs.toFixed(
    2
  )}ms`;
  document.getElementById("stat-edgeDrawTime").textContent = `${runtimePerformanceMetrics.edgeDrawMs.toFixed(
    2
  )}ms`;
  document.getElementById("stat-datacenterVpnDrawTime").textContent = `${runtimePerformanceMetrics.datacenterVpnDrawMs.toFixed(
    2
  )}ms`;
  document.getElementById("stat-datacenterVpnDrawCount").textContent =
    formatStatNumber(runtimePerformanceMetrics.datacenterVpnDrawCount);

  // Node counts (filter by status and type)
  const aliveNodes = nodes.filter((n) => n.state === "alive");
  const totalNodes = aliveNodes.length;
  const healthyNodes = aliveNodes.filter(
    (n) => n.status === "green" || n.status === "blue"
  ).length;
  const downNodes = aliveNodes.filter(
    (n) => n.status === "red" || n.status === "yellow"
  ).length;
  const malwareNodes = aliveNodes.filter(
    (n) => n.status === "malware"
  ).length;
  const botnetNodes = aliveNodes.filter(
    (n) => n.status === "botnet"
  ).length;
  const ccNodes = aliveNodes.filter(
    (n) => n.status === "commandControl"
  ).length;
  const guardianNodes = aliveNodes.filter((n) => n.isGuardian).length;
  const datacenters = aliveNodes.filter((n) => n.isDatacenter).length;
  const firewallNodes = aliveNodes.filter((n) => n.hasFirewall).length;
  const honeypots = aliveNodes.filter((n) => n.isHoneypot).length;
  const datacenterVpnLinks = edges.filter(
    (edge) =>
      edge.isDatacenterVpnTunnel &&
      edge.from &&
      edge.to &&
      edge.from.state === "alive" &&
      edge.to.state === "alive"
  ).length;
  const groundStations = aliveNodes.filter(
    (n) => n.isGroundStation
  ).length;
  const satellites = aliveNodes.filter((n) => n.isSatellite).length;

  document.getElementById("stat-totalNodes").textContent = totalNodes;
  document.getElementById("stat-healthyNodes").textContent = healthyNodes;
  document.getElementById("stat-downNodes").textContent = downNodes;
  document.getElementById("stat-malwareNodes").textContent = malwareNodes;
  document.getElementById("stat-botnetNodes").textContent = botnetNodes;
  document.getElementById("stat-ccNodes").textContent = ccNodes;
  document.getElementById("stat-guardianNodes").textContent =
    guardianNodes;
  document.getElementById("stat-datacenters").textContent = datacenters;
  document.getElementById("stat-firewallNodes").textContent =
    firewallNodes;
  document.getElementById("stat-honeypots").textContent = honeypots;
  document.getElementById("stat-datacenterVpnLinks").textContent =
    datacenterVpnLinks;
  document.getElementById("stat-groundStations").textContent =
    groundStations;
  document.getElementById("stat-satellites").textContent = satellites;
  document.getElementById("stat-spiderNodesCrawled").textContent =
    formatStatNumber(stats.spiderNodesCrawled);

  // Combat statistics (cumulative)
  document.getElementById("stat-totalAttacks").textContent =
    stats.totalAttacks;
  document.getElementById("stat-totalDefenses").textContent =
    stats.totalDefenses;
  document.getElementById("stat-totalInfections").textContent =
    stats.totalInfections;
  document.getElementById("stat-totalRecoveries").textContent =
    stats.totalRecoveries;
  document.getElementById("stat-pingDeaths").textContent =
    stats.pingDeaths;
  document.getElementById("stat-phishSuccess").textContent =
    stats.phishSuccess;

  // DDOS statistics
  document.getElementById("stat-totalDDOSAttacks").textContent =
    stats.totalDDOSAttacks;
  // Count active DDOS attacks in real-time (kept for future alert system)
  const activeDDOS = nodes.filter(
    (n) => n.status === "commandControl" && n.ddosState === "active"
  ).length;
  stats.activeDDOSAttacks = activeDDOS;

  // Update top status bar chips
  const chipHealthy = document.getElementById("chip-healthy");
  const chipInfected = document.getElementById("chip-infected");
  const chipDown = document.getElementById("chip-down");
  const chipDefended = document.getElementById("chip-defended");
  const chipPackets = document.getElementById("chip-packets");
  const statusFps = document.getElementById("status-fps");

  if (chipHealthy) chipHealthy.textContent = healthyNodes;
  if (chipInfected) chipInfected.textContent = malwareNodes + botnetNodes + ccNodes;
  if (chipDown) chipDown.textContent = downNodes;
  if (chipDefended) chipDefended.textContent = firewallNodes + guardianNodes;
  if (chipPackets) chipPackets.textContent = formatStatNumber(
    dataPackets.length +
      immunityPackets.length +
      PingPacketSystem.getPingPackets().length +
      DispatchPacketSystem.getDispatchPackets().length +
      PingOfDeathSystem.getPingOfDeathPackets().length +
      PhishPacketSystem.getPhishPackets().length
  );
  if (statusFps) statusFps.textContent = `${runtimePerformanceMetrics.fps.toFixed(0)} FPS`;

  // Sort stats within each section (but keep Total Nodes at top of Node Status)
  const sections = document.querySelectorAll(".stats-section");
  sections.forEach((section, index) => {
    const sectionTitle = section.querySelector(".stats-section-title");
    if (sectionTitle) {
      const title = sectionTitle.textContent;
      if (title.includes("Node Status")) {
        // Keep "Total Nodes" pinned at the top
        sortStatsInSection(section, true);
      } else if (
        title.includes("Combat Statistics") ||
        title.includes("Packet Counts")
      ) {
        // Sort all items in these sections
        sortStatsInSection(section, false);
      }
    }
  });
}

  const StatsDisplaySystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    stats,
    incrementStat,
    formatStatNumber,
    sortStatsInSection,
    updateStatsDisplay,
  };

  window.NodeNet.StatsDisplaySystem = StatsDisplaySystem;
})();
