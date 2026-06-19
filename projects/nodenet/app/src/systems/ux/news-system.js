/**
 * @module NewsSystem
 * @summary NEWS — "GNN: Global Node News", a satirical broadcast that reports on network events.
 * @description Subscribes to the global event stream and turns events into tongue-in-cheek news.
 *   Major events trigger a "BREAKING NEWS" lower-third broadcast card (anchor desk styling, LIVE bug,
 *   reporter byline); minor events scroll past in a continuous bottom crawl. The DOM (broadcast card,
 *   crawl, and show/hide toggle) is created at init so the feature is fully self-contained. Toggleable.
 * @exports window.NodeNet.NewsSystem
 * @tags news, broadcast, satire, ticker, crawl, lower-third, ux, dom
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
  };

  // ── State ────────────────────────────────────────────────────────────────
  let enabled = true;
  let root = null; // #newsBroadcast card
  let elHeadline = null;
  let elCategory = null;
  let elBreaking = null;
  let elReporter = null;
  let elClock = null;
  let elCrawl = null; // moving inner crawl element
  let elCrawlViewport = null;
  let reopenBtn = null;

  let breakingUntil = 0; // timestamp; while > now the card is in BREAKING mode
  let crawlQueue = []; // pending crawl headline strings
  let crawlX = 0; // current crawl translate (px)
  let crawlText = ""; // text currently shown in the crawl element
  let lastClockText = "";

  // ── Satirical content ──────────────────────────────────────────────────
  const REPORTERS = [
    "Anchor: Dot Matrix",
    "Reporting: Ping Pongerton",
    "Live: Ada Lovelace-Cable",
    "Field Desk: Cat-5 Katie",
    "Correspondent: Buffer Overflowe",
    "On the scene: Mal Ware",
    "Desk: Ethernet Eddie",
    "Studio: Gigabit Gloria",
  ];

  // Generic "B-roll" headlines for the crawl when the network is quiet.
  const FILLER = [
    "Local packet 'just wanted to be delivered,' sources say",
    "Firewall denies allegations, denies everything else too",
    "Study finds 9 out of 10 nodes prefer uptime",
    "Bandwidth prices soar as everyone streams cat videos",
    "Opinion: Is your router listening? (It is.)",
    "Satellite reports stunning views, terrible Wi-Fi",
    "Breaking: Loopback address confirms 'there's no place like 127.0.0.1'",
    "Economy rattled by sudden shortage of available ports",
    "Weather: cloudy, with a 70% chance of latency",
    "Node influencer hits 1,000 connections, becomes hub",
    "Experts baffled as TCP packet actually arrives in order",
    "Health desk: remember to flush your DNS cache",
  ];

  /** Major events get the full BREAKING NEWS broadcast treatment. */
  const BREAKING_KEYS = new Set([
    "ddosLaunched",
    "centralCompromised",
    "commandControlDetected",
    "botnetClusterFormed",
    "centralSelfHealingStarted",
    "centralSelfHealingCompleted",
    "honeypotConversion",
    "datacenterFormed",
    "ddosEnded",
  ]);

  /** Category label shown on the lower-third for each headline. */
  function categoryFor(key) {
    if (key.startsWith("ddos")) return "TRAFFIC ALERT";
    if (key.includes("central")) return "NATIONAL SECURITY";
    if (key.includes("commandControl") || key.includes("botnet")) return "ORGANIZED CRIME";
    if (key.includes("honeypot")) return "STING OPERATION";
    if (key.includes("datacenter")) return "BUSINESS";
    if (key.includes("guardian") || key.includes("defended") || key.includes("blocked"))
      return "DEFENSE";
    if (key.includes("satellite") || key.includes("groundStation")) return "SPACE";
    if (key.includes("Recovered") || key.includes("Healing") || key.includes("recovery"))
      return "HEALTH";
    if (key.includes("Infected") || key.includes("Malware") || key.includes("phish"))
      return "OUTBREAK";
    return "NETWORK";
  }

  /**
   * Friendly label for a node referenced in an event. Prefers the node's
   * human-readable friendly name (e.g. "RizzCanary7"); only falls back to its
   * MAC address (node.id) when no friendly name is available.
   */
  function nodeLabel(node) {
    if (!node) return "an unnamed node";
    const nodes = dependencies.getNodes();
    if (nodes && nodes[0] && node === nodes[0]) return "the Central Hub";
    return node.friendlyName || node.id || "an unnamed node";
  }

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  /**
   * Headline writers per event key. Each returns a satirical string.
   * Falls back to a generic rewrite of the raw message when no writer exists.
   */
  const HEADLINES = {
    ddosLaunched: (c) =>
      pick([
        `TRAFFIC CHAOS: ${nodeLabel(c.targetBranch)} gridlocked as ${c.botnets || "countless"} bots pile on`,
        `"It came out of nowhere" — ${nodeLabel(c.targetBranch)} buried under packet avalanche`,
        `DDOS storm slams ${nodeLabel(c.targetBranch)}; commuters advised to find another route`,
      ]),
    ddosEnded: (c) =>
      pick([
        `Calm returns to ${nodeLabel(c.targetBranch)} as flood waters recede`,
        `Cleanup begins after traffic siege on ${nodeLabel(c.targetBranch)}`,
      ]),
    centralCompromised: () =>
      pick([
        "NATIONAL EMERGENCY: Central Hub falls to hostile code",
        "The unthinkable: Central Hub compromised, officials scramble",
        "Central Hub breached — markets, memes plunge into uncertainty",
      ]),
    centralSelfHealingStarted: () =>
      pick([
        "Central Hub enters intensive care; nation holds its breath",
        "Emergency self-repair underway at Central Hub",
      ]),
    centralSelfHealingCompleted: () =>
      pick([
        "MIRACLE RECOVERY: Central Hub back on its feet",
        "Central Hub discharged from ICU, vows to 'patch and learn'",
      ]),
    commandControlDetected: (c) =>
      pick([
        `CRIME RING EXPOSED: ${nodeLabel(c.node)} unmasked as Command & Control`,
        `Authorities ID ${nodeLabel(c.node)} as kingpin of botnet syndicate`,
      ]),
    botnetClusterFormed: (c) =>
      pick([
        `Gang activity surges: ${c.infectedNodes || "several"} nodes form botnet bloc`,
        "Neighborhood watch fails as botnet cluster moves in",
      ]),
    honeypotConversion: (c) =>
      pick([
        `STING SUCCESS: attacker lured by ${nodeLabel(c.honeypot)}, switches sides`,
        `Sweet justice — ${nodeLabel(c.honeypot)} flips an attacker into a Guardian`,
      ]),
    datacenterFormed: (c) =>
      pick([
        `BUSINESS BOOM: ${nodeLabel(c.node)} opens sprawling new datacenter`,
        `Ribbon cut on ${nodeLabel(c.node)}'s datacenter; ${c.clusterSize || "many"} nodes employed`,
      ]),
    // ── minor (crawl) writers ──
    nodeInfected: (c) => `Outbreak: ${nodeLabel(c.node)} tests positive for malware`,
    statusMalware: (c) => `${nodeLabel(c.node)} succumbs to infection; quarantine urged`,
    statusBotnet: (c) => `${nodeLabel(c.node)} reportedly 'fell in with the wrong crowd'`,
    statusDown: (c) => `${nodeLabel(c.node)} goes dark; neighbors light candles`,
    statusRecovered: (c) => `Feel-good story: ${nodeLabel(c.node)} makes full recovery`,
    nodeDefended: (c) => `${nodeLabel(c.node)} shrugs off attack like it's nothing`,
    phishingSuccess: (c) => `${nodeLabel(c.target)} clicks suspicious link, instantly regrets it`,
    phishingBlocked: (c) => `${nodeLabel(c.node)} spots phishing scam, feels very clever`,
    pingOfDeathHit: (c) => `${nodeLabel(c.target)} struck by Ping of Death; thoughts and prayers`,
    firewallBlockedPing: (c) => `${nodeLabel(c.firewallNode)}'s firewall swats away Ping of Death`,
    guardianPromotionDispatch: (c) => `Local hero: ${nodeLabel(c.node)} answers the call, becomes Guardian`,
    guardianPromotionPhishing: (c) => `Plot twist: failed phishing reveals ${nodeLabel(c.node)} as Guardian`,
    honeypotCreated: (c) => `${nodeLabel(c.node)} sets a delicious trap for the unwary`,
    groundStationEstablished: (c) => `${nodeLabel(c.node)} becomes ground station; locals get bars`,
    satelliteOrbiting: (c) => `${nodeLabel(c.satellite)} reaches orbit, sends postcard`,
    branchSprouted: (c) => `Baby boom: a new node sprouts from ${nodeLabel(c.parent)}`,
    branchPruned: (c) => `Urban renewal: a withered branch is pruned away`,
    immunityHealingCompleted: (c) => `${nodeLabel(c.node)} beats infection thanks to immunity packets`,
    dispatchSuccessful: (c) => `Relief arrives: cleanup crew reaches ${nodeLabel(c.target)}`,
    counterStrikeHit: (c) => `${nodeLabel(c.guardian)} fires back; attacker did not see it coming`,
    guardianVpnCreated: (c) => `${nodeLabel(c.guardian)} opens secure tunnel; spies furious`,
    groundStationExpired: (c) => `${nodeLabel(c.node)} ground station retires after long service`,
  };

  /** Build a headline string for an event, or null to skip. */
  function writeHeadline(key, context) {
    const writer = HEADLINES[key];
    if (writer) {
      try {
        return writer(context || {});
      } catch (_) {
        /* fall through */
      }
    }
    return null;
  }

  // ── DOM construction ──────────────────────────────────────────────────
  function buildDom() {
    if (root) return;

    root = document.createElement("div");
    root.id = "newsBroadcast";
    root.className = "gnn";
    root.innerHTML = `
      <div class="gnn-header">
        <span class="gnn-logo"><span class="gnn-dish">📡</span> GNN</span>
        <span class="gnn-live"><span class="gnn-live-dot"></span>LIVE</span>
        <span class="gnn-title">GLOBAL&nbsp;NODE&nbsp;NEWS</span>
        <button class="gnn-toggle" type="button" title="Hide News">×</button>
      </div>
      <div class="gnn-body">
        <span class="gnn-breaking">BREAKING</span>
        <span class="gnn-category">NETWORK</span>
        <span class="gnn-headline">Standby — monitoring the network for developing stories…</span>
      </div>
      <div class="gnn-footer">
        <span class="gnn-reporter">${pick(REPORTERS)}</span>
        <div class="gnn-crawl-viewport"><div class="gnn-crawl"></div></div>
        <span class="gnn-clock">--:--:--</span>
      </div>
    `;
    document.body.appendChild(root);

    elHeadline = root.querySelector(".gnn-headline");
    elCategory = root.querySelector(".gnn-category");
    elBreaking = root.querySelector(".gnn-breaking");
    elReporter = root.querySelector(".gnn-reporter");
    elClock = root.querySelector(".gnn-clock");
    elCrawl = root.querySelector(".gnn-crawl");
    elCrawlViewport = root.querySelector(".gnn-crawl-viewport");

    root.querySelector(".gnn-toggle").addEventListener("click", () => setEnabled(false));

    // Floating re-open button (hidden while broadcast is visible).
    reopenBtn = document.createElement("button");
    reopenBtn.id = "newsReopenBtn";
    reopenBtn.type = "button";
    reopenBtn.title = "Show News (GNN)";
    reopenBtn.innerHTML = "📺";
    reopenBtn.style.display = "none";
    reopenBtn.addEventListener("click", () => setEnabled(true));
    document.body.appendChild(reopenBtn);

    // Seed crawl with filler so it's never empty.
    crawlQueue = FILLER.slice();
  }

  // ── Broadcasting ──────────────────────────────────────────────────────
  /** Show a headline in the main lower-third (breaking) slot. */
  function broadcast(headline, key) {
    if (!elHeadline) return;
    elHeadline.textContent = headline;
    elCategory.textContent = categoryFor(key);
    elReporter.textContent = pick(REPORTERS);
    breakingUntil = Date.now() + 7000;
    root.classList.add("breaking");
    // Restart the headline slide-in animation.
    elHeadline.style.animation = "none";
    // eslint-disable-next-line no-unused-expressions
    elHeadline.offsetHeight; // force reflow
    elHeadline.style.animation = "";
  }

  /** Queue a headline into the scrolling crawl. */
  function enqueueCrawl(text) {
    // Cap pending queue to avoid unbounded growth during storms.
    if (crawlQueue.length > 40) crawlQueue.splice(0, crawlQueue.length - 40);
    crawlQueue.push(text);
  }

  /** Event subscriber entrypoint (wired via EventLoggingSystem.subscribe). */
  function handleEvent(key, context) {
    const headline = writeHeadline(key, context);
    if (!headline) return;
    if (BREAKING_KEYS.has(key)) {
      broadcast(headline, key);
      enqueueCrawl(headline); // breaking items also scroll by afterward
    } else {
      enqueueCrawl(headline);
    }
  }

  // ── Per-frame update (called from the main animate loop) ────────────────
  function update() {
    if (!enabled || !root) return;

    const now = Date.now();

    // Clock.
    const clockText = new Date().toLocaleTimeString("en-US", { hour12: false });
    if (clockText !== lastClockText) {
      lastClockText = clockText;
      if (elClock) elClock.textContent = clockText;
    }

    // Expire breaking mode -> return to a calm standby headline.
    if (breakingUntil && now > breakingUntil) {
      breakingUntil = 0;
      root.classList.remove("breaking");
      if (elCategory) elCategory.textContent = "NETWORK";
      if (elHeadline)
        elHeadline.textContent =
          "Network stable — GNN continues round-the-clock coverage.";
    }

    updateCrawl();
  }

  /** Advance the bottom crawl, recycling content from the queue. */
  function updateCrawl() {
    if (!elCrawl || !elCrawlViewport) return;

    const viewportW = elCrawlViewport.clientWidth || 300;

    // (Re)load crawl text when the current run has fully scrolled off the left.
    if (!crawlText || crawlX + elCrawl.offsetWidth < 0) {
      const next = crawlQueue.shift();
      // Recycle filler so the crawl never stops.
      if (next === undefined) {
        crawlText = pick(FILLER);
      } else {
        crawlText = next;
        // Keep filler topped up behind real news.
        if (crawlQueue.length < 2) crawlQueue.push(pick(FILLER));
      }
      elCrawl.textContent = "•  " + crawlText + "  ";
      crawlX = viewportW; // start just off the right edge
    }

    crawlX -= 1.4; // px/frame
    elCrawl.style.transform = `translateX(${crawlX}px)`;
  }

  // ── Enable / disable ──────────────────────────────────────────────────
  function setEnabled(v) {
    enabled = !!v;
    if (!root) return;
    root.style.display = enabled ? "" : "none";
    if (reopenBtn) reopenBtn.style.display = enabled ? "none" : "flex";
  }

  function init() {
    buildDom();
    setEnabled(enabled);
  }

  const NewsSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },
    init,
    handleEvent,
    update,
    setEnabled,
    isEnabled() {
      return enabled;
    },
  };

  window.NodeNet.NewsSystem = NewsSystem;
})();
