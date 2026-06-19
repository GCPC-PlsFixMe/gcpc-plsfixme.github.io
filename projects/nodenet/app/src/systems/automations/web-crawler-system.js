/**
 * @module WebCrawlerSystem
 * @summary Spider observer — moves a crawler through the network and renders its body.
 * @exports window.NodeNet.WebCrawlerSystem
 * @tags web-crawler, spider, observer, automation, traversal, draw
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    getEdges: () => [],
    logEvent: () => {},
    getLogNodeRef: () => null,
    incrementStat: () => {},
    createPopParticles: () => {},
    getColors: () => ({
      green: { r: 22, g: 163, b: 74 },
      red: { r: 248, g: 113, b: 113 },
    }),
  };

  // ─── Web Crawler / Spider Entity ───────────────────────────────────────
  /**
   * A single cute web-crawler spider that periodically emerges from the
   * central node, crawls the network collecting data, then returns to hide.
   * It never harms nodes — it just observes and "feeds" on data.
   */
  const WebCrawler = {
    /**
     * Connect browser-runtime state and callbacks owned by nodenet-app.js.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    _nodes() {
      return dependencies.getNodes();
    },

    _edges() {
      return dependencies.getEdges();
    },

    _logEvent(type, payload) {
      dependencies.logEvent(type, payload);
    },

    _getLogNodeRef(node) {
      return dependencies.getLogNodeRef(node);
    },

    _incrementStat(statName) {
      dependencies.incrementStat(statName);
    },

    _createPopParticles(x, y, color) {
      dependencies.createPopParticles(x, y, color);
    },

    _colors() {
      return dependencies.getColors();
    },
    // ── State ──────────────────────────────────────────────────────
    state: 'hidden',   // 'hidden'|'emerging'|'crawling'|'feeding'|'returning'|'hiding'
    node: null,        // node currently occupying or last visited
    targetNode: null,  // node currently travelling toward
    path: [],          // remaining queued path nodes
    x: 0, y: 0,       // world position (interpolated)
    progress: 0,       // 0→1 travel progress on current edge
    feedTimer: 0,      // ms remaining while feeding
    hideTimer: 0,      // ms until next emergence
    sleepTimer: 0,     // ms remaining while sleeping
    nodesVisited: 0,   // nodes visited this excursion
    stateAfterSleep: 'crawling', // next state to resume after sleep
    lastSleepAt: 0,    // timestamp of last sleep start
    _scaleAnim: 0,     // 0→1 emerge / 1→0 hide animation fraction
    _dataCollected: 0, // total nodes fed on (cosmetic)
    _dir: 0,           // current facing angle (radians) — smoothly updated toward travel direction
    _wasCompromised: false, // track majority-compromised hiding log spam

    // ── Config ─────────────────────────────────────────────────────
    HIDE_DURATION:    8000, // ms to stay hidden between excursions (shorter for continuous activity)
    FEED_DURATION:    1400, // ms to dwell at each node
    MAX_VISITS:          7, // nodes to visit before returning home
    TRAVEL_SPEED_PX: 0.105,  // pixels per ms along edges (normalized speed)
    RETURN_SPEED_PX: 0.105,  // use same speed when retreating
    ANIM_DURATION:     700, // ms for emerge / hide scale animation
    SLEEP_MIN_DURATION: 2500, // ms
    SLEEP_MAX_DURATION: 5000, // ms
    SLEEP_BREAK_CHANCE: 0.35, // higher chance to nap after a feed
    SLEEP_FORCE_INTERVAL: 20000, // ms without sleep triggers a nap

    // ── Init ───────────────────────────────────────────────────────
    /**
     * Called once after createGraph(). Sets the spider dormant inside
     * the central node with a shorter-than-normal first timer.
     */
    init() {
      const nodes = this._nodes();
      if (!nodes.length) return;
      this.node       = nodes[0];
      this.x          = nodes[0].x;
      this.y          = nodes[0].y;
      this.hideTimer  = this.HIDE_DURATION * 0.25; // first appearance sooner
      this.lastSleepAt = performance.now();
      this._logEvent('custom', { message: '🕷️ Web Crawler dormant inside central node.' });
    },

    _networkHealth() {
      const nodes = this._nodes();
      const alive = nodes.filter((n) => n.state === 'alive');
      if (alive.length === 0) return { compromised: false, recovered: true, ratio: 0 };
      const compromised = alive.filter(
        (n) => n.status === 'red' || n.status === 'yellow' || n.status === 'malware' || n.status === 'botnet' || n.status === 'commandControl'
      ).length;
      const ratio = compromised / alive.length;
      return {
        compromised: ratio >= 0.5,
        recovered: ratio <= 0.45, // small hysteresis to avoid flapping
        ratio,
      };
    },

    // ── BFS pathfinding (physical edges only) ─────────────────────
    /**
     * Returns an ordered array of nodes from start→end using BFS
     * over non-wireless, non-satellite edges.
     */
    _findPath(start, end) {
      const edges = this._edges();
      if (start === end) return [start];
      const prev = new Map([[start, null]]);
      const queue = [start];
      while (queue.length) {
        const cur = queue.shift();
        for (const edge of edges) {
          if (edge.isWirelessLink || edge.isGuardianVpnTunnel || edge.isDatacenterVpnTunnel) continue;
          let nb = null;
          if (edge.from === cur && edge.to.state === 'alive' && !edge.to.isSatellite)  nb = edge.to;
          if (edge.to   === cur && edge.from.state === 'alive' && !edge.from.isSatellite) nb = edge.from;
          if (!nb || prev.has(nb)) continue;
          prev.set(nb, cur);
          if (nb === end) {
            const path = [];
            let n = end;
            while (n !== null) { path.unshift(n); n = prev.get(n); }
            return path;
          }
          queue.push(nb);
        }
      }
      return [start]; // unreachable — stay put
    },

    _findEdgeBetween(nodeA, nodeB) {
      return (
        this._edges().find(
          (edge) =>
            edge &&
            ((edge.from === nodeA && edge.to === nodeB) ||
              (edge.from === nodeB && edge.to === nodeA))
        ) || null
      );
    },

    _quadraticPoint(p0, p1, p2, t) {
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      };
    },

    _quadraticTangent(p0, p1, p2, t) {
      return {
        x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
        y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
      };
    },

    _getNormalEdgeFlexControl(edge, now) {
      if (!edge || !edge.from || !edge.to || edge.isGuardianVpnTunnel || edge.isDatacenterVpnTunnel) {
        return null;
      }
      const dx = edge.to.x - edge.from.x;
      const dy = edge.to.y - edge.from.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1) return null;

      const flexSeed = edge.pulseSeed || 0;
      const flexAmp = Math.min(22, len * 0.09);
      const wobble =
        (Math.sin(now * 0.0009 + flexSeed) * 0.75 +
          Math.sin(now * 0.00055 + flexSeed * 1.7) * 0.35) *
        flexAmp;
      return {
        x: (edge.from.x + edge.to.x) / 2 + (-dy / len) * wobble,
        y: (edge.from.y + edge.to.y) / 2 + (dx / len) * wobble,
      };
    },

    _sampleConnectionPath(fromNode, toNode, progress, now) {
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const fallbackAngle = Math.atan2(dy, dx);
      const edge = this._findEdgeBetween(fromNode, toNode);
      const control = this._getNormalEdgeFlexControl(edge, now);
      if (!edge || !control) {
        return {
          x: fromNode.x + dx * progress,
          y: fromNode.y + dy * progress,
          angle: fallbackAngle,
        };
      }

      const forward = edge.from === fromNode && edge.to === toNode;
      const edgeProgress = forward ? progress : 1 - progress;
      const point = this._quadraticPoint(edge.from, control, edge.to, edgeProgress);
      const tangent = this._quadraticTangent(edge.from, control, edge.to, edgeProgress);
      const tangentX = forward ? tangent.x : -tangent.x;
      const tangentY = forward ? tangent.y : -tangent.y;
      const tangentLength = Math.hypot(tangentX, tangentY);
      return {
        x: point.x,
        y: point.y,
        angle: tangentLength > 0 ? Math.atan2(tangentY, tangentX) : fallbackAngle,
      };
    },

    _turnToward(angle) {
      let delta = angle - this._dir;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this._dir += delta * 0.2;
    },

    _advanceAlongConnection(speedPx, deltaMs, now) {
      const dx = this.targetNode.x - this.node.x;
      const dy = this.targetNode.y - this.node.y;
      const segmentLength = Math.max(1, Math.hypot(dx, dy));
      const deltaProgress = (speedPx * deltaMs) / segmentLength;
      this.progress = Math.min(1, this.progress + deltaProgress);
      const sample = this._sampleConnectionPath(
        this.node,
        this.targetNode,
        this.progress,
        now
      );
      this.x = sample.x;
      this.y = sample.y;
      this._turnToward(sample.angle);
      return this.progress >= 1;
    },

    /** Picks a random alive non-central, non-satellite target node. */
    _pickTarget() {
      const nodes = this._nodes();
      const pool = nodes.filter(n =>
        n !== nodes[0] && n.state === 'alive' && !n.isSatellite
      );
      if (!pool.length) return nodes[0];
      // Prefer uninfected nodes — the spider is cautious!
      const safe = pool.filter(n => n.status === 'green' || n.status === 'blue');
      const src  = safe.length > 2 ? safe : pool;
      return src[Math.floor(Math.random() * src.length)];
    },

    // ── Update (called every frame) ───────────────────────────────
    /**
     * Advances state machine by deltaSeconds. Position is interpolated
     * between nodes along edges; animations are driven by _scaleAnim.
     */
    update(now, deltaSeconds) {
      const nodes = this._nodes();
      if (!nodes || nodes.length === 0) return;
      const dm = deltaSeconds * 1000; // deltaMs
      const central = nodes[0];
      const { compromised: networkCompromised, recovered: networkRecovered } = this._networkHealth();

      // If network is mostly compromised, start a controlled return instead of teleporting
      if (
        networkCompromised &&
        this.state !== 'hidden' &&
        this.state !== 'hiding' &&
        this.state !== 'returning'
      ) {
        const rp = this._findPath(this.node || central, central);
        rp.shift();
        this.path       = rp;
        this.targetNode = this.path.shift() || central;
        this.progress   = 0;
        this.state      = 'returning';
        if (!this._wasCompromised) {
          this._logEvent('custom', { message: '🕷️ Web Crawler retreating to center while network is heavily compromised.' });
          this._wasCompromised = true;
        }
      }
      if (networkRecovered && this._wasCompromised) {
        this._wasCompromised = false;
      }

      switch (this.state) {

        case 'hidden': {
          this.x = central.x;
          this.y = central.y;
          this._scaleAnim = 0;
          // Stay hidden if majority is compromised
          if (networkCompromised) {
            this.hideTimer = this.HIDE_DURATION; // keep refreshed while danger persists
            break;
          }
          this.hideTimer -= dm;
          if (this.hideTimer <= 0) {
            this.state = 'emerging';
            this.nodesVisited = 0;
            this._logEvent('custom', { message: '🕷️ Web Crawler emerging from central node to explore the network...' });
          }
          break;
        }

        case 'emerging': {
          this.x = central.x;
          this.y = central.y;
          this._scaleAnim = Math.min(1, this._scaleAnim + dm / this.ANIM_DURATION);
          if (this._scaleAnim >= 1) {
            this.node = central;
            this.state = 'crawling';
            const tgt  = this._pickTarget();
            const full = this._findPath(central, tgt);
            full.shift(); // remove current node
            this.path       = full;
            this.targetNode = this.path.shift() || central;
            this.progress   = 0;
          }
          break;
        }

        case 'crawling': {
          // Abort and return if the edge leads to a down node
          if (this.targetNode && (this.targetNode.state !== 'alive' || this.targetNode.status === 'red')) {
            const rp = this._findPath(this.node, central);
            rp.shift();
            this.path       = rp;
            this.targetNode = this.path.shift() || central;
            this.progress   = 0;
            this.state      = 'returning';
            this._logEvent('custom', { message: '🕷️ Web Crawler found a down edge and is returning to choose another branch.' });
            break;
          }

          if (!this.targetNode || this.targetNode === this.node) {
            // Arrived — start feeding
            this.state     = 'feeding';
            this.feedTimer = this.FEED_DURATION;
            this.x         = this.node.x;
            this.y         = this.node.y;
            this.nodesVisited++;
            this._logEvent('custom', {
              alert: '🕷️ Web Crawler feeding.',
              details: { node: this._getLogNodeRef(this.node) },
            });
            break;
          }
          if (this._advanceAlongConnection(this.TRAVEL_SPEED_PX, dm, now)) {
            this.node     = this.targetNode;
            this.progress = 0;
            this.targetNode = this.path.length ? this.path.shift() : null;
          }
          break;
        }

        case 'feeding': {
          this.x = this.node.x;
          this.y = this.node.y;
          this.feedTimer -= dm;
          if (this.feedTimer <= 0) {
            // Resolve feeding outcome with state-based success chance
            const status = this.node.status;
            let successChance = 0.75; // default healthy
            if (this.node.status === 'yellow') successChance = 0.9; // impacted: easy
            else if (this.node.hasFirewall) successChance = 0.45; // tougher on firewall
            else if (status === 'malware' || status === 'botnet' || status === 'commandControl') successChance = 0.6;
            if (status === 'red' || this.node.state !== 'alive') successChance = 0.0; // down always fails

            const success = Math.random() < successChance;
            const pulseColor = success ? this._colors().green : this._colors().red;
            this._createPopParticles(this.x, this.y, pulseColor);

            if (success) {
              this._dataCollected++;
              this._incrementStat("spiderNodesCrawled");
              this._logEvent('custom', {
                alert: '🕷️ Web Crawler feeding successful.',
                details: { node: this._getLogNodeRef(this.node) },
              });
            } else {
              this._logEvent('custom', {
                alert: '🕷️ Web Crawler feeding failed.',
                details: { node: this._getLogNodeRef(this.node) },
              });
            }

            let nextState = 'crawling';
            if (this.nodesVisited >= this.MAX_VISITS || this.node.state !== 'alive') {
              // Head home
              const rp = this._findPath(this.node, central);
              rp.shift();
              this.path       = rp;
              this.targetNode = this.path.shift() || central;
              this.progress   = 0;
              nextState       = 'returning';
              this._logEvent('custom', { message: '🕷️ Web Crawler returning to central node...' });
            } else {
              // Visit another node
              const tgt  = this._pickTarget();
              const full = this._findPath(this.node, tgt);
              full.shift();
              this.path       = full;
              this.targetNode = this.path.shift() || this.node;
              this.progress   = 0;
              nextState       = 'crawling';
            }

            // Occasional or forced nap before continuing
            const timeSinceSleep = now - (this.lastSleepAt || 0);
            const shouldNap = (!networkCompromised) && (
              Math.random() < this.SLEEP_BREAK_CHANCE ||
              timeSinceSleep > this.SLEEP_FORCE_INTERVAL
            );
            if (shouldNap) {
              this.stateAfterSleep = nextState;
              this.state = 'sleeping';
              this.sleepTimer = this.SLEEP_MIN_DURATION + Math.random() * (this.SLEEP_MAX_DURATION - this.SLEEP_MIN_DURATION);
              this.lastSleepAt = now;
              this._logEvent('custom', { message: '🕷️ Web Crawler sleeping...' });
            } else {
              this.state = nextState;
            }
          }
          break;
        }

        case 'sleeping': {
          this.x = this.node ? this.node.x : central.x;
          this.y = this.node ? this.node.y : central.y;
          this.sleepTimer -= dm;
          if (this.sleepTimer <= 0) {
            this.state = this.stateAfterSleep || 'crawling';
            this.lastSleepAt = now;
          }
          break;
        }

        case 'returning': {
          if (!this.targetNode) {
            // Rebuild a path home instead of teleporting
            if (this.node !== central) {
              const rp = this._findPath(this.node, central);
              rp.shift();
              this.path       = rp;
              this.targetNode = this.path.shift() || central;
              this.progress   = 0;
              if (this.targetNode === central) {
                this.node  = central;
                this.x     = central.x;
                this.y     = central.y;
                this.state = 'hiding';
              }
              break;
            }
            this.node  = central;
            this.x     = central.x;
            this.y     = central.y;
            this.state = 'hiding';
            break;
          }
          if (this._advanceAlongConnection(this.RETURN_SPEED_PX, dm, now)) {
            this.node     = this.targetNode;
            this.progress = 0;
            if (this.node === central) {
              this.targetNode = null;
            } else {
              this.targetNode = this.path.length ? this.path.shift() : central;
            }
          }
          break;
        }

        case 'hiding': {
          this.x = central.x;
          this.y = central.y;
          this._scaleAnim = Math.max(0, this._scaleAnim - dm / this.ANIM_DURATION);
          if (this._scaleAnim <= 0) {
            this.state     = 'hidden';
            this.hideTimer = this.HIDE_DURATION;
            this._logEvent('custom', { message: '🕷️ Web Crawler retreating inside central node to rest...' });
          }
          break;
        }
      }
    },

    // ── Draw (called every frame inside the camera transform) ─────
    /**
     * Draws the spider in LOCAL coordinate space (translate to position,
     * rotate to face travel direction). In local coords +X = forward:
     *  - Legs reach perpendicular (±Y) to grip the edge being crawled
     *  - Antennas emerge from the forehead (+X surface) visibly on top
     *  - Abdomen sits at the back (-X)
     * Body is drawn AFTER legs so it covers leg roots cleanly.
     * Antennas drawn AFTER body so they are visible above the head.
     */
    draw(ctx, now) {
      if (this.state === 'hidden') return;
      const sc = this._scaleAnim;
      if (sc <= 0.01) return;

      const R = 9 * sc;         // body radius
      const t = now * 0.006;    // animation clock for walking cycle

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this._dir);    // orient spider to face direction of travel

      // ── Legs: squiggly tentacle style (same formula as purple infection edge) ──
      // 4 legs arranged in two pairs perpendicular to the travel axis (+Y / -Y).
      // Each leg is drawn as segmented wiggly lines with a perpendicular sine wave,
      // tapering at the hip and adding a mid-point bend bias for the kinked spider shape.
      // Diagonal gait: (front-top + back-bottom) step together.
      const legDefs = [
        { lx:  R * 0.42, side: -1, ph: 0 },        // front, top
        { lx:  R * 0.42, side:  1, ph: Math.PI },   // front, bottom
        { lx: -R * 0.42, side: -1, ph: Math.PI },   // back,  top
        { lx: -R * 0.42, side:  1, ph: 0 },         // back,  bottom
      ];

      ctx.lineWidth = Math.max(1, 1.5 * sc);
      ctx.lineCap   = 'round';
      ctx.lineJoin  = 'round';

      const LEG_SEGS = 10; // segment count — higher = smoother squiggle
      for (const leg of legDefs) {
        const step = Math.sin(t + leg.ph) * 0.45; // forward/back stepping
        // Hip and foot positions in local space
        // Angle legs to flare like >0< (front legs angle forward, rear legs angle back)
        const hx = leg.lx;
        const hy = leg.side * R * 0.82;
        const angledPush = (leg.lx > 0 ? 1 : -1) * R * 0.35; // forward for front, backward for rear
        const fx = leg.lx + angledPush + step * R * 0.9;
        const fy = leg.side * (R * 1.6);

        // Leg vector and its perpendicular — wiggle is applied along the perp
        const legDx    = fx - hx;
        const legDy    = fy - hy;
        const legAngle = Math.atan2(legDy, legDx);
        const px       = -Math.sin(legAngle); // perpendicular X
        const py       =  Math.cos(legAngle); // perpendicular Y

        ctx.strokeStyle = `rgba(148, 60, 210, ${0.88 * sc})`;
        ctx.shadowColor = 'rgba(168, 85, 247, 0.55)';
        ctx.shadowBlur  = 4 * sc;
        ctx.beginPath();
        ctx.moveTo(hx, hy);

        for (let s = 1; s <= LEG_SEGS; s++) {
          const seg = s / LEG_SEGS;                           // 0→1 along leg
          const bx2 = hx + legDx * seg;                      // linear base X
          const by2 = hy + legDy * seg;                      // linear base Y

          // Bend bias: outward bow peaking at knee (~50% along leg)
          const bendBias  = Math.sin(seg * Math.PI) * R * 0.9 * leg.side;

          // Squiggle: same phase formula as the infection tentacle edge
          const wavePhase = now * 0.015 - seg * 7 + leg.ph;
          const taper     = Math.min(1, seg * 2.5);          // taper at hip root
          const amp       = 1.8 * taper * sc;

          ctx.lineTo(
            bx2 + px * (Math.sin(wavePhase) * amp),
            by2 + py * (Math.sin(wavePhase) * amp + bendBias)
          );
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── Body (covers leg roots) ───────────────────────────────────
      // Draw abdomen first so head sits on top. Abdomen is larger than the head
      // and tapers to a point facing the rear (-X).
      const headR      = R * 0.7;
      const headOffset = R * 0.12;
      const abdomenLen = R * 1.45;
      const abdomenW   = R * 1.05;

      // Teardrop abdomen (point toward negative X)
      const abdomenGrad = ctx.createRadialGradient(-R * 0.9, -R * 0.25, 0, -R * 0.6, 0, abdomenW * 1.1);
      abdomenGrad.addColorStop(0,    '#4A235A');
      abdomenGrad.addColorStop(0.55, '#2E0E3A');
      abdomenGrad.addColorStop(1,    '#1A0622');

      ctx.beginPath();
      ctx.moveTo(-R * 0.25, -abdomenW * 0.6);
      ctx.quadraticCurveTo(-abdomenLen * 0.35, -abdomenW * 0.95, -abdomenLen, 0);
      ctx.quadraticCurveTo(-abdomenLen * 0.35, abdomenW * 0.95, -R * 0.25, abdomenW * 0.6);
      ctx.closePath();
      ctx.fillStyle = abdomenGrad;
      ctx.fill();
      ctx.strokeStyle = `rgba(120, 60, 170, ${0.5 * sc})`;
      ctx.lineWidth   = 1.2 * sc;
      ctx.stroke();

      const isSleeping = this.state === 'sleeping';

      // Head (smaller than abdomen, sits slightly forward)
      const headGrad = ctx.createRadialGradient(headOffset - headR * 0.2, -headR * 0.2, 0, headOffset, 0, headR);
      headGrad.addColorStop(0,    '#9B59B6');
      headGrad.addColorStop(0.55, '#6C3483');
      headGrad.addColorStop(1,    '#3D1452');

      ctx.beginPath();
      ctx.arc(headOffset, 0, headR, 0, Math.PI * 2);
      ctx.fillStyle = headGrad;
      ctx.fill();
      ctx.strokeStyle = `rgba(180, 100, 230, ${0.55 * sc})`;
      ctx.lineWidth   = 1.4 * sc;
      ctx.stroke();

      // Eyes: revert to larger classic eyes; slitted when sleeping
      ctx.save();
      const ex = R * 0.26;   // forward offset from body center
      const eo = R * 0.30;   // up/down spread
      const er = R * 0.22;

      if (isSleeping) {
        ctx.strokeStyle = `rgba(200, 255, 220, ${0.9 * sc})`;
        ctx.lineWidth = Math.max(0.7, 1.2 * sc);
        // Draw horizontal slits
        ctx.beginPath();
        ctx.moveTo(ex - er * 0.8, -eo);
        ctx.lineTo(ex + er * 0.8, -eo);
        ctx.moveTo(ex - er * 0.8, eo);
        ctx.lineTo(ex + er * 0.8, eo);
        ctx.stroke();
      } else {
        // Open eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(ex, -eo, er, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex,  eo, er, 0, Math.PI * 2); ctx.fill();

        // Pupils — shifted forward for alert gaze
        ctx.fillStyle = '#1A0A2E';
        const pr = er * 0.55;
        ctx.beginPath(); ctx.arc(ex + 0.9, -eo, pr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + 0.9,  eo, pr, 0, Math.PI * 2); ctx.fill();

        // Eye shine
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const sr = pr * 0.4;
        ctx.beginPath(); ctx.arc(ex + 0.35, -eo - 0.8, sr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + 0.35,  eo - 0.8, sr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // ── Sleeping Z stream (small rising Zs drifting upward) ─────────
      if (isSleeping) {
        ctx.save();
        // Cancel body rotation so Zs rise straight UP on the screen (negative world Y)
        ctx.rotate(-this._dir);
        // Translate slightly up from the center
        ctx.translate(0, -R * 0.8);

        ctx.globalCompositeOperation = 'lighter';
        const zCount = 4;
        for (let i = 0; i < zCount; i++) {
          const prog = ((now * 0.0006) + i * 0.25) % 1; 

          // Swell: start small, grow larger as they rise
          const scaleUp = 0.4 + 1.8 * prog; 

          // Alpha: quick fade in, soft fade out
          let alpha = 0;
          if (prog < 0.2) alpha = prog / 0.2;
          else alpha = 1 - Math.pow((prog - 0.2) / 0.8, 1.2);
          alpha *= 0.85; // max alpha

          ctx.globalAlpha = alpha * sc;
          const fontPx = Math.max(10, R * 1.5 * scaleUp * sc);
          ctx.font = `bold ${fontPx}px monospace`;
          ctx.fillStyle = `rgba(240, 248, 255, ${alpha})`;
          ctx.shadowColor = `rgba(200, 225, 255, ${alpha})`;
          ctx.shadowBlur = 8 * sc;

          // Rise straight up (negative Y)
          const rise = -prog * R * 12 * sc; 
          // Gentle side-to-side sway (X axis)
          const sway = Math.sin(now * 0.0015 + i * 2.0) * R * 2.0 * sc; 

          ctx.fillText('Z', sway, rise);
        }
        ctx.restore();
      }

      // ── Antennas (AFTER body — drawn visibly on top of the head) ──
      // Emerge from the forehead (+X surface), curve forward and flare ±Y.
      const antPulse = 0.55 + 0.45 * Math.sin(now * 0.004);
      const antDefs  = [
        { hy: -R * 0.36, tipX: R * 2.0, tipY: -R * 1.55 }, // upper antenna
        { hy:  R * 0.36, tipX: R * 2.0, tipY:  R * 1.55 }, // lower antenna
      ];

      ctx.lineWidth = Math.max(0.8, 1.1 * sc);
      for (const ant of antDefs) {
        const ax1 = R * 0.78,  ay1 = ant.hy;   // base on body surface
        const ax2 = ant.tipX,  ay2 = ant.tipY; // glowing tip
        // Control point: curves forward then fans out
        const cpx = ax1 + R * 0.85;
        const cpy = ay1 + (ay2 - ay1) * 0.25;

        ctx.strokeStyle = `rgba(120, 220, 120, ${antPulse * sc})`;
        ctx.shadowBlur  = 6 * sc;
        ctx.shadowColor = `rgba(120, 220, 120, ${0.4 * sc})`;
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        ctx.quadraticCurveTo(cpx, cpy, ax2, ay2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Glowing tip dot with neon halo
        ctx.fillStyle   = `rgba(100, 255, 120, ${antPulse * sc})`;
        ctx.shadowColor = 'rgba(100, 255, 100, 0.9)';
        ctx.shadowBlur  = 6 * sc;
        ctx.beginPath();
        ctx.arc(ax2, ay2, 1.8 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Feeding ring ──────────────────────────────────────────────
      if (this.state === 'feeding') {
        const fp    = 1 - (this.feedTimer / this.FEED_DURATION); // 0→1
        const ringR = R + 8 + fp * 12;
        const ringA = Math.sin(fp * Math.PI) * 0.6 * sc;
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -(now * 0.04 % 9);
        ctx.strokeStyle = `rgba(100, 255, 200, ${ringA})`;
        ctx.lineWidth   = 1.2 * sc;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // DATA label — un-rotate so text stays upright regardless of body angle
        if (fp > 0.3 && fp < 0.85) {
          const labelA = (fp < 0.6 ? (fp - 0.3) / 0.3 : (0.85 - fp) / 0.25) * 0.8 * sc;
          ctx.save();
          ctx.rotate(-this._dir); // cancel body rotation
          ctx.fillStyle    = `rgba(100, 255, 200, ${labelA})`;
          ctx.font         = `bold ${Math.round(7 * sc)}px monospace`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('DATA', 0, -(R + 10 * sc));
          ctx.restore();
        }
      }

      ctx.restore(); // pops translate + rotate
    },
  };
  // ─── End Web Crawler ───────────────────────────────────────────────────

  window.NodeNet.WebCrawlerSystem = WebCrawler;
})();
