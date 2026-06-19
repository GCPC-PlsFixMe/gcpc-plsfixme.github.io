/**
 * @module NodeNetConfig
 * @summary Centralized, tunable constants for the whole simulation — one place to balance gameplay.
 * @description Config tree covering bot defense, network growth, hazards (sinkhole,
 *   route hijacker), backgrounds, satellites/ground stations, wireless, logging,
 *   performance tiers, timing, combat odds, the link-quality model, honeypots,
 *   datacenters, and the protocol mix. Read by nearly every system.
 * @exports window.NodeNet.config, window.NodeNetConfig
 * @tags config, constants, tuning, balance, settings, thresholds, probabilities
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};
  const config = {
    // Bot Defense Mode
    botDefense: {
      duration: 10000,        // 10s active
      cooldown: 20000,        // 20s cooldown
      burstInterval: 4000,    // burst every 4s
    },

    // Network Structure
    network: {
      maxBranchDepth: 6,      // Maximum depth from central node
      defaultBranchCount: 6,  // Initial number of branches
      padding: 10,            // Padding from canvas border
      offscreenMargin: 50,    // Margin beyond canvas before despawn
      populationSoftCap: 75,  // Soft cap on alive branch nodes (excl. satellites/ground stations).
                              //   Above this, sprouting yields and deep-leaf pruning becomes aggressive.
    },

    // Roving Sinkhole hazard
    sinkhole: {
      enabled: true,
      influenceRadius: 78,     // Outer pull radius for passing packets
      eventHorizonRadius: 9,   // Packets crossing this radius are consumed
      driftSpeed: 18,          // World-space pixels per second
      offscreenMargin: 0,      // Match route hijacker bounds; keep sinkhole on-canvas
      retargetMinMs: 18000,
      retargetMaxMs: 32000,
      initialCooldownMinMs: 14000,
      initialCooldownMaxMs: 28000,
      activeMinMs: 10000,
      activeMaxMs: 16000,
      cooldownMinMs: 45000,
      cooldownMaxMs: 75000,
      spawnDurationMs: 1500,
      despawnDurationMs: 1200,
    },

    // Rogue route hijacker hazard
    routeHijacker: {
      enabled: true,
      influenceRadius: 115,       // Area where ordinary data traffic can be deceived
      beaconRadius: 13,
      driftSpeed: 32,
      captureChancePerSecond: 0.32,
      detourDurationMin: 1.8,
      detourDurationMax: 3.4,
      fakeRouteRadiusMin: 52,
      fakeRouteRadiusMax: 96,
      branchBridgeChance: 0.34,
      branchBridgeRadius: 145,
      branchBridgeMinSeparation: 38,
      corruptionChance: 0.018,
      dropChance: 0.02,
      retargetMinMs: 9000,
      retargetMaxMs: 17000,
      initialCooldownMinMs: 3500,
      initialCooldownMaxMs: 8000,
      activeMinMs: 18000,
      activeMaxMs: 28000,
      cooldownMinMs: 12000,
      cooldownMaxMs: 22000,
      spawnDurationMs: 900,
      despawnDurationMs: 900,
      minNetworkNodes: 50,
    },

    // Active background renderer. Additional background modules can register
    // more ids with BackgroundSystem and select them here.
    background: {
      active: "galaxy",
    },

    // Galaxy Background
    galaxy: {
      starCount: 380,
      nebulaCount: 5,
      cometCap: 2,
    },

    mood: {
      particleCount: 140,
      maxNodeFields: 110,
    },

    // Hot-wax lava lamp (metaball field). riserCount = floating wax globs,
    // poolCount = blobs forming the molten base, fieldWidth = metaball
    // buffer resolution (higher = crisper but heavier).
    lava: {
      riserCount: 7,
      poolCount: 5,
      fieldWidth: 190,
    },

    // 8-bit Retro synthwave background (low-res buffer upscaled crisp)
    retro: {
      pixelScale: 4,
      starCount: 44,
    },

    // Aurora borealis curtains over a starfield
    aurora: {
      bandCount: 4,
      starCount: 90,
    },

    // Matrix digital rain (occasional quotes fall in the trails)
    matrix: {
      fontSize: 16,
      trail: 14,
      maxQuotes: 2,
    },

    // Satellite System
    satellite: {
      orbitRadiusMin: 0.8,        // 80% of canvas half-size
      orbitRadiusMax: 1.08,       // Allow taller dynamic orbits around long branches
      orbitalSpeedBase: 0.0024,   // Base angular velocity (radians/frame)
      orbitalSpeedVariance: 0.001,
      orbitalSmoothing: 0.02,     // Interpolation factor
      launchDuration: 6000,       // Time to reach orbit (ms)
      spacingMin: 0.4,            // Minimum angular spacing (radians)
      unlinkedTimeout: 30000,     // Time before unlinked satellite despawns
      maxLifespan: 360000,        // 6 minutes maximum lifespan
      driftFadeRate: 0.015,
      driftSpeedMin: 0.5,
      driftSpeedMax: 1.5,
      driftGravity: 0.02,
      maxCount: 5,                // Maximum orbiting satellites (read by groundStationsLaunchSatellites)
    },

    // Ground Station System
    groundStation: {
      sproutChance: 0.02,         // 2% chance per tick
      launchInterval: 30000,      // Launch satellites every 30s
      maxLifespan: 120000,        // 2 minutes maximum lifespan
      launchCountdown: 10000,     // 10 second countdown ticks before launch
    },

    // Wireless Links
    wireless: {
      maxDistanceRatio: 0.51,     // 42% of screen diagonal -> increased by ~20%
    },

    // Logging System
    logging: {
      maxEntriesPerType: 10,
    },

    // Performance Thresholds
    performance: {
      shadowsDisableAt: 150,      // Disable shadows above this node count
      particlesDisableAt: 250,    // Disable particles above this node count
    },

    // Timing
    timing: {
      selfHealDelay: 3000,        // Delay before central node self-heals
      selfHealDuration: 5000,     // Duration of self-healing process
      redNodeTimeout: 10000,      // Time before red nodes resolve
      guardianDispatchInterval: 10000,
      threatScanInterval: 3000,
      recoveryShieldDuration: 15000,
    },

    // Combat Probabilities
    combat: {
      guardianBlockPingChance: 0.82,
      firewallBlockPingChance: 0.42,
      guardianBlockPhishChance: 0.44,
      firewallBlockPhishChance: 0.2,
      guardianCounterStrikeChance: 0.45,
      firewallSpawnChance: 0.2,
    },

    // Link Quality + Realism Model
    linkQuality: {
      baseLatencyMinMs: 8,
      baseLatencyMaxMs: 70,
      baseReliabilityMin: 0.93,
      baseReliabilityMax: 0.995,
      baseBandwidthMin: 0.55,
      baseBandwidthMax: 1.0,
      minBandwidth: 0.08,
      minReliability: 0.15,
      congestionPulseSpeed: 0.0016,
      congestionDriftMin: 0.08,
      congestionDriftMax: 0.42,
      congestionDriftStep: 0.08,
      congestionRetargetMinMs: 7000,
      congestionRetargetMaxMs: 18000,
      congestionSmoothing: 0.04,
      congestionBandwidthImpact: 0.55,
      congestionLatencyImpact: 1.8,
      congestionReliabilityImpact: 0.14,
      compromisedCongestionBoost: 0.15,
      compromisedBandwidthPenalty: 0.18,
      infectionReliabilityPenalty: 0.18,
      infectionLatencyPenalty: 0.35,
      ddosCongestionBoost: 0.35,
      ddosBandwidthPenalty: 0.28,
      ddosReliabilityPenalty: 0.35,
      ddosLatencyPenalty: 0.75,
      congestedThreshold: 0.72,
      highBandwidthThreshold: 0.82,
      highBandwidthPersistBaselineThreshold: 0.88,
      highBandwidthPersistFloor: 0.84,
      renderWidthMin: 1.0,
      renderWidthMax: 7.4,
      renderCongestionWidthImpact: 0.65,
      wirelessWidthScale: 0.72,
      guardianVpnWidthScale: 1.12,
      botnetMeshWidthScale: 0.88,
      datacenterVpnWidthScale: 1.3,
      renderBandwidthVisualFloor: 0.5,
      renderBandwidthVisualCeil: 0.98,
      renderWidthCurve: 1.45,
      renderFlowSpeedMin: 0.00014,
      renderFlowSpeedMax: 0.00065,
      renderFlowPulseWidth: 0.16,
      topologyBandwidthWeight: 0.55,
      topologyBandwidthDescendantCap: 15,
      branchSpawnBaseChance: 0.05,
      branchSpawnMinMultiplier: 0.55,
      branchSpawnMaxMultiplier: 1.7,
      branchSpawnExponent: 1.1,
      branchSpawnWeightFloor: 0.35,
      branchSequentialBandwidthBias: 0.85,
      maxLatencyForScoreMs: 220,
      scoreWeights: {
        bandwidth: 0.4,
        latency: 0.3,
        reliability: 0.3,
      },
    },

    // Honeypot System - Traps that convert attackers to guardians
    honeypot: {
      maxConversions: 2,              // Number of attackers that can be converted before reverting to firewall
      infectionResistChance: 0.78,    // Strong resistance without making traps invulnerable
      spawnChanceNearDatacenter: 0.12, // 12% chance to spawn near datacenter per evaluation
      randomSpawnChance: 0.006,       // 0.6% chance per tick for random spawn
      maxHoneypots: 3,                // Maximum honeypots in the network
      conversionAnimationDuration: 1500, // Duration of honeycomb animation in ms
    },

    // Healthy infrastructure clustering and reinforcement
    datacenter: {
      minClusterSize: 6,
      retainClusterSize: 5,
      maxDatacenters: 8,
      reevaluateIntervalMs: 4000,
      vpnRefreshIntervalMs: 4500,
      vpnRange: 620,
      vpnTunnelLimitPerNode: 4,
      vpnCreateChance: 0.9,
      fortifyIntervalMs: 6000,
      fortifyMaxHops: 4,
      fortifyChancePerHop: 0.52,
      highBandwidthFloor: 0.92,
      icon: "🏢",
      // Resilience: how hard it is to compromise a datacenter node
      infectionResistChance: 0.68,   // base defense vs spreading infection (vs 0.25 for normal nodes)
      phishingBlockChance:   0.70,   // block phishing packets arriving at datacenter
      pingBlockChance:       0.78,   // block ping-of-death en-route through a datacenter
      pingArrivalBlockChance: 0.62,  // block ping-of-death that reaches datacenter directly
    },

    // Protocol layer simulation for data traffic
    protocols: {
      profiles: {
        DNS: { weight: 0.18, speedMultiplier: 1.12, dropSensitivity: 0.85, jitterSensitivity: 0.9 },
        HTTP: { weight: 0.26, speedMultiplier: 1.0, dropSensitivity: 1.0, jitterSensitivity: 1.0 },
        HTTPS: { weight: 0.24, speedMultiplier: 0.95, dropSensitivity: 1.05, jitterSensitivity: 0.95 },
        TLS: { weight: 0.12, speedMultiplier: 0.92, dropSensitivity: 1.1, jitterSensitivity: 0.9 },
        SMTP: { weight: 0.12, speedMultiplier: 0.82, dropSensitivity: 1.2, jitterSensitivity: 1.15 },
        SNMP: { weight: 0.08, speedMultiplier: 1.08, dropSensitivity: 0.8, jitterSensitivity: 0.85 },
      },
    },
  };

  window.NodeNet.config = config;
  window.NodeNetConfig = config;
})();
