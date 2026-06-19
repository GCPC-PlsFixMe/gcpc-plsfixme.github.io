/**
 * @module ReactionsSystem
 * @summary REACTIONS — floating emoticons and short phrases that pop above nodes in response to events.
 * @description Subscribes to the global event stream (EventLoggingSystem.subscribe) and spawns
 *   short-lived "reaction bubbles" anchored to the node involved in each event. Each bubble shows
 *   a category-appropriate emoji plus an occasional one-liner, then drifts upward and fades. Rendered
 *   on the main canvas in world space (inside the camera transform) so reactions track their node
 *   under pan/zoom. Per-node cooldowns and a global cap keep the screen readable.
 * @exports window.NodeNet.ReactionsSystem
 * @tags reactions, emoticons, speech, floating-text, ux, canvas, events
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    config: {},
  };

  // ── Tunables ────────────────────────────────────────────────────────────
  const SETTINGS = {
    maxActive: 22, // hard cap on simultaneous bubbles
    nodeCooldownMs: 1400, // min gap between reactions for the same node
    life: 2.6, // seconds a bubble lives
    riseSpeed: 26, // world px/sec the bubble drifts upward
    phraseChance: 0.55, // probability a bubble shows a phrase (else emoji only)
    emojiSize: 20, // base emoji font px (world units)
    phraseSize: 11, // phrase font px (world units)
  };

  let enabled = true;
  const active = []; // active reaction bubbles
  const lastReactionAt = new WeakMap(); // node -> timestamp (cooldown)

  /**
   * Reaction categories: each maps to a pool of emojis and phrases. The event
   * map below routes event keys to one of these categories.
   */
  const CATEGORIES = {
    attack: {
      color: "#fca5a5",
      emojis: ["😱", "😵", "🦠", "⚠️", "😨"],
      phrases: ["I'm hit!", "Not again!", "Owned...", "Breach!", "Help!"],
    },
    infected: {
      color: "#c084fc",
      emojis: ["🤢", "🦠", "😈", "💀", "😵‍💫"],
      phrases: ["Infected!", "It burns!", "Patient zero...", "So itchy.", "Aaargh!"],
    },
    botnet: {
      color: "#f472b6",
      emojis: ["🤖", "😈", "🧟", "👾"],
      phrases: ["Join us.", "We are legion.", "Resistance is futile.", "One of us."],
    },
    commandControl: {
      color: "#ef4444",
      emojis: ["☠️", "👑", "🕷️", "😈"],
      phrases: ["I'm in charge now.", "Obey.", "All your nodes...", "Mwahaha!"],
    },
    defense: {
      color: "#93c5fd",
      emojis: ["🛡️", "😎", "💪", "🚫", "✋"],
      phrases: ["Blocked!", "Nice try.", "Not today!", "Denied.", "Too slow."],
    },
    recovery: {
      color: "#6ee7b7",
      emojis: ["😌", "✨", "😇", "🙌", "💚"],
      phrases: ["Phew!", "All better.", "Back online!", "Good as new.", "We made it."],
    },
    down: {
      color: "#f87171",
      emojis: ["💀", "😴", "🥴", "📴", "💤"],
      phrases: ["I'm down...", "Lights out.", "Goodbye world.", "Rebooting...", "x_x"],
    },
    sprout: {
      color: "#86efac",
      emojis: ["🌱", "👶", "🐣", "✨"],
      phrases: ["Hello world!", "I'm new here.", "Just sprouted!", "Online!"],
    },
    guardian: {
      color: "#7dd3fc",
      emojis: ["🦸", "🛡️", "🌟", "😤"],
      phrases: ["Suit up.", "I've got this.", "On guard!", "Protect & serve."],
    },
    honeypot: {
      color: "#fcd34d",
      emojis: ["🍯", "🪤", "😏", "🎣"],
      phrases: ["Gotcha!", "Sweet, right?", "Step closer...", "Trapped!"],
    },
    satellite: {
      color: "#67e8f9",
      emojis: ["📡", "🛰️", "📶", "🚀"],
      phrases: ["Uplink live.", "Reaching orbit!", "Signal locked.", "Beep boop."],
    },
    ddos: {
      color: "#fb923c",
      emojis: ["🌊", "😰", "📉", "🔥"],
      phrases: ["Too much traffic!", "Drowning!", "Flooded!", "Make it stop!"],
    },
    datacenter: {
      color: "#7dd3fc",
      emojis: ["🏢", "💼", "🤝", "⚡"],
      phrases: ["Open for business.", "Enterprise ready.", "Scaling up.", "We're hiring."],
    },
    info: {
      color: "#cbd5e1",
      emojis: ["💬", "🔔", "ℹ️"],
      phrases: ["Hmm.", "Noted.", "Interesting."],
    },
  };

  /**
   * Event-key → reaction routing.
   *  - cat: category name (see CATEGORIES)
   *  - on:  ordered list of context keys to locate the subject node
   * Only events listed here produce reactions, keeping output meaningful.
   */
  const EVENT_MAP = {
    // attacks / infections
    nodeInfected: { cat: "infected", on: ["node"] },
    statusMalware: { cat: "infected", on: ["node"] },
    statusBotnet: { cat: "botnet", on: ["node"] },
    statusCommandControl: { cat: "commandControl", on: ["node"] },
    commandControlDetected: { cat: "commandControl", on: ["node"] },
    phishingSuccess: { cat: "attack", on: ["target"] },
    pingOfDeathHit: { cat: "attack", on: ["target"] },
    pingOfDeathSent: { cat: "commandControl", on: ["ccNode"] },
    commandControlAggressiveAttack: { cat: "commandControl", on: ["ccNode"] },
    centralCompromised: { cat: "attack", on: ["node"] },
    centralUnderAttack: { cat: "attack", on: ["node"] },
    // defense
    nodeDefended: { cat: "defense", on: ["node"] },
    phishingBlocked: { cat: "defense", on: ["node", "defender"] },
    phishingDefended: { cat: "defense", on: ["node"] },
    firewallBlockedPing: { cat: "defense", on: ["firewallNode"] },
    recoveryShieldActivated: { cat: "defense", on: ["node"] },
    counterStrikeHit: { cat: "defense", on: ["guardian"] },
    honeypotDefended: { cat: "honeypot", on: ["node"] },
    // recovery / healing
    statusRecovered: { cat: "recovery", on: ["node"] },
    immunityHealingCompleted: { cat: "recovery", on: ["node"] },
    dispatchSuccessful: { cat: "recovery", on: ["target"] },
    centralSelfHealingCompleted: { cat: "recovery", on: ["node"] },
    statusBlue: { cat: "recovery", on: ["node"] },
    // down
    statusDown: { cat: "down", on: ["node"] },
    // growth / promotions
    branchSprouted: { cat: "sprout", on: ["child"] },
    guardianPromotionDispatch: { cat: "guardian", on: ["node"] },
    guardianPromotionPingRecovery: { cat: "guardian", on: ["node"] },
    guardianPromotionPhishing: { cat: "guardian", on: ["node"] },
    honeypotCreated: { cat: "honeypot", on: ["node"] },
    honeypotConversion: { cat: "honeypot", on: ["honeypot"] },
    datacenterFormed: { cat: "datacenter", on: ["node"] },
    groundStationEstablished: { cat: "satellite", on: ["node"] },
    satelliteOrbiting: { cat: "satellite", on: ["satellite"] },
    satelliteLaunching: { cat: "satellite", on: ["groundStation"] },
    // ddos
    ddosLaunched: { cat: "ddos", on: ["targetBranch"] },
    ddosCharging: { cat: "ddos", on: ["targetBranch"] },
  };

  /** Pick a random element from an array. */
  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  /** Resolve the subject node for an event from its context. */
  function resolveNode(mapping, context) {
    if (!context) return null;
    for (const key of mapping.on) {
      const candidate = context[key];
      if (candidate && typeof candidate === "object" && candidate.state) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Spawn a reaction bubble for a node.
   * @param {object} node subject node
   * @param {string} categoryName key into CATEGORIES
   */
  function spawnReaction(node, categoryName) {
    if (!enabled || !node || node.state !== "alive") return;
    const category = CATEGORIES[categoryName];
    if (!category) return;

    const now = Date.now();
    const last = lastReactionAt.get(node) || 0;
    if (now - last < SETTINGS.nodeCooldownMs) return;
    lastReactionAt.set(node, now);

    // Enforce global cap by retiring the oldest bubble.
    if (active.length >= SETTINGS.maxActive) active.shift();

    const showPhrase = Math.random() < SETTINGS.phraseChance;
    active.push({
      node,
      emoji: pick(category.emojis),
      phrase: showPhrase ? pick(category.phrases) : null,
      color: category.color,
      age: 0,
      life: SETTINGS.life,
      // small horizontal jitter so stacked reactions don't perfectly overlap
      offsetX: (Math.random() - 0.5) * 18,
      rise: 0,
    });
  }

  /** Event subscriber entrypoint (wired via EventLoggingSystem.subscribe). */
  function handleEvent(key, context) {
    if (!enabled) return;
    const mapping = EVENT_MAP[key];
    if (!mapping) return;
    const node = resolveNode(mapping, context);
    if (node) spawnReaction(node, mapping.cat);
  }

  /** Advance bubble lifetimes and motion. */
  function update(deltaSeconds) {
    if (!deltaSeconds) deltaSeconds = 0.016;
    for (let i = active.length - 1; i >= 0; i--) {
      const b = active[i];
      b.age += deltaSeconds;
      b.rise += SETTINGS.riseSpeed * deltaSeconds;
      // Drop dead bubbles or those whose node disappeared.
      if (b.age >= b.life || !b.node || b.node.state !== "alive") {
        active.splice(i, 1);
      }
    }
  }

  /**
   * Render all active bubbles. Must be called inside the world-space camera
   * transform (after nodes are drawn) so bubbles track their node.
   * @param {CanvasRenderingContext2D} ctx
   */
  function draw(ctx) {
    if (!enabled || active.length === 0 || !ctx) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const b of active) {
      const node = b.node;
      if (!node) continue;

      // Ease-out fade: full for first 70% of life, fade the last 30%.
      const t = b.age / b.life;
      const opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
      // Subtle pop-in scale at birth.
      const popIn = Math.min(1, b.age / 0.18);
      const scale = 0.6 + 0.4 * popIn;

      const baseX = node.x + b.offsetX;
      const baseY = node.y - (node.radius || 8) - 14 - b.rise;
      const nodeOpacity = node.opacity != null ? node.opacity : 1;
      const alpha = opacity * nodeOpacity;
      if (alpha <= 0.02) continue;

      // Phrase pill (drawn first, beneath the emoji).
      if (b.phrase) {
        ctx.font = `600 ${SETTINGS.phraseSize * scale}px "Inter", sans-serif`;
        const padX = 7 * scale;
        const textW = ctx.measureText(b.phrase).width;
        const pillW = textW + padX * 2;
        const pillH = (SETTINGS.phraseSize + 7) * scale;
        const pillY = baseY + SETTINGS.emojiSize * scale * 0.62;

        roundRect(ctx, baseX - pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2);
        ctx.fillStyle = `rgba(10, 14, 22, ${0.78 * alpha})`;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba(b.color, 0.55 * alpha);
        ctx.stroke();

        ctx.fillStyle = hexToRgba(b.color, alpha);
        ctx.fillText(b.phrase, baseX, pillY + 0.5);
      }

      // Emoji glyph.
      ctx.font = `${SETTINGS.emojiSize * scale}px "Inter", "Segoe UI Emoji", sans-serif`;
      ctx.globalAlpha = alpha;
      ctx.fillText(b.emoji, baseX, baseY);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /** Rounded-rect path helper (canvas2d lacks one in older engines). */
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /** Convert "#rrggbb" + alpha to an rgba() string. */
  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const ReactionsSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },
    handleEvent,
    spawnReaction,
    update,
    draw,
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) active.length = 0;
    },
    isEnabled() {
      return enabled;
    },
    clear() {
      active.length = 0;
    },
  };

  window.NodeNet.ReactionsSystem = ReactionsSystem;
})();
