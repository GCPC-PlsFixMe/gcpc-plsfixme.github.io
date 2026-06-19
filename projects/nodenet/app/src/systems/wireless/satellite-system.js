/**
 * @module SatelliteSystem
 * @summary Ground-station lifecycle, orbital satellite motion, and the wireless mesh links between them.
 * @exports window.NodeNet.SatelliteSystem
 * @tags satellite, ground-station, orbit, wireless, mesh, uplink, lifecycle
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    config: window.NodeNetConfig || {},
    canvas: null,
    viewState: null,
    getNodes: () => [],
    getEdges: () => [],
    createNode: null,
    getColors: () => ({}),
    createPopParticles: () => {},
    logEvent: () => {},
    getLogNodeRef: (node) => (node ? node.id ?? "?" : "?"),
    markBranchForRetraction: () => {},
    demoteGuardian: () => {},
    demoteDatacenter: () => {},
    nodesHaveClearView: () => true,
    hasHealthyPathToCentral: () => false,
  };

  const CONFIG = new Proxy(
    {},
    {
      get(_target, property) {
        return (dependencies.config || window.NodeNetConfig || {})[property];
      },
    }
  );

  let orbitingSatellites = [];

  function getNodes() {
    return typeof dependencies.getNodes === "function"
      ? dependencies.getNodes()
      : [];
  }

  function getEdges() {
    return typeof dependencies.getEdges === "function"
      ? dependencies.getEdges()
      : [];
  }

  function getCanvas() {
    return dependencies.canvas || { width: 0, height: 0 };
  }

  function getViewState() {
    return dependencies.viewState || {};
  }

  function getColors() {
    return typeof dependencies.getColors === "function"
      ? dependencies.getColors()
      : {};
  }

  function getColor(name, fallback = { r: 255, g: 255, b: 255 }) {
    const color = getColors()[name];
    return color || fallback;
  }

  function createNode(id, x, y, parent) {
    if (typeof dependencies.createNode !== "function") return null;
    return dependencies.createNode(id, x, y, parent);
  }

  function createPopParticles(x, y, color) {
    dependencies.createPopParticles(x, y, color);
  }

  function getLogNodeRef(node) {
    return dependencies.getLogNodeRef(node);
  }

  function logEvent(key, context = {}) {
    dependencies.logEvent(key, context);
  }

  function logCustom(alert, details) {
    logEvent("custom", { alert, details });
  }

  function getSatelliteConfig() {
    return CONFIG.satellite || {};
  }

  function getGroundStationConfig() {
    return CONFIG.groundStation || {};
  }

  function getWirelessConfig() {
    return CONFIG.wireless || {};
  }

  function getLaunchCountdownDuration() {
    return getGroundStationConfig().launchCountdown || 5000;
  }

  function getWirelessLinkMaxDistance() {
    const canvas = getCanvas();
    const screenDiagonal = Math.sqrt(
      canvas.width * canvas.width + canvas.height * canvas.height
    );
    return screenDiagonal * (getWirelessConfig().maxDistanceRatio || 0.51);
  }

  function nodesHaveClearView(nodeA, nodeB) {
    return dependencies.nodesHaveClearView(nodeA, nodeB);
  }

  function removeEdgesWhere(predicate) {
    const edges = getEdges();
    for (let i = edges.length - 1; i >= 0; i--) {
      if (predicate(edges[i])) {
        edges.splice(i, 1);
      }
    }
  }

  function isCompromisedGroundStation(node) {
    return (
      node &&
      node.isGroundStation &&
      (node.status === "red" ||
        node.status === "malware" ||
        node.status === "botnet" ||
        node.status === "commandControl")
    );
  }

  /**
   * Return true when any edge, wireless or wired, already connects two nodes.
   */
  function hasAnyEdgeBetween(nodeA, nodeB) {
    return getEdges().some(
      (edge) =>
        (edge.from === nodeA && edge.to === nodeB) ||
        (edge.from === nodeB && edge.to === nodeA)
    );
  }

  /**
   * Return true when a wireless edge already connects two nodes.
   */
  function hasWirelessEdgeBetween(nodeA, nodeB) {
    return getEdges().some(
      (edge) =>
        edge.isWirelessLink &&
        ((edge.from === nodeA && edge.to === nodeB) ||
          (edge.from === nodeB && edge.to === nodeA))
    );
  }

  /**
   * Promote an existing healthy node into a ground station anchor.
   */
  function convertToGroundStation(node) {
    if (!node || node.state !== "alive") return;
    if (node.parent === null) return;

    if (node.isGuardian) {
      dependencies.demoteGuardian(node);
    }
    if (node.isDatacenter) {
      dependencies.demoteDatacenter(node, "repurposed to ground station");
    }

    node.isGroundStation = true;
    node.isHoneypot = false;
    node.honeypotConversions = 0;
    node.honeypotCreatedAt = 0;
    node.groundStationEstablishedAt = Date.now();
    node.lastSatelliteLaunch = null;
    node.groundStationCountdown = getLaunchCountdownDuration();
    node.groundStationCountdownStartedAt = Date.now();
    node.groundStationCountdownDuration = node.groundStationCountdown;
    node.launchAnimationUntil = 0;
    node.launchStatusText = null;
    node.baseRadius = 24;
    node.targetRadius = node.baseRadius;
    node.shieldStrength = Math.max(node.shieldStrength || 0, 0.65);
    node.currentColor = { ...getColor("groundStation") };
    node.hasFirewall = true;
    node.status = "green";
    createPopParticles(node.x, node.y, getColor("blue"));
    logEvent("groundStationEstablished", { node });
  }

  /**
   * Randomly convert a healthy perimeter node into a ground station.
   */
  function sproutGroundStationFromHealthyNode() {
    const sproutChance = getGroundStationConfig().sproutChance || 0;
    if (Math.random() > sproutChance) return;

    const maxGroundStations = 3;
    const nodes = getNodes();
    const activeGroundStations = nodes.filter(
      (node) => node.isGroundStation && node.state === "alive"
    );
    if (activeGroundStations.length >= maxGroundStations) return;

    const canvas = getCanvas();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const canvasRadius = Math.min(canvas.width, canvas.height) / 2;

    const candidates = nodes.filter((node) => {
      if (node.state !== "alive" || node.status !== "green") return false;
      if (node.isSatellite || node.isGroundStation) return false;
      if (node.parent === null) return false;
      if (node.parent && node.parent.isGroundStation) return false;

      const distFromCenter = Math.sqrt(
        (node.x - centerX) ** 2 + (node.y - centerY) ** 2
      );
      return distFromCenter >= canvasRadius * 0.5;
    });

    if (candidates.length === 0) return;

    const targetNode = candidates[Math.floor(Math.random() * candidates.length)];
    convertToGroundStation(targetNode);
    logCustom("📡 Node upgraded to Ground Station.", {
      node: getLogNodeRef(targetNode),
    });
  }

  /**
   * Launch a free-floating orbital satellite from an active ground station.
   */
  function launchSatelliteFromGroundStation(groundStation) {
    if (
      !groundStation ||
      !groundStation.isGroundStation ||
      groundStation.state !== "alive"
    ) {
      return null;
    }

    const canvas = getCanvas();
    const viewState = getViewState();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const satelliteConfig = getSatelliteConfig();

    const gsOutwardAngle = Math.atan2(
      groundStation.y - centerY,
      groundStation.x - centerX
    );

    const baseNetworkRadius = Math.max(250, viewState.maxNetworkRadius || 0);
    const orbitAltitude = 160 + Math.random() * 90;
    const orbitRadius = baseNetworkRadius + orbitAltitude;
    const orbitEccentricity = 0.06 + Math.random() * 0.09;
    const orbitalRadiusX = orbitRadius * (1 + orbitEccentricity);
    const orbitalRadiusY = orbitRadius * (1 - orbitEccentricity);

    const launchAngleVariance = (Math.random() - 0.5) * (Math.PI / 3.6);
    const launchAngle = gsOutwardAngle + launchAngleVariance;
    const launchX = groundStation.x;
    const launchY = groundStation.y;

    const satellite = createNode(Date.now() + Math.random(), launchX, launchY, null);
    if (!satellite) return null;

    satellite.isSatellite = true;
    satellite.isFreefloating = true;
    satellite.launchedFrom = groundStation;
    satellite.launchX = launchX;
    satellite.launchY = launchY;
    satellite.launchArcHeight = 0.55 + Math.random() * 0.2;
    satellite.baseRadius = 9;
    satellite.targetRadius = 9;
    satellite.radius = 9;
    satellite.status = "green";
    satellite.currentColor = { ...getColor("satellite") };
    satellite.opacity = 1;
    satellite.state = "alive";
    satellite.forceMultiplier = 1.0;
    satellite.children = [];
    satellite.hasFirewall = false;
    satellite.canSpread = false;
    satellite.unlinkTime = null;

    satellite.orbitalRadiusX = orbitalRadiusX;
    satellite.orbitalRadiusY = orbitalRadiusY;
    satellite.orbitalAngle = launchAngle;
    satellite.orbitalSpeed =
      ((satelliteConfig.orbitalSpeedBase || 0.0024) +
        (Math.random() - 0.5) * (satelliteConfig.orbitalSpeedVariance || 0.001)) *
      0.75;
    satellite.orbitalDirection = 1;
    satellite.orbitSpeedAdjusted = true;
    satellite.orbitAltitude = orbitAltitude;
    satellite.orbitEccentricity = orbitEccentricity;
    satellite.launchStartTime = Date.now();
    satellite.launchTrail = [];
    satellite.stageSeparationTime = 0;

    getNodes().push(satellite);

    getEdges().push({
      from: groundStation,
      to: satellite,
      isWirelessLink: true,
      pulseSeed: Math.random() * Math.PI * 2,
    });

    logCustom("🚀 Satellite launched into orbit.", {
      groundStation: getLogNodeRef(groundStation),
      satellite: getLogNodeRef(satellite),
      direction: satellite.orbitalDirection > 0 ? "CW" : "CCW",
    });

    return satellite;
  }

  /**
   * Despawn satellites that exceed their configured service life.
   */
  function checkSatelliteLifespans() {
    const now = Date.now();
    const maxLifespan = getSatelliteConfig().maxLifespan || 360000;
    const satellites = getNodes().filter(
      (node) =>
        node.isSatellite && (node.state === "alive" || node.state === "spawning")
    );

    for (const satellite of satellites) {
      const age = now - satellite.createdAt;
      if (age < maxLifespan) continue;

      untetherSatellite(satellite);
      logCustom("🛰️ Satellite reached end of service life - deorbiting...", {
        satellite: getLogNodeRef(satellite),
      });
    }
  }

  /**
   * Revert ground stations that expire or accidentally become branch parents.
   */
  function checkGroundStationLifespans() {
    const now = Date.now();
    const maxLifespan = getGroundStationConfig().maxLifespan || 120000;
    const groundStations = getNodes().filter(
      (node) => node.isGroundStation && node.state === "alive"
    );

    for (const groundStation of groundStations) {
      if (!groundStation.groundStationEstablishedAt) {
        groundStation.groundStationEstablishedAt = now;
      }

      const hasNonSatelliteChild =
        groundStation.children &&
        groundStation.children.some(
          (child) => child && child.state === "alive" && !child.isSatellite
        );

      if (hasNonSatelliteChild) {
        logCustom("📡 Ground station reverted to normal node.", {
          groundStation: getLogNodeRef(groundStation),
          reason: "became parent to regular node",
        });
        revertGroundStationToNormalNode(groundStation);
        continue;
      }

      const age = now - groundStation.groundStationEstablishedAt;
      if (age >= maxLifespan) {
        logCustom("📡 Ground station reverted to normal node (service life ended).", {
          groundStation: getLogNodeRef(groundStation),
        });
        revertGroundStationToNormalNode(groundStation);
      }
    }
  }

  /**
   * Demote a ground station while leaving the underlying branch node alive.
   */
  function revertGroundStationToNormalNode(groundStation) {
    if (!groundStation || !groundStation.isGroundStation) return;

    removeSatelliteChain(groundStation);
    groundStation.isGroundStation = false;
    groundStation.baseRadius = 15;
    groundStation.targetRadius = 15;
    groundStation.radius = 15;
    groundStation.currentColor = { ...getColor("green") };
    groundStation.groundStationEstablishedAt = null;
    groundStation.lastSatelliteLaunch = null;
    groundStation.launchAnimationUntil = 0;
    groundStation.launchStatusText = null;
    groundStation.groundStationCountdown = 0;
    groundStation.lastCountdownUpdate = null;
    groundStation.satelliteChain = [];
    groundStation.satelliteEdges = [];
  }

  /**
   * Advance ground station launch countdowns and create satellites when ready.
   */
  function groundStationsLaunchSatellites() {
    const now = Date.now();
    const satelliteConfig = getSatelliteConfig();
    const maxSatellites = satelliteConfig.maxCount || 5;
    const activeSatellites = getNodes().filter(
      (node) => node.isSatellite && node.state === "alive"
    );
    const satelliteCapReached = activeSatellites.length >= maxSatellites;

    const groundStations = getNodes().filter(
      (node) =>
        node.isGroundStation &&
        node.state === "alive" &&
        (node.status === "green" || node.status === "yellow")
    );

    for (const groundStation of groundStations) {
      if (satelliteCapReached) {
        groundStation.groundStationCountdown = 0;
        groundStation.lastCountdownUpdate = null;
        groundStation.lastSatelliteLaunch = null;
        groundStation.launchAnimationUntil = 0;
        groundStation.launchStatusText = null;
        continue;
      }

      if (
        groundStation.groundStationCountdown !== undefined &&
        groundStation.groundStationCountdown > 0
      ) {
        if (!groundStation.lastCountdownUpdate) {
          groundStation.lastCountdownUpdate = now;
        }
        const deltaTime = now - groundStation.lastCountdownUpdate;
        groundStation.groundStationCountdown = Math.max(
          0,
          groundStation.groundStationCountdown - deltaTime
        );
        groundStation.lastCountdownUpdate = now;

        if (groundStation.groundStationCountdown <= 0) {
          groundStation.groundStationCountdown = 0;
          launchSatelliteFromGroundStation(groundStation);
          groundStation.lastSatelliteLaunch = now;
          groundStation.launchAnimationUntil = now + (satelliteConfig.launchDuration || 6000);
          groundStation.launchStatusText = "IGNITION";
          logCustom("🛰️ Ground station launched satellite.", {
            groundStation: getLogNodeRef(groundStation),
          });
        }
        continue;
      }

      if (!groundStation.lastSatelliteLaunch) {
        groundStation.lastSatelliteLaunch = now;
      }

      const launchInterval = getGroundStationConfig().launchInterval || 30000;
      if (now - groundStation.lastSatelliteLaunch >= launchInterval) {
        const countdownMs = getLaunchCountdownDuration();
        groundStation.groundStationCountdown = countdownMs;
        groundStation.groundStationCountdownStartedAt = now;
        groundStation.groundStationCountdownDuration = countdownMs;
        groundStation.lastCountdownUpdate = now;
        logCustom("📡 Ground station initiating satellite launch sequence...", {
          groundStation: getLogNodeRef(groundStation),
          countdownMs,
        });
      }
    }
  }

  /**
   * Maintain satellite, satellite-satellite, and ground-station wireless links.
   */
  function updateSatelliteWirelessLinks() {
    const wirelessLinkMaxDistance = getWirelessLinkMaxDistance();
    const nodes = getNodes();
    const edges = getEdges();
    const aliveSatellites = nodes.filter(
      (node) => node.isSatellite && node.state === "alive"
    );
    const groundStations = nodes.filter(
      (node) => node.isGroundStation && node.state === "alive"
    );

    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      if (!edge.isWirelessLink) continue;

      const fromAlive = edge.from && edge.from.state === "alive";
      const toAlive = edge.to && edge.to.state === "alive";
      if (!fromAlive || !toAlive) {
        edges.splice(i, 1);
        continue;
      }

      if (
        isCompromisedGroundStation(edge.from) ||
        isCompromisedGroundStation(edge.to)
      ) {
        edges.splice(i, 1);
        continue;
      }

      const distance = Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y);
      if (distance > wirelessLinkMaxDistance) {
        edges.splice(i, 1);
        continue;
      }

      if (!nodesHaveClearView(edge.from, edge.to)) {
        edges.splice(i, 1);
      }
    }

    for (const satellite of aliveSatellites) {
      for (const groundStation of groundStations) {
        if (isCompromisedGroundStation(groundStation)) continue;
        if (hasAnyEdgeBetween(satellite, groundStation)) continue;

        const distance = Math.hypot(
          groundStation.x - satellite.x,
          groundStation.y - satellite.y
        );
        if (distance > wirelessLinkMaxDistance) continue;

        if (nodesHaveClearView(satellite, groundStation)) {
          edges.push({
            from: satellite,
            to: groundStation,
            isWirelessLink: true,
            pulseSeed: Math.random() * Math.PI * 2,
          });
        }
      }

      for (const otherSatellite of aliveSatellites) {
        if (otherSatellite === satellite) continue;
        if (hasAnyEdgeBetween(satellite, otherSatellite)) continue;

        const distance = Math.hypot(
          otherSatellite.x - satellite.x,
          otherSatellite.y - satellite.y
        );
        if (distance > wirelessLinkMaxDistance) continue;

        if (nodesHaveClearView(satellite, otherSatellite)) {
          edges.push({
            from: satellite,
            to: otherSatellite,
            isWirelessLink: true,
            isSatelliteMesh: true,
            pulseSeed: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    for (let i = 0; i < groundStations.length; i++) {
      const gs1 = groundStations[i];
      if (isCompromisedGroundStation(gs1)) continue;

      for (let j = i + 1; j < groundStations.length; j++) {
        const gs2 = groundStations[j];
        if (isCompromisedGroundStation(gs2)) continue;
        if (hasAnyEdgeBetween(gs1, gs2)) continue;

        const distance = Math.hypot(gs2.x - gs1.x, gs2.y - gs1.y);
        if (distance > wirelessLinkMaxDistance) continue;

        if (nodesHaveClearView(gs1, gs2)) {
          edges.push({
            from: gs1,
            to: gs2,
            isWirelessLink: true,
            isGroundStationBridge: true,
            pulseSeed: Math.random() * Math.PI * 2,
          });
          logCustom("📡 Wireless bridge established between ground stations.", {
            from: getLogNodeRef(gs1),
            to: getLogNodeRef(gs2),
          });
        }
      }
    }
  }

  /**
   * Merge connected ground stations by keeping the older station.
   */  /**
   * Track a satellite-created edge on every host that owns it.
   */
  function registerSatelliteEdge(groundStation, edge) {
    if (!groundStation || !edge) return;
    if (!groundStation.satelliteEdges) groundStation.satelliteEdges = [];
    if (!groundStation.satelliteEdges.includes(edge)) {
      groundStation.satelliteEdges.push(edge);
    }
    if (!edge.satelliteHosts) edge.satelliteHosts = new Set();
    edge.satelliteHosts.add(groundStation);
  }

  /**
   * Remove a satellite-created edge from host tracking arrays.
   */
  function unregisterSatelliteEdge(edge) {
    if (!edge) return;
    if (edge.satelliteHosts && edge.satelliteHosts.size > 0) {
      edge.satelliteHosts.forEach((host) => {
        if (host && host.satelliteEdges) {
          host.satelliteEdges = host.satelliteEdges.filter((entry) => entry !== edge);
        }
      });
      edge.satelliteHosts.clear();
    }
  }

  /**
   * Legacy tethered satellite creation remains disabled.
   */  /**
   * Legacy satellite chains remain disabled for free-floating satellites.
   */  /**
   * Untether every satellite associated with a ground station chain.
   */
  function removeSatelliteChain(groundStation) {
    if (!groundStation) return;
    const satellites = groundStation.satelliteChain || [];
    if (satellites.length === 0) return;

    satellites.forEach((satellite) => untetherSatellite(satellite));
    groundStation.satelliteChain = [];
    groundStation.satelliteEdges = [];
    groundStation.lastSatelliteChainCheck = Date.now();
  }

  /**
   * Adopt an orphaned satellite through an existing wireless neighbor.
   */  /**
   * Detach a satellite from all links and let it drift out of service.
   */
  function untetherSatellite(satellite) {
    if (!satellite || !satellite.isSatellite) return;
    if (satellite.state === "drifting") return;

    const host = satellite.satelliteHost;
    if (host && host.satelliteChain) {
      host.satelliteChain = host.satelliteChain.filter((entry) => entry !== satellite);
    }
    if (host && host.satelliteEdges) {
      host.satelliteEdges = host.satelliteEdges.filter(
        (edge) => edge.from !== satellite && edge.to !== satellite
      );
    }

    const edgesToRemove = getEdges().filter(
      (edge) => edge.from === satellite || edge.to === satellite
    );
    edgesToRemove.forEach(unregisterSatelliteEdge);
    removeEdgesWhere((edge) => edge.from === satellite || edge.to === satellite);

    if (satellite.children && satellite.children.length > 0) {
      const children = [...satellite.children];
      satellite.children = [];
      children.forEach((child) => {
        if (!child) return;
        if (child.isSatellite) {
          if (child.state !== "drifting") untetherSatellite(child);
        } else {
          dependencies.markBranchForRetraction(child, {
            allowGroundStation: true,
          });
        }
      });
    }

    if (satellite.parent) {
      satellite.parent.children = satellite.parent.children.filter(
        (child) => child !== satellite
      );
    }

    satellite.satelliteHost = null;
    satellite.parent = null;
    satellite.isTethered = false;
    satellite.state = "drifting";
    satellite.isDrifting = true;

    const driftAngle = Math.random() * Math.PI * 2;
    const satelliteConfig = getSatelliteConfig();
    const speedMin = satelliteConfig.driftSpeedMin || 0.5;
    const speedMax = satelliteConfig.driftSpeedMax || 1.5;
    const driftSpeed = speedMin + Math.random() * (speedMax - speedMin);
    satellite.driftVelocityX = Math.cos(driftAngle) * driftSpeed;
    satellite.driftVelocityY = Math.sin(driftAngle) * driftSpeed;

    logEvent("satelliteUntethered", { node: satellite });

    if (host) {
      ensureSatelliteLongLinks(host);
    } else {
      refreshSatelliteLongLinks();
    }
  }

  /**
   * Keep long-range links between non-adjacent satellites in one chain.
   */
  function ensureSatelliteLongLinks(groundStation) {
    if (
      !groundStation ||
      !groundStation.isGroundStation ||
      !groundStation.satelliteChain
    ) {
      return;
    }
    if (!groundStation.satelliteEdges) groundStation.satelliteEdges = [];

    const wirelessLinkMaxDistance = getWirelessLinkMaxDistance();
    const longEdgesToRemove = [];
    groundStation.satelliteEdges = groundStation.satelliteEdges.filter((edge) => {
      if (!edge || !edge.isSatelliteLongLink) return edge !== null;
      const { from, to } = edge;
      const valid =
        from &&
        to &&
        from.isSatellite &&
        to.isSatellite &&
        from.state === "alive" &&
        to.state === "alive" &&
        from.isTethered &&
        to.isTethered &&
        nodesHaveClearView(from, to);
      if (!valid) {
        longEdgesToRemove.push(edge);
        return false;
      }
      return true;
    });

    if (longEdgesToRemove.length > 0) {
      longEdgesToRemove.forEach(unregisterSatelliteEdge);
      removeEdgesWhere((edge) => longEdgesToRemove.includes(edge));
    }

    const chain = groundStation.satelliteChain.filter(
      (satellite) =>
        (satellite.state === "alive" || satellite.state === "spawning") &&
        satellite.isTethered
    );
    if (chain.length < 3) return;

    for (let i = 0; i < chain.length - 2; i++) {
      for (let j = i + 2; j < chain.length; j++) {
        const satA = chain[i];
        const satB = chain[j];
        if (!satA || !satB) continue;
        if (hasWirelessEdgeBetween(satA, satB)) continue;

        const distance = Math.hypot(satB.x - satA.x, satB.y - satA.y);
        if (distance > wirelessLinkMaxDistance) continue;
        if (!nodesHaveClearView(satA, satB)) continue;

        const extendedEdge = {
          from: satA,
          to: satB,
          isWirelessLink: true,
          pulseSeed: Math.random() * Math.PI * 2,
          isSatelliteLongLink: true,
        };
        getEdges().push(extendedEdge);
        registerSatelliteEdge(groundStation, extendedEdge);
      }
    }
  }

  /**
   * Refresh all long-link satellite edges across active stations.
   */
  function refreshSatelliteLongLinks() {
    const groundStations = getNodes().filter(
      (node) => node.isGroundStation && node.state === "alive"
    );
    groundStations.forEach((groundStation) =>
      ensureSatelliteLongLinks(groundStation)
    );
    ensureInterBranchSatelliteLinks(groundStations);
  }

  /**
   * Create cross-branch satellite links when two satellite hosts are eligible.
   */
  function ensureInterBranchSatelliteLinks(groundStations = null) {
    const wirelessLinkMaxDistance = getWirelessLinkMaxDistance();
    const activeGroundStations =
      groundStations ||
      getNodes().filter(
        (node) => node.isGroundStation && node.state === "alive"
      );

    const eligibleSatellites = getNodes().filter((node) => {
      if (
        !node.isSatellite ||
        node.state !== "alive" ||
        !node.isTethered ||
        !node.satelliteHost
      ) {
        return false;
      }
      const hostIsGroundStation =
        node.satelliteHost.isGroundStation &&
        node.satelliteHost.state === "alive";
      const hostIsHealthyNode =
        !node.satelliteHost.isGroundStation &&
        node.satelliteHost.state === "alive" &&
        node.satelliteHost.status === "green";
      return hostIsGroundStation || hostIsHealthyNode;
    });

    for (let i = 0; i < eligibleSatellites.length - 1; i++) {
      const satA = eligibleSatellites[i];
      const hostA = satA.satelliteHost;
      for (let j = i + 1; j < eligibleSatellites.length; j++) {
        const satB = eligibleSatellites[j];
        const hostB = satB.satelliteHost;
        if (!hostA || !hostB || hostA === hostB) continue;

        const hasGroundStationHost =
          activeGroundStations.includes(hostA) ||
          activeGroundStations.includes(hostB);
        const bothAreOrphans = !hostA.isGroundStation && !hostB.isGroundStation;
        if (!hasGroundStationHost && !bothAreOrphans) continue;
        if (hasAnyEdgeBetween(satA, satB)) continue;

        const distance = Math.hypot(satB.x - satA.x, satB.y - satA.y);
        if (distance > wirelessLinkMaxDistance) continue;
        if (!nodesHaveClearView(satA, satB)) continue;

        const longLink = {
          from: satA,
          to: satB,
          isWirelessLink: true,
          pulseSeed: Math.random() * Math.PI * 2,
          isSatelliteLongLink: true,
          isCrossBranchSatelliteLink: true,
        };
        getEdges().push(longLink);
        registerSatelliteEdge(hostA, longLink);
        registerSatelliteEdge(hostB, longLink);
      }
    }
  }

  /**
   * Return whether a ground station still owns a tethered satellite.
   */  /**
   * Legacy satellite-chain maintenance remains disabled.
   */  /**
   * Return true if a node can reach a healthy branch through wireless links.
   */
  function hasWirelessPathToHealthyBranch(node) {
    if (!node) return false;

    const wirelessLinks = getEdges().filter(
      (edge) => edge.isWirelessLink && (edge.from === node || edge.to === node)
    );
    if (wirelessLinks.length === 0) return false;

    for (const link of wirelessLinks) {
      const otherEnd = link.from === node ? link.to : link.from;
      if (!otherEnd || otherEnd.state !== "alive") continue;

      if (otherEnd.isSatellite) {
        const satelliteLinks = getEdges().filter(
          (edge) =>
            edge.isWirelessLink &&
            (edge.from === otherEnd || edge.to === otherEnd) &&
            edge !== link
        );

        for (const satelliteLink of satelliteLinks) {
          const destination =
            satelliteLink.from === otherEnd ? satelliteLink.to : satelliteLink.from;
          if (!destination || destination.state !== "alive") continue;
          if (dependencies.hasHealthyPathToCentral(destination)) return true;
        }
      } else if (dependencies.hasHealthyPathToCentral(otherEnd)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update optional legacy circular orbit behavior.
   */
  function updateLegacyOrbit(satellite) {
    if (
      !satellite ||
      !satellite.useLegacySatelliteOrbit ||
      !satellite.isSatellite ||
      satellite.state !== "alive"
    ) {
      return false;
    }

    const canvas = getCanvas();
    const viewState = getViewState();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const baseNetworkRadius = Math.max(250, viewState.maxNetworkRadius || 0);
    const targetOrbitRadius = baseNetworkRadius * (satellite.orbitScale || 1.3);
    const dx = satellite.x - cx;
    const dy = satellite.y - cy;
    const currentDist = Math.sqrt(dx * dx + dy * dy);
    const currentAngle = Math.atan2(dy, dx);
    const newDist = currentDist + (targetOrbitRadius - currentDist) * 0.05;
    const orbitalSpeed =
      (satellite.orbitalSpeed || 0.002) * (satellite.orbitalDirection || 1);
    const newAngle = currentAngle + orbitalSpeed;

    satellite.x = cx + Math.cos(newAngle) * newDist;
    satellite.y = cy + Math.sin(newAngle) * newDist;
    satellite.rotation = newAngle;
    satellite.fx = 0;
    satellite.fy = 0;
    return true;
  }

  /**
   * Update drifting satellites after they lose all service links.
   */
  function updateDriftingSatellite(satellite, colorTransitionSpeed = 0.05) {
    if (!satellite || satellite.state !== "drifting") return false;

    if (satellite.isSatellite) {
      const heartbeat =
        Math.sin(satellite.breathingPhase || 0) *
        ((satellite.heartbeatIntensity || 0) * 0.3);
      satellite.baseRadius = 9;
      satellite.targetRadius = satellite.baseRadius * (1 + heartbeat);
      const targetColor = getColor("satellite");
      satellite.currentColor.r +=
        (targetColor.r - satellite.currentColor.r) * colorTransitionSpeed;
      satellite.currentColor.g +=
        (targetColor.g - satellite.currentColor.g) * colorTransitionSpeed;
      satellite.currentColor.b +=
        (targetColor.b - satellite.currentColor.b) * colorTransitionSpeed;
    }

    satellite.x += satellite.driftVelocityX || 0;
    satellite.y += satellite.driftVelocityY || 0;
    satellite.driftVelocityX = (satellite.driftVelocityX || 0) * 0.995;
    satellite.driftVelocityY =
      ((satellite.driftVelocityY || 0) +
        (getSatelliteConfig().driftGravity || 0.02)) *
      0.995;
    satellite.opacity = Math.max(
      0,
      satellite.opacity - (getSatelliteConfig().driftFadeRate || 0.015)
    );
    satellite.radius += (satellite.targetRadius - satellite.radius) * 0.08;

    if (satellite.isSatellite) {
      const canvas = getCanvas();
      const offscreenMargin = CONFIG.network?.offscreenMargin || 250;
      const offscreenX =
        satellite.x < -offscreenMargin ||
        satellite.x > canvas.width + offscreenMargin;
      const offscreenY =
        satellite.y < -offscreenMargin ||
        satellite.y > canvas.height + offscreenMargin;
      if (offscreenX || offscreenY) {
        satellite.opacity = 0;
      }
    }

    satellite.time += 1;
    satellite.spinnerAngle += 0.04;
    satellite.ccRotation += 0.02;
    satellite.breathingPhase += (satellite.heartbeatRate || 0) * 0.5;
    return true;
  }

  /**
   * Continue a satellite's orbital drift while fading out.
   */
  function updateFadingSatellite(satellite) {
    if (!satellite || satellite.state !== "fading") return false;

    satellite.opacity = Math.max(
      0,
      satellite.opacity - (getSatelliteConfig().driftFadeRate || 0.015)
    );
    satellite.radius *= 0.98;

    const canvas = getCanvas();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const satToCenterX = satellite.x - centerX;
    const satToCenterY = satellite.y - centerY;
    const satDistToCenter = Math.sqrt(
      satToCenterX * satToCenterX + satToCenterY * satToCenterY
    );
    if (satDistToCenter > 10 && satellite.orbitalSpeed) {
      const radialX = satToCenterX / satDistToCenter;
      const radialY = satToCenterY / satDistToCenter;
      const tangentX = -radialY * (satellite.orbitalDirection || 1);
      const tangentY = radialX * (satellite.orbitalDirection || 1);
      satellite.x += tangentX * satellite.orbitalSpeed * 0.5;
      satellite.y += tangentY * satellite.orbitalSpeed * 0.5;
    }

    satellite.time += 1;
    satellite.breathingPhase += (satellite.heartbeatRate || 0) * 0.3;
    return true;
  }

  /**
   * Rebuild the active orbiting list used by satellite self-spacing.
   */
  function refreshOrbitingSatellites() {
    orbitingSatellites = getNodes().filter(
      (node) => node && node.isSatellite && node.state === "alive" && !node.launchStartTime
    );

    const satellites = getNodes().filter((node) => node && node.isSatellite);
    satellites.forEach((satellite) => {
      satellite.orbitalDirection = 1;
      if (
        typeof satellite.orbitalSpeed === "number" &&
        !satellite.orbitSpeedAdjusted
      ) {
        satellite.orbitalSpeed *= 0.75;
        satellite.orbitSpeedAdjusted = true;
      }
    });

    return orbitingSatellites;
  }

  /**
   * Determine whether a satellite can reach any ground station through wireless mesh.
   */
  function canReachGroundStation(startSatellite) {
    const visited = new Set();
    const queue = [startSatellite];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const links = getEdges().filter(
        (edge) =>
          edge.isWirelessLink &&
          (edge.from === current || edge.to === current)
      );

      for (const link of links) {
        const neighbor = link.from === current ? link.to : link.from;
        if (!neighbor || neighbor.state !== "alive") continue;
        if (neighbor.isGroundStation) return true;
        if (neighbor.isSatellite && !visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    return false;
  }

  /**
   * Advance launch arcs, elliptical orbital motion, self-spacing, and uplink fade.
   */
  function updateOrbit(satellite) {
    if (
      !satellite ||
      !satellite.isSatellite ||
      (satellite.state !== "alive" && satellite.state !== "spawning")
    ) {
      return false;
    }

    const canvas = getCanvas();
    const viewState = getViewState();
    const satelliteConfig = getSatelliteConfig();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const baseNetworkRadius = Math.max(250, viewState.maxNetworkRadius || 0);
    const orbitAltitude =
      typeof satellite.orbitAltitude === "number" ? satellite.orbitAltitude : 190;
    const targetOrbitRadius = baseNetworkRadius + orbitAltitude;

    if (typeof satellite.orbitRadius !== "number") {
      satellite.orbitRadius = targetOrbitRadius;
    }
    satellite.orbitRadius += (targetOrbitRadius - satellite.orbitRadius) * 0.03;

    const orbitEccentricity =
      typeof satellite.orbitEccentricity === "number"
        ? satellite.orbitEccentricity
        : 0.1;
    const targetRadiusX = satellite.orbitRadius * (1 + orbitEccentricity);
    const targetRadiusY = satellite.orbitRadius * (1 - orbitEccentricity);
    if (typeof satellite.orbitalRadiusX !== "number") {
      satellite.orbitalRadiusX = targetRadiusX;
    }
    if (typeof satellite.orbitalRadiusY !== "number") {
      satellite.orbitalRadiusY = targetRadiusY;
    }
    satellite.orbitalRadiusX += (targetRadiusX - satellite.orbitalRadiusX) * 0.05;
    satellite.orbitalRadiusY += (targetRadiusY - satellite.orbitalRadiusY) * 0.05;

    if (satellite.launchStartTime) {
      updateLaunchArc(satellite, centerX, centerY);
    } else {
      updateSteadyOrbit(satellite, centerX, centerY);
    }

    if (!canReachGroundStation(satellite)) {
      if (!satellite.unlinkTime) satellite.unlinkTime = Date.now();
      const unlinkDuration = Date.now() - satellite.unlinkTime;
      const fadeProgress = Math.min(
        1,
        unlinkDuration / (satelliteConfig.unlinkedTimeout || 30000)
      );
      satellite.opacity = 1 - fadeProgress * 0.9;

      if (unlinkDuration > (satelliteConfig.unlinkedTimeout || 30000)) {
        satellite.state = "fading";
        logCustom("🛰️ Satellite lost ground station uplink - despawning...", {
          satellite: getLogNodeRef(satellite),
        });
      }
    } else {
      satellite.unlinkTime = null;
      satellite.opacity = 1;
    }

    return true;
  }

  function updateLaunchArc(satellite, centerX, centerY) {
    const now = Date.now();
    const launchDuration = getSatelliteConfig().launchDuration || 6000;
    const launchElapsed = now - satellite.launchStartTime;
    const launchProgress = Math.min(1, launchElapsed / launchDuration);

    if (launchProgress < 1) {
      const eased = launchProgress;
      const targetX =
        centerX + Math.cos(satellite.orbitalAngle) * satellite.orbitalRadiusX;
      const targetY =
        centerY + Math.sin(satellite.orbitalAngle) * satellite.orbitalRadiusY;
      const launchX = satellite.launchX ?? satellite.launchedFrom?.x ?? satellite.x;
      const launchY = satellite.launchY ?? satellite.launchedFrom?.y ?? satellite.y;
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
      const arcHeight = Math.min(
        520,
        Math.max(140, segLen * (satellite.launchArcHeight || 0.6))
      );
      const tanX = -outUnitY;
      const tanY = outUnitX;
      const side = satellite.orbitalDirection || 1;
      const sideOffset =
        Math.min(420, Math.max(160, arcHeight * 0.95)) * -side;
      const perpX = outUnitX * arcHeight + tanX * sideOffset;
      const perpY = outUnitY * arcHeight + tanY * sideOffset;
      const t = eased;

      satellite.x =
        (1 - t) * (1 - t) * launchX +
        2 * (1 - t) * t * (midX + perpX) +
        t * t * targetX;
      satellite.y =
        (1 - t) * (1 - t) * launchY +
        2 * (1 - t) * t * (midY + perpY) +
        t * t * targetY;
      satellite.fx = 0;
      satellite.fy = 0;

      if (!satellite.launchTrail) satellite.launchTrail = [];
      satellite.launchTrail.push({ x: satellite.x, y: satellite.y, t: now });
      const trailCutoff = now - launchDuration;
      while (satellite.launchTrail.length > 0) {
        if ((satellite.launchTrail[0]?.t ?? 0) >= trailCutoff) break;
        satellite.launchTrail.shift();
      }
      if (satellite.launchTrail.length > 140) {
        satellite.launchTrail.splice(0, satellite.launchTrail.length - 140);
      }

      if (!satellite.stageSeparationTime && eased >= 0.12) {
        satellite.stageSeparationTime = now;
        createPopParticles(satellite.x, satellite.y, getColor("neonGreen"));
        createPopParticles(satellite.x, satellite.y, getColor("satellite"));
      }
      return;
    }

    satellite.x =
      centerX + Math.cos(satellite.orbitalAngle) * satellite.orbitalRadiusX;
    satellite.y =
      centerY + Math.sin(satellite.orbitalAngle) * satellite.orbitalRadiusY;
    satellite.fx = 0;
    satellite.fy = 0;
    satellite.launchStartTime = null;
    satellite.launchTrail = null;
    satellite.stageSeparationTime = 0;
  }

  function updateSteadyOrbit(satellite, centerX, centerY) {
    if (satellite.orbitalAngle === undefined) {
      satellite.orbitalAngle = Math.atan2(
        satellite.y - centerY,
        satellite.x - centerX
      );
    }

    const direction = satellite.orbitalDirection || 1;
    const baseOmega =
      (typeof satellite.orbitalSpeed === "number"
        ? satellite.orbitalSpeed
        : getSatelliteConfig().orbitalSpeedBase || 0.0024) * direction;
    satellite.orbitalAngle += baseOmega;

    if (orbitingSatellites && orbitingSatellites.length > 1) {
      const repulsionZone = (Math.PI * 2) / 7;
      const idealSpacing = (Math.PI * 2) / orbitingSatellites.length;
      let correction = 0;

      for (const other of orbitingSatellites) {
        if (!other || other === satellite) continue;
        if (typeof other.orbitalAngle !== "number") continue;

        let diff = satellite.orbitalAngle - other.orbitalAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        const absDiff = Math.abs(diff);
        if (absDiff < 0.001) continue;

        if (absDiff < repulsionZone) {
          const push = (repulsionZone - absDiff) / repulsionZone;
          correction += (diff > 0 ? 1 : -1) * push * 0.004;
        } else {
          const spring = idealSpacing - absDiff;
          correction += (diff > 0 ? 1 : -1) * spring * 0.001;
        }
      }

      const maxCorrection = baseOmega * 0.75;
      if (correction > maxCorrection) correction = maxCorrection;
      if (correction < -maxCorrection) correction = -maxCorrection;
      satellite.orbitalAngle += correction;
    }

    satellite.x =
      centerX + Math.cos(satellite.orbitalAngle) * satellite.orbitalRadiusX;
    satellite.y =
      centerY + Math.sin(satellite.orbitalAngle) * satellite.orbitalRadiusY;
    satellite.fx = 0;
    satellite.fy = 0;
  }

  const SatelliteSystem = {
    /**
     * Connect app-owned state, constructors, helpers, and logging callbacks.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    getOrbitingSatellites() {
      return orbitingSatellites;
    },

    refreshOrbitingSatellites,
    updateLegacyOrbit,
    updateDriftingSatellite,
    updateFadingSatellite,
    updateOrbit,
    canReachGroundStation,
    hasAnyEdgeBetween,
    hasWirelessEdgeBetween,
    hasWirelessPathToHealthyBranch,
    convertToGroundStation,
    sproutGroundStationFromHealthyNode,
    launchSatelliteFromGroundStation,
    checkSatelliteLifespans,
    checkGroundStationLifespans,
    revertGroundStationToNormalNode,
    groundStationsLaunchSatellites,
    updateSatelliteWirelessLinks,
    registerSatelliteEdge,
    unregisterSatelliteEdge,
    removeSatelliteChain,
    untetherSatellite,
    ensureSatelliteLongLinks,
    refreshSatelliteLongLinks,
    ensureInterBranchSatelliteLinks,

    /**
     * Schedule a possible ground-station promotion for a new branch node
     * after it has had time to settle into the network.
     */
    scheduleGroundStationPromotion(branchNode) {
      if (!branchNode) return;
      const nodes = getNodes();
      setTimeout(() => {
        const isSingle =
          branchNode.parent === nodes[0] &&
          branchNode.children.length === 0 &&
          branchNode.state === "alive";
        const alreadySpecial =
          branchNode.isGuardian || branchNode.isGroundStation;
        if (!isSingle || alreadySpecial) return;

        if (Math.random() < 0.25) {
          convertToGroundStation(branchNode);
        }
      }, 4000 + Math.random() * 2000);
    },
  };

  window.NodeNet.SatelliteSystem = SatelliteSystem;
})();
