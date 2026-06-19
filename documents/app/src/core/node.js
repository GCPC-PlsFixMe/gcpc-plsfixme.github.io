/**
 * @module Node
 * @summary The Node class — the core simulation entity (drawing, physics, state machine, lifecycle).
 * @description Public API: the `Node` constructor (on window.NodeNet) and
 *   `NodeClass.configure(deps)` for injecting runtime dependencies. Per-type
 *   drawing is delegated to NodeBehaviorRegistry.
 * @exports window.NodeNet.Node, window.NodeNet.NodeClass
 * @tags node, entity, draw, physics, state-machine, lifecycle, status, health, core
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── injected dependencies (stable references) ─────────────────────── */
  let _ctx = null;
  let _canvas = null;
  let _colors = null;
  let _CONFIG = null;
  let _padding = 0;
  let _healSpeedMultiplier = 1.0;

  /* ── injected getters (mutable state) ────────────────────────────── */
  let _getNodes = () => [];
  let _getEdges = () => [];
  let _getPulses = () => [];
  let _getDraggedNode = () => null;

  /* ── injected systems / functions ──────────────────────────────────── */
  let _HealingSystem = null;
  let _SatelliteSystem = null;
  let _ParticleSystem = null;
  let _NodeBehaviorRegistry = null;
  let _PhysicsSystem = null;

  let _countDescendants = () => 0;
  let _promoteToGuardian = () => {};
  let _logEvent = () => {};
  let _getLogNodeRef = () => "";
  let _getNodeDefenseBonus = () => 0;
  let _incrementStat = () => {};
  let _spawnCentralImmunityPackets = () => {};
  let _getCentralImpactShakeOffsetX = () => 0;
  let _getCentralImpactShakeOffsetY = () => 0;

  function configure(deps) {
    if (deps.ctx !== undefined) _ctx = deps.ctx;
    if (deps.canvas !== undefined) _canvas = deps.canvas;
    if (deps.colors !== undefined) _colors = deps.colors;
    if (deps.CONFIG !== undefined) _CONFIG = deps.CONFIG;
    if (deps.padding !== undefined) _padding = deps.padding;
    if (deps.healSpeedMultiplier !== undefined) _healSpeedMultiplier = deps.healSpeedMultiplier;
    if (deps.getNodes !== undefined) _getNodes = deps.getNodes;
    if (deps.getEdges !== undefined) _getEdges = deps.getEdges;
    if (deps.getPulses !== undefined) _getPulses = deps.getPulses;
    if (deps.getDraggedNode !== undefined) _getDraggedNode = deps.getDraggedNode;
    if (deps.HealingSystem !== undefined) _HealingSystem = deps.HealingSystem;
    if (deps.SatelliteSystem !== undefined) _SatelliteSystem = deps.SatelliteSystem;
    if (deps.ParticleSystem !== undefined) _ParticleSystem = deps.ParticleSystem;
    if (deps.NodeBehaviorRegistry !== undefined) _NodeBehaviorRegistry = deps.NodeBehaviorRegistry;
    if (deps.PhysicsSystem !== undefined) _PhysicsSystem = deps.PhysicsSystem;
    if (deps.countDescendants !== undefined) _countDescendants = deps.countDescendants;
    if (deps.promoteToGuardian !== undefined) _promoteToGuardian = deps.promoteToGuardian;
    if (deps.logEvent !== undefined) _logEvent = deps.logEvent;
    if (deps.getLogNodeRef !== undefined) _getLogNodeRef = deps.getLogNodeRef;
    if (deps.getNodeDefenseBonus !== undefined) _getNodeDefenseBonus = deps.getNodeDefenseBonus;
    if (deps.incrementStat !== undefined) _incrementStat = deps.incrementStat;
    if (deps.spawnCentralImmunityPackets !== undefined) _spawnCentralImmunityPackets = deps.spawnCentralImmunityPackets;
    if (deps.getCentralImpactShakeOffsetX !== undefined) _getCentralImpactShakeOffsetX = deps.getCentralImpactShakeOffsetX;
    if (deps.getCentralImpactShakeOffsetY !== undefined) _getCentralImpactShakeOffsetY = deps.getCentralImpactShakeOffsetY;
  }

  /** Lighten a 0–255 colour channel toward white by t (0..1). */
  function _lighten(c, t) {
    return Math.round(c + (255 - c) * t);
  }

  /**
   * Build a soft spherical radial-gradient fill for a node body so it reads as a
   * glowing 3D orb (highlight toward the upper-left, darker rim) — a more organic,
   * lifelike look than a flat disc. Falls back to the flat colour string at high
   * node counts to keep per-frame gradient allocation cheap.
   * @param {Node} node
   * @param {string} flatRgba precomputed flat colour for fallback
   * @returns {CanvasGradient|string}
   */
  function _nodeBodyFill(node, flatRgba) {
    if (_getNodes().length > 200) return flatRgba;
    const c = node.currentColor;
    const r = Math.max(1, node.radius);
    const o = node.opacity;
    // Highlight offset gives the orb a consistent light source.
    const hx = node.x - r * 0.32;
    const hy = node.y - r * 0.32;
    const grad = _ctx.createRadialGradient(hx, hy, r * 0.08, node.x, node.y, r * 1.06);
    grad.addColorStop(0, `rgba(${_lighten(c.r, 0.55)}, ${_lighten(c.g, 0.55)}, ${_lighten(c.b, 0.55)}, ${o})`);
    grad.addColorStop(0.55, `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${o})`);
    grad.addColorStop(1, `rgba(${Math.round(c.r * 0.74)}, ${Math.round(c.g * 0.74)}, ${Math.round(c.b * 0.74)}, ${o})`);
    return grad;
  }

class Node {
  constructor(id, x, y, parent = null) {
    // MAC-like address identity. node.id is used as a Set/Map key across many
    // systems, so it must be unique. A fresh MAC is generated unless a MAC-style
    // string is supplied (e.g. when restoring a saved state via deserialization).
    const _identity = window.NodeNet && window.NodeNet.NodeIdentity;
    const _isMacString = typeof id === "string" && id.indexOf(":") !== -1;
    if (_isMacString) {
      this.id = id;
      if (_identity) _identity.register(id);
    } else {
      this.id = _identity ? _identity.generateMac() : id;
    }
    // Randomized dictionary-based friendly name for easy identification.
    // Deserialization overwrites this with the saved name after construction.
    this.friendlyName = _identity ? _identity.generateFriendlyName() : String(this.id);
    this.x = parent ? parent.x : x;
    this.y = parent ? parent.y : y;
    this.baseX = x;
    this.baseY = y;
    this.baseRadius = Math.random() * 8 + 7;
    this.radius = 0;
    this.targetRadius = this.baseRadius;
    this.status = "green";
    this.parent = parent;
    this.children = [];
    this.fx = 0;
    this.fy = 0;
    this.time = Math.random() * 100;
    this.createdAt = Date.now();
    this.settlingUntil = 0; // Timestamp for post-spawn settling period
    this.isPositionLocked = false; // Lock position during settling to prevent bounce
    this.forceMultiplier = 0; // Gradually ramp up physics forces after unlock
    this.currentColor = { ..._colors.green };
    this.state = "spawning";
    this.opacity = 0;
    this.spawnProgress = 0;
    this.infectedAt = null;
    this.dispatchDelay = 0;
    this.isTargeted = false;
    this.remediationState = "none";
    this.remediationStart = 0;
    this.spinnerAngle = 0;
    this.pulseEffect = 0;
    this.isHealing = false; // Flag to indicate a node is being healed
    this.statusChangedAt = 0; // Timestamp for status changes
    this.spreadingInfections = []; // Array of objects: { target, startTime }
    this.isBeingInfected = false;
    this.isDefending = false;
    this.defenseStartTime = 0;
    this.isSelfHealing = false;
    this.selfHealingStartTime = 0;
    this.heartbeatRate = 0.025; // Base heartbeat speed
    this.heartbeatIntensity = 0.4; // How much the node _getPulses()
    this.breathingPhase = Math.random() * Math.PI * 2; // Random starting phase for organic feel
    this.spreadDelay = 0; // Delay before an infected node tries to spread
    this.canSpread = true; // Whether this node will attempt to spread (90% yes, 10% no)
    this.pendingDispatchPromotionCheck = false; // Flag to evaluate guardian promotion after remediation

    // Immunity system properties
    this.attachedImmunityPackets = []; // Array of immunity packets attached to this node
    this.immunityHealingStartTime = 0; // When immunity healing started
    this.isImmunityHealing = false; // Whether this node is being healed by immunity packets

    // Guardian properties
    this.isGuardian = false; // Threat-hunter designation
    this.isDatacenter = false; // Healthy infrastructure aggregation role
    this.datacenterFormedAt = 0;
    this.lastDatacenterFortifyAt = 0;
    this.guardianImmunityLastSpawn = 0; // Cooldown tracker for immunity streams
    this.guardianStreamCount = 0; // Counts emitted immunity packets for cadence control
    this.guardianDispatchLastSent = 0; // Tracks last guardian dispatch packet timing
    this.guardianVpnTunnels = []; // Active guardian VPN tunnels
    this.lastGuardianBridgeUpdate = 0; // Timestamp for VPN tunnel refresh cadence
    this.lastGuardianFirewallAttempt = 0; // Tracks last attempt to configure a firewall
    this.selfHealingDispatchAllowance = 0; // Extra dispatches allowed during self-healing
    this.selfHealingPacketsCreated = 0; // Tracks packets spawned during central self-healing
    this.selfHealingPacketCap = 0; // Maximum packets allowed per self-heal
    this.botDefenseBurstCounts = {}; // Track bot defense bursts per branch
    this.isGroundStation = false; // Tower _getNodes() anchoring sparse branches
    this.groundStationEstablishedAt = 0; // Timestamp when promoted to ground station
    this.satelliteChain = [];
    this.satelliteEdges = [];

    // Satellite node properties
    this.isSatellite = false;
    this.satelliteHost = null;
    this.isTethered = false;
    this.isDrifting = false;
    this.driftVelocityX = 0;
    this.driftVelocityY = 0;
    this.lastSatelliteChainCheck = 0;

    // Shield properties
    this.hasFirewall = Math.random() < 0.25; // 25% of _getNodes() have firewall capability (increased from 10%)
    this.shieldActive = false; // Whether shield is currently visible
    this.shieldOpacity = 0; // Current shield opacity (0-1)
    this.shieldStrength = 1.0; // Shield strength (0-1), affects size and opacity
    this.shieldFlashTimer = Math.random() * 10000; // Time until next shield flash
    this.shieldCracking = false; // Whether shield is cracking/shattering
    this.shieldCrackProgress = 0; // Progress of cracking animation (0-1)
    this.shieldFragments = []; // Fragments for shatter animation (legacy, kept for compat)
    this.forcefieldImpacts = []; // Active impact ripples on the forcefield surface

    // Recovery shield (central node only)
    this.hasRecoveryShield = false; // Blue immunity shield after recovering from infection
    this.recoveryShieldStartTime = 0; // When the recovery shield was activated
    this.recoveryShieldDuration = 15000; // 15 seconds of protection

    // Command & Control (C&C) node properties
    this.isCommandControl = false; // Whether this is a C&C node
    this.ccRotation = 0; // Rotation angle for C&C visual effects
    this.activePingOfDeath = null; // Track active ping of death packet (one at a time)
    this.lastPingTime = 0; // Cooldown for ping of death
    // Bot Defense Mode state (central node only)
    this.botDefenseModeActive = false;
    this.botDefenseModeStart = 0;
    this.botDefenseCooldownUntil = 0;
    this.botDefenseTargets = []; // direct infected child branches
    this.botDefenseLastBurst = 0;

    // DDOS Attack state (C&C _getNodes() only)
    this.ddosState = "idle"; // 'idle', 'charging', 'active'
    this.ddosChargeStart = 0;
    this.ddosActiveStart = 0;
    this.ddosTargetBranch = null; // The main branch node being attacked
    this.ddosBotnets = []; // Botnet _getNodes() participating in the attack
    this.ddosCooldownUntil = 0;

    // Honeypot properties - traps that convert attackers to guardians
    this.isHoneypot = false;
    this.honeypotConversions = 0; // How many attackers have been converted (max 2)
    this.honeypotCreatedAt = 0; // Timestamp when node became a honeypot
    this.honeyPhase = Math.random() * Math.PI * 2; // Phase offset for honey animation

    // DDOS victim state (branch _getNodes() under attack)
    this.isUnderDDOS = false;
    this.ddosAttacker = null; // The C&C node coordinating the attack

    // Settling phase for organic physics (new _getNodes() settle in gradually)
    this.settlingPhase = 2000; // 2 seconds to "settle in"
    this.physicsMultiplier = 0.3; // Start with 30% physics influence
    this.currentDamping = 0.5; // Start with high damping (less bounce)
  }

  draw() {
    if (this.opacity <= 0 && this.state !== "spawning") return;

    const mainColorRgba = `rgba(${Math.round(
      this.currentColor.r
    )}, ${Math.round(this.currentColor.g)}, ${Math.round(
      this.currentColor.b
    )}, ${this.opacity})`;

    // Performance: Disable shadows at high node counts
    const enableShadows = _getNodes().length <= 150;

    if (this.parent === null && !this.isSatellite) {
      // Central node drawing (not for free-floating satellites)
      _ctx.save();
      _ctx.translate(_getCentralImpactShakeOffsetX(), _getCentralImpactShakeOffsetY());
      _ctx.beginPath();
      _ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

      // Use yellow color when in self-healing mode
      if (this.isSelfHealing) {
        const yellowColor = { r: 251, g: 191, b: 36 }; // amber-400
        const yellowRgba = `rgba(${yellowColor.r}, ${yellowColor.g}, ${yellowColor.b}, ${this.opacity})`;
        _ctx.fillStyle = yellowRgba;
        if (enableShadows) {
          _ctx.shadowColor = `rgba(${yellowColor.r}, ${yellowColor.g}, ${yellowColor.b}, 0.7)`;
          _ctx.shadowBlur = 30;
        }
      } else {
        _ctx.fillStyle = _nodeBodyFill(this, mainColorRgba);
        if (enableShadows) {
          _ctx.shadowColor = `rgba(${Math.round(
            this.currentColor.r
          )}, ${Math.round(this.currentColor.g)}, ${Math.round(
            this.currentColor.b
          )}, 0.7)`;
          _ctx.shadowBlur = 30;
        }
      }

      _ctx.fill();
      _ctx.shadowBlur = 0;

      // Dispatch icon and effects through the behavior registry
      const behavior = _NodeBehaviorRegistry?.getBehavior(this);
      if (behavior) {
        behavior.drawIcon(this);
        behavior.drawEffects(this);
      }

      // Generic state overlays for central node
      if (this.remediationState === "spinning") {
        _ctx.save();
        _ctx.rotate(this.spinnerAngle);
        _ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.9})`;
        _ctx.lineWidth = Math.max(1.5, this.radius * 0.2);
        _ctx.beginPath();
        _ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 1.5);
        _ctx.stroke();
        _ctx.restore();
      }
      if (this.isBeingInfected) {
        _ctx.save();
        _ctx.rotate(-this.spinnerAngle);
        _ctx.strokeStyle = `rgba(${_colors.malware.r}, ${_colors.malware.g}, ${_colors.malware.b}, ${this.opacity * 0.9})`;
        _ctx.lineWidth = Math.max(1.5, this.radius * 0.2);
        _ctx.beginPath();
        _ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 0.8);
        _ctx.stroke();
        _ctx.beginPath();
        _ctx.arc(0, 0, this.radius + 5, Math.PI, Math.PI * 1.8);
        _ctx.stroke();
        _ctx.restore();
      }

      // Draw shields for central node
      if (this.shieldCracking) {
        this.drawCrackingShield();
      } else if (this.shieldActive && this.shieldOpacity > 0) {
        this.drawShield();
      }

      _ctx.restore();
      return;
    }

    // Performance: Skip pulse effect at high node counts (barely visible in crowds)
    if (_getNodes().length <= 200) {
      const pulseRadius =
        this.radius * (1.8 + Math.sin(this.time * 0.1) * 0.4);
      const pulseAlpha =
        0.2 * (1 - (pulseRadius / (this.radius * 2.2) - 0.5));
      const pulseColorRgba = `rgba(${Math.round(
        this.currentColor.r
      )}, ${Math.round(this.currentColor.g)}, ${Math.round(
        this.currentColor.b
      )}, ${pulseAlpha * this.opacity})`;

      _ctx.beginPath();
      _ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
      _ctx.fillStyle = pulseColorRgba;
      _ctx.fill();
    }

    _ctx.beginPath();
    _ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    _ctx.fillStyle = _nodeBodyFill(this, mainColorRgba);

    if (enableShadows) {
      if (
        this.status === "red" ||
        this.status === "malware" ||
        this.status === "botnet" ||
        this.status === "commandControl"
      ) {
        const flashBlur = 15 + Math.sin(this.time * 0.3) * 10;
        let flashColor = this.currentColor;
        if (this.status === "malware" || this.status === "botnet") {
          flashColor = this.isGroundStation ? _colors.malware : _colors.red;
        }
        if (this.status === "commandControl")
          flashColor = _colors.commandControl;
        _ctx.shadowColor = `rgba(${flashColor.r}, ${flashColor.g}, ${flashColor.b}, ${this.opacity})`;
        _ctx.shadowBlur = Math.max(0, flashBlur);
      } else {
        _ctx.shadowColor = mainColorRgba;
        _ctx.shadowBlur = 15;
      }
    }

    _ctx.fill();
    _ctx.shadowBlur = 0;

    // Performance: Skip icon drawing at high node counts, except for important _getNodes()
    const drawIcons =
      _getNodes().length <= 200 ||
      this.isGuardian ||
      this.isGroundStation ||
      this.isSatellite ||
      this.isHoneypot ||
      this.status === "commandControl";

    // Dispatch icon and effect drawing through the behavior registry
    const behavior = _NodeBehaviorRegistry?.getBehavior(this);
    if (behavior) {
      if (drawIcons || this.parent === null) {
        behavior.drawIcon(this);
      }
      behavior.drawEffects(this);
    }

    // Generic state overlays (apply across all node types)
    if (this.remediationState === "spinning") {
      _ctx.save();
      _ctx.translate(this.x, this.y);
      _ctx.rotate(this.spinnerAngle);
      _ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.9})`;
      _ctx.lineWidth = Math.max(1.5, this.radius * 0.2);
      _ctx.beginPath();
      _ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 1.5);
      _ctx.stroke();
      _ctx.restore();
    }
    if (this.isBeingInfected) {
      _ctx.save();
      _ctx.translate(this.x, this.y);
      _ctx.rotate(-this.spinnerAngle);
      _ctx.strokeStyle = `rgba(${_colors.malware.r}, ${_colors.malware.g}, ${_colors.malware.b}, ${this.opacity * 0.9})`;
      _ctx.lineWidth = Math.max(1.5, this.radius * 0.2);
      _ctx.beginPath();
      _ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 0.8);
      _ctx.stroke();
      _ctx.beginPath();
      _ctx.arc(0, 0, this.radius + 5, Math.PI, Math.PI * 1.8);
      _ctx.stroke();
      _ctx.restore();
    }

    // Draw shields
    if (this.shieldCracking) {
      this.drawCrackingShield();
    } else if (this.shieldActive && this.shieldOpacity > 0) {
      this.drawShield();
    }

    // Draw defense pulse for regular _getNodes()
    if (this.isDefending) {
      const defenseDuration = 1000;
      const elapsed = Date.now() - this.defenseStartTime;
      if (elapsed < defenseDuration) {
        const progress = elapsed / defenseDuration;
        const pulseRadius = this.radius * (1 + progress * 2);
        const pulseOpacity = 1 - progress;
        _ctx.beginPath();
        _ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
        _ctx.strokeStyle = `rgba(${_colors.red.r}, ${_colors.red.g}, ${_colors.red.b}, ${pulseOpacity})`;
        _ctx.lineWidth = 4 * (1 - progress);
        _ctx.stroke();
      } else {
        this.isDefending = false;
      }
    }


  }



  drawShield() {
    if (this.shieldOpacity <= 0 && !this.shieldCracking) return;

    _ctx.save();
    _ctx.translate(this.x, this.y);

    const isRecoveryShield = this.parent === null && this.hasRecoveryShield;
    let shieldRadius = this.radius * (1.2 + this.shieldStrength * 0.1);
    let shieldOpacity = this.shieldOpacity * this.shieldStrength * this.opacity;
    if (isRecoveryShield) {
      shieldRadius = this.radius * 1.45;
      shieldOpacity = Math.min(1.0, shieldOpacity * 1.5);
    }

    const shieldColor = isRecoveryShield
      ? _colors.blue
      : this.hasFirewall
      ? _colors.neonGreen
      : _colors.green;
    const r = shieldColor.r, g = shieldColor.g, b = shieldColor.b;
    const t = Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);

    // ── Dome fill (radial gradient haze) ──────────────────────────────
    const grad = _ctx.createRadialGradient(0, 0, 0, 0, 0, shieldRadius);
    grad.addColorStop(0,   `rgba(${r},${g},${b},${shieldOpacity * 0.03})`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},${shieldOpacity * 0.07})`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},${shieldOpacity * 0.18})`);
    _ctx.beginPath();
    _ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
    _ctx.fillStyle = grad;
    _ctx.fill();

    // ── Outer edge ring ───────────────────────────────────────────────
    _ctx.beginPath();
    _ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
    _ctx.strokeStyle = `rgba(${r},${g},${b},${shieldOpacity * (0.55 + 0.3 * pulse)})`;
    _ctx.lineWidth = isRecoveryShield ? 3 : 2;
    _ctx.shadowColor = `rgba(${r},${g},${b},${shieldOpacity})`;
    _ctx.shadowBlur = isRecoveryShield ? 22 + 10 * pulse : 12 + 8 * pulse;
    _ctx.stroke();
    _ctx.shadowBlur = 0;

    // ── Secondary inner ring ──────────────────────────────────────────
    _ctx.beginPath();
    _ctx.arc(0, 0, shieldRadius * 0.72, 0, Math.PI * 2);
    _ctx.strokeStyle = `rgba(${r},${g},${b},${shieldOpacity * 0.22})`;
    _ctx.lineWidth = 1;
    _ctx.stroke();

    // ── Rotating arc scanlines (3 evenly-spaced arcs) ────────────────
    const numArcs = isRecoveryShield ? 4 : 3;
    const arcSpan = Math.PI * 0.38;
    for (let i = 0; i < numArcs; i++) {
      const arcStart = (t * 0.7 + (i / numArcs) * Math.PI * 2) % (Math.PI * 2);
      _ctx.beginPath();
      _ctx.arc(0, 0, shieldRadius * 0.88, arcStart, arcStart + arcSpan);
      _ctx.strokeStyle = `rgba(${r},${g},${b},${shieldOpacity * 0.45})`;
      _ctx.lineWidth = 1.2;
      _ctx.stroke();
    }

    // ── Recovery shield: outward pulse ring ───────────────────────────
    if (isRecoveryShield) {
      const pp = (Date.now() % 2000) / 2000;
      const pr = shieldRadius * (1 + pp * 0.35);
      const po = (1 - pp) * shieldOpacity * 0.55;
      _ctx.beginPath();
      _ctx.arc(0, 0, pr, 0, Math.PI * 2);
      _ctx.strokeStyle = `rgba(${r},${g},${b},${po})`;
      _ctx.lineWidth = 2;
      _ctx.shadowColor = `rgba(${r},${g},${b},${po})`;
      _ctx.shadowBlur = 12;
      _ctx.stroke();
      _ctx.shadowBlur = 0;
    }

    // ── Impact ripples ────────────────────────────────────────────────
    const now = Date.now();
    this.forcefieldImpacts = (this.forcefieldImpacts || []).filter(imp => {
      const age = (now - imp.time) / imp.duration;
      if (age >= 1) return false;
      const eased = 1 - (1 - age) * (1 - age); // ease-out
      const impX = Math.cos(imp.angle) * shieldRadius;
      const impY = Math.sin(imp.angle) * shieldRadius;
      const ripR = shieldRadius * 0.55 * eased;
      const ripO = (1 - age) * shieldOpacity;

      // Bright flash at impact point
      if (age < 0.3) {
        const flashO = (1 - age / 0.3) * shieldOpacity;
        _ctx.beginPath();
        _ctx.arc(impX, impY, this.radius * 0.4 * (1 - age / 0.3), 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(255,255,255,${flashO * 0.85})`;
        _ctx.shadowColor = `rgba(${r},${g},${b},${flashO})`;
        _ctx.shadowBlur = 18;
        _ctx.fill();
        _ctx.shadowBlur = 0;
      }

      // Expanding ripple ring centered at impact point
      _ctx.beginPath();
      _ctx.arc(impX, impY, ripR, 0, Math.PI * 2);
      _ctx.strokeStyle = `rgba(255,255,255,${ripO * 0.75})`;
      _ctx.lineWidth = 2.5 * (1 - age);
      _ctx.shadowColor = `rgba(${r},${g},${b},${ripO})`;
      _ctx.shadowBlur = 14;
      _ctx.stroke();
      _ctx.shadowBlur = 0;

      // Second ring slightly behind
      if (age > 0.15) {
        const age2 = age - 0.15;
        const eased2 = 1 - (1 - age2) * (1 - age2);
        _ctx.beginPath();
        _ctx.arc(impX, impY, shieldRadius * 0.55 * eased2, 0, Math.PI * 2);
        _ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - age2) * shieldOpacity * 0.55})`;
        _ctx.lineWidth = 1.5;
        _ctx.stroke();
      }
      return true;
    });

    _ctx.restore();
  }

  /** Trigger a forcefield impact ripple at the given attack angle. */
  triggerForcefieldImpact(attackAngle) {
    if (!this.forcefieldImpacts) this.forcefieldImpacts = [];
    // Ensure shield is visible for the impact
    if (!this.shieldActive) {
      this.shieldActive = true;
      this.shieldOpacity = Math.max(this.shieldOpacity, 0.6);
    }
    this.forcefieldImpacts.push({
      angle: attackAngle,
      time: Date.now(),
      duration: 700,
    });
    // Cap at 5 simultaneous impacts
    if (this.forcefieldImpacts.length > 5) this.forcefieldImpacts.shift();
  }

  drawCrackingShield() {
    if (this.shieldCrackProgress <= 0) return;

    _ctx.save();
    _ctx.translate(this.x, this.y);

    const p = this.shieldCrackProgress; // 0 → 1
    const shieldRadius = this.radius * (1.2 + this.shieldStrength * 0.1);
    const baseOpacity = (1 - p) * this.opacity;
    const shieldColor = this.hasFirewall ? _colors.neonGreen : _colors.blue;
    const r = shieldColor.r, g = shieldColor.g, b = shieldColor.b;

    // ── Dissolving outer ring (fades and expands outward) ─────────────
    const outerR = shieldRadius * (1 + p * 0.5);
    _ctx.beginPath();
    _ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    _ctx.strokeStyle = `rgba(${r},${g},${b},${baseOpacity * 0.7})`;
    _ctx.lineWidth = 2 * (1 - p);
    _ctx.shadowColor = `rgba(${r},${g},${b},${baseOpacity})`;
    _ctx.shadowBlur = 20 * (1 - p);
    _ctx.stroke();
    _ctx.shadowBlur = 0;

    // ── Three expanding shockwave rings ───────────────────────────────
    const ringOffsets = [0, 0.15, 0.3];
    ringOffsets.forEach(offset => {
      const rp = Math.min(1, (p - offset) / (1 - offset));
      if (rp <= 0) return;
      const ringR = shieldRadius * (1 + rp * 1.2);
      const ringO = (1 - rp) * baseOpacity * 0.6;
      _ctx.beginPath();
      _ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      _ctx.strokeStyle = `rgba(${r},${g},${b},${ringO})`;
      _ctx.lineWidth = 1.5 * (1 - rp);
      _ctx.stroke();
    });

    // ── White energy flash at start of break ──────────────────────────
    if (p < 0.4) {
      const flashO = (1 - p / 0.4) * 0.7 * this.opacity;
      const flashGrad = _ctx.createRadialGradient(0, 0, 0, 0, 0, shieldRadius * 1.1);
      flashGrad.addColorStop(0, `rgba(255,255,255,${flashO * 0.4})`);
      flashGrad.addColorStop(0.6, `rgba(${r},${g},${b},${flashO * 0.15})`);
      flashGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      _ctx.beginPath();
      _ctx.arc(0, 0, shieldRadius * 1.1, 0, Math.PI * 2);
      _ctx.fillStyle = flashGrad;
      _ctx.fill();
    }

    _ctx.restore();
  }

  createShieldFragments() {
    this.shieldFragments = [];
    const shieldRadius = this.radius * 1.2;
    const numFragments = 8;

    for (let i = 0; i < numFragments; i++) {
      const angle = (i / numFragments) * Math.PI * 2;
      const distance = shieldRadius * 0.7;

      this.shieldFragments.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        vx: Math.cos(angle) * (1 + Math.random() * 2),
        vy: Math.sin(angle) * (1 + Math.random() * 2) - 1,
        vr: (Math.random() - 0.5) * 0.2,
        rotation: angle,
        points: [
          { x: 0, y: 0 },
          { x: Math.random() * 10 + 5, y: (Math.random() - 0.5) * 10 },
          { x: Math.random() * 5, y: Math.random() * 10 + 5 },
          { x: -(Math.random() * 5), y: Math.random() * 5 },
        ],
      });
    }
  }

  updateShield() {
    const deltaTime = 16.67; // Approximate time per frame (60fps)

    // Check if recovery shield for central node should expire
    if (this.parent === null && this.hasRecoveryShield) {
      const elapsed = Date.now() - this.recoveryShieldStartTime;
      if (elapsed >= this.recoveryShieldDuration) {
        // Shield duration complete - mark as expired and start fade
        _logEvent("recoveryShieldExpired", { node: this });
        this.hasRecoveryShield = false;
      } else {
        // Recovery shield stays active and visible
        this.shieldActive = true;
        this.shieldStrength = 1.0;
        // Maintain full opacity
        if (this.shieldOpacity < 1) {
          this.shieldOpacity += 0.1;
          if (this.shieldOpacity > 1) this.shieldOpacity = 1;
        }
        return;
      }
    }

    // Handle shield fade-out after recovery shield expires
    if (
      this.parent === null &&
      !this.hasRecoveryShield &&
      this.shieldOpacity > 0
    ) {
      this.shieldOpacity -= 0.05;
      if (this.shieldOpacity <= 0) {
        this.shieldOpacity = 0;
        this.shieldActive = false;
      }
      return;
    }

    // Shield behavior based on node status
    if (
      this.status === "green" ||
      (this.parent === null &&
        this.status !== "malware" &&
        this.status !== "botnet" &&
        this.status !== "commandControl")
    ) {
      // Central node should NOT show regular shield flashes, only recovery shield
      if (this.parent === null) {
        // Central node without recovery shield has no shields
        return;
      }

      // Only regular _getNodes() with firewall capability can show shields
      if (!this.hasFirewall) {
        // Node doesn't have firewall capability
        return;
      }

      // Healthy _getNodes() have occasional shield flashes

      if (this.shieldCracking) {
        // Complete any cracking animation
        this.shieldCrackProgress += 0.05;
        if (this.shieldCrackProgress >= 1) {
          this.shieldCracking = false;
          this.shieldCrackProgress = 0;
          this.shieldFragments = [];
          this.shieldActive = false;
          this.shieldOpacity = 0;
        }
      } else {
        // Decrement flash timer
        this.shieldFlashTimer -= deltaTime;

        if (this.shieldFlashTimer <= 0) {
          // Start shield flash
          this.shieldActive = true;
          this.shieldStrength = 0.8 + Math.random() * 0.2; // Random strength 80-100%
          this.shieldFlashTimer = 8000 + Math.random() * 7000; // Next flash in 8-15 seconds
        }

        // Shield opacity fade in/out
        if (this.shieldActive) {
          if (this.shieldOpacity < 1) {
            this.shieldOpacity += 0.08; // Fade in
            if (this.shieldOpacity >= 1) {
              this.shieldOpacity = 1;
            }
          } else {
            // Hold at full opacity briefly, then fade out
            this.shieldFlashTimer -= deltaTime;
            if (this.shieldFlashTimer < -500) {
              // Hold for 0.5 seconds
              this.shieldOpacity -= 0.04; // Fade out slower
              if (this.shieldOpacity <= 0) {
                this.shieldOpacity = 0;
                this.shieldActive = false;
              }
            }
          }
        }
      }

      // If node is being infected, trigger shield crack
      if (
        this.isBeingInfected &&
        this.shieldActive &&
        !this.shieldCracking
      ) {
        this.shieldCracking = true;
        this.shieldCrackProgress = 0;
        this.createShieldFragments();
      }
    } else if (
      this.status === "malware" ||
      this.status === "botnet" ||
      this.status === "red" ||
      this.status === "yellow"
    ) {
      // Infected or compromised _getNodes() have no shields
      if (this.shieldActive || this.shieldOpacity > 0) {
        // Immediately shatter shield if it was active
        if (!this.shieldCracking && this.shieldOpacity > 0.5) {
          this.shieldCracking = true;
          this.shieldCrackProgress = 0;
          this.createShieldFragments();
        }

        // Fast fade/crack
        if (this.shieldCracking) {
          this.shieldCrackProgress += 0.08;
          if (this.shieldCrackProgress >= 1) {
            this.shieldCracking = false;
            this.shieldCrackProgress = 0;
            this.shieldFragments = [];
            this.shieldActive = false;
            this.shieldOpacity = 0;
          }
        } else {
          this.shieldOpacity -= 0.1;
          if (this.shieldOpacity <= 0) {
            this.shieldOpacity = 0;
            this.shieldActive = false;
          }
        }
      }
    }

    // During remediation, shields gradually rebuild
    if (this.remediationState === "spinning") {
      this.shieldStrength = Math.min(1.0, this.shieldStrength + 0.01);
    }
  }

  updateHeartbeat() {
    // Adjust heartbeat rate and intensity based on node status and activity
    let targetRate = 0.025; // Base rate
    let targetIntensity = 0.4; // Base intensity

    if (this.parent === null) {
      // Central node has slower, deeper breathing
      targetRate = 0.015;
      targetIntensity = 0.3;

      if (
        this.status === "malware" ||
        this.status === "botnet" ||
        this.status === "commandControl"
      ) {
        // Infected central node has erratic heartbeat
        targetRate = 0.06 + Math.sin(this.time * 0.02) * 0.03;
        targetIntensity = 0.5;
      } else if (this.isSelfHealing) {
        // Faster heartbeat during healing
        targetRate = 0.035;
        targetIntensity = 0.4;
      }
    } else {
      // Regular _getNodes()
      switch (this.status) {
        case "green":
          targetRate = 0.025;
          targetIntensity = 0.4;
          break;
        case "yellow":
          // Stressed/warning _getNodes() breathe faster but shallower
          targetRate = 0.04;
          targetIntensity = 0.3;
          break;
        case "red":
          // Down _getNodes() have weak, slow pulse
          targetRate = 0.015;
          targetIntensity = 0.2;
          break;
        case "malware":
          // Infected _getNodes() have rapid, intense pulse
          targetRate = 0.08 + Math.sin(this.time * 0.08) * 0.02;
          targetIntensity = 0.6;
          break;
      }

      // Activity modifiers
      if (this.isBeingInfected) {
        // Under attack - elevated heartbeat
        targetRate *= 1.5;
        targetIntensity *= 1.2;
      }

      if (this.isDefending) {
        // Defense response - sharp, fast pulse
        targetRate *= 1.8;
        targetIntensity *= 1.3;
      }

      if (this.remediationState === "spinning") {
        // Being healed - calming down
        targetRate *= 0.7;
        targetIntensity *= 0.8;
      }
    }

    // Smooth transition to target values
    this.heartbeatRate += (targetRate - this.heartbeatRate) * 0.1;
    this.heartbeatIntensity +=
      (targetIntensity - this.heartbeatIntensity) * 0.1;
  }

  update() {
    const colorTransitionSpeed = 0.05;
    const spawnSpeed = 0.015;

    if (this.state === "spawning") {
      this.spawnProgress += spawnSpeed;
      this.opacity = this.spawnProgress;

      if (this.spawnProgress >= 1) {
        this.spawnProgress = 1;
        // Don't snap to baseX/baseY - let physics take over smoothly from current position
        this.opacity = 1;
        this.state = "alive";
        // No position lock - forces were ramping up during spawn, continue smoothly
        this.isPositionLocked = false;
      } else if (this.parent) {
        // SMOOTH SPAWN: Interpolate from parent toward target, influenced by physics
        const t = this.spawnProgress;
        // Use cubic ease-out for smooth deceleration: 1 - (1-t)³
        const eased = 1 - Math.pow(1 - t, 3);

        // Blend between spawn animation and physics-driven position
        const spawnInfluence = 1 - eased; // Decreases as spawn progresses
        const physicsInfluence = eased; // Increases as spawn progresses

        const spawnX =
          this.parent.x + (this.baseX - this.parent.x) * eased;
        const spawnY =
          this.parent.y + (this.baseY - this.parent.y) * eased;

        // Let physics forces accumulate and influence position during spawn
        // This creates smooth transition from spawn animation to physics-driven positioning
        this.x = spawnX + this.fx * physicsInfluence * 3; // Amplify physics influence during spawn
        this.y = spawnY + this.fy * physicsInfluence * 3;

        // Don't zero forces - let them ramp up during spawn
      }
    } else if (_SatelliteSystem.updateLegacyOrbit(this)) {
      // _SatelliteSystem owns optional legacy circular orbit motion.
    } else if (this.state === "retracting" && this.parent) {
      if (this.children.length === 0) {
        const retractionSpeed = 0.1;
        this.x += (this.parent.x - this.x) * retractionSpeed;
        this.y += (this.parent.y - this.y) * retractionSpeed;

        this.radius *= 0.95;
        const dist = Math.sqrt(
          (this.parent.x - this.x) ** 2 + (this.parent.y - this.y) ** 2
        );
        if (dist < 5 || this.radius < 0.5) {
          this.opacity = 0;
        }
      }
    }

    // FREE-FLOATING SATELLITES: No host/parent validation needed
    // Satellites are independent orbital units - they only despawn via:
    // 1. 30-second unlinked timeout (handled in orbital mechanics)
    // 2. Going off-screen while fading

    if (_SatelliteSystem.updateDriftingSatellite(this, colorTransitionSpeed)) {
      return;
    }

    if (_SatelliteSystem.updateFadingSatellite(this)) {
      return;
    }

    if (this.state !== "retracting") {
      // Update settling phase for gradual physics integration
      if (this.settlingPhase > 0) {
        this.settlingPhase -= 16; // Assume ~60fps (16ms per frame)
        this.physicsMultiplier =
          0.3 + 0.7 * (1 - Math.max(0, this.settlingPhase) / 2000);
      } else {
        this.physicsMultiplier = 1.0; // Fully settled
      }

      // Update heartbeat before calculating radius
      this.updateHeartbeat();

      if (this.parent === null) {
        // Central node grows with connections; higher cap keeps the core visibly dominant.
        const descendantCount = _countDescendants(this);
        const centralGrowth = Math.min(descendantCount * 1.5, 18);
        this.baseRadius = 15 + centralGrowth;

        // Add organic breathing effect to central node
        const heartbeat =
          Math.sin(this.breathingPhase) * this.heartbeatIntensity;
        this.targetRadius = this.baseRadius * (1 + heartbeat);

        // Add pulse effect on top
        this.targetRadius += this.pulseEffect * 28;
        this.pulseEffect *= 0.92;
        if (this.pulseEffect < 0.01) this.pulseEffect = 0;

        let targetColor = _colors.blue;
        if (this.status === "malware") {
          targetColor = _colors.malware;
        } else if (this.status === "botnet") {
          targetColor = _colors.botnet;
        } else if (this.status === "commandControl") {
          targetColor = _colors.commandControl;
        }
        this.currentColor.r +=
          (targetColor.r - this.currentColor.r) * colorTransitionSpeed;
        this.currentColor.g +=
          (targetColor.g - this.currentColor.g) * colorTransitionSpeed;
        this.currentColor.b +=
          (targetColor.b - this.currentColor.b) * colorTransitionSpeed;
      } else {
        if (this.isGroundStation) {
          this.baseRadius = 22; // Fixed larger footprint for ground stations
          const heartbeat =
            Math.sin(this.breathingPhase) *
            (this.heartbeatIntensity * 0.6);
          this.targetRadius = this.baseRadius * (1 + heartbeat);

          let targetColor = _colors.groundStation;
          switch (this.status) {
            case "red":
              targetColor = _colors.red;
              break;
            case "yellow":
              targetColor = _colors.yellow;
              break;
            case "malware":
              targetColor = _colors.malware;
              break;
            case "botnet":
              targetColor = _colors.botnet;
              break;
            case "commandControl":
              targetColor = _colors.commandControl;
              break;
            case "green":
            default:
              targetColor = _colors.groundStation;
              break;
          }

          this.currentColor.r +=
            (targetColor.r - this.currentColor.r) * colorTransitionSpeed;
          this.currentColor.g +=
            (targetColor.g - this.currentColor.g) * colorTransitionSpeed;
          this.currentColor.b +=
            (targetColor.b - this.currentColor.b) * colorTransitionSpeed;
        } else if (this.isSatellite) {
          this.baseRadius = 10;
          const heartbeat =
            Math.sin(this.breathingPhase) *
            (this.heartbeatIntensity * 0.4);
          this.targetRadius = this.baseRadius * (1 + heartbeat);
          const targetColor = _colors.satellite;
          this.currentColor.r +=
            (targetColor.r - this.currentColor.r) * colorTransitionSpeed;
          this.currentColor.g +=
            (targetColor.g - this.currentColor.g) * colorTransitionSpeed;
          this.currentColor.b +=
            (targetColor.b - this.currentColor.b) * colorTransitionSpeed;
        } else {
          const descendantCount = _countDescendants(this);
          this.baseRadius = 7 + Math.min(descendantCount * 1.5, 8);

          // Dynamic heartbeat-based pulsing based on current state
          const heartbeat =
            Math.sin(this.breathingPhase) * this.heartbeatIntensity;

          // Malware, botnet, and C&C _getNodes() pulse larger, not smaller
          if (
            this.status === "malware" ||
            this.status === "botnet" ||
            this.status === "commandControl"
          ) {
            this.targetRadius = this.baseRadius * (1.5 + heartbeat * 0.5); // Pulse between 1.2x and 1.8x
          } else {
            this.targetRadius = this.baseRadius * (1 + heartbeat);
          }

          let targetColor = _colors.green;
          switch (this.status) {
            case "red":
              targetColor = _colors.red;
              break;
            case "yellow":
              targetColor = _colors.yellow;
              break;
            case "malware":
              targetColor = _colors.malware;
              break;
            case "botnet":
              targetColor = _colors.botnet;
              break;
            case "commandControl":
              targetColor = _colors.commandControl;
              break;
            case "green":
              // Use neon green for firewall _getNodes()
              targetColor = this.hasFirewall
                ? _colors.neonGreen
                : _colors.green;
              break;
          }
          if (this.isGuardian) {
            targetColor = _colors.white;
          } else if (this.isDatacenter) {
            targetColor = _colors.datacenter;
          } else if (this.isHoneypot && this.status === "green") {
            targetColor = _colors.honeypot;
          }
          this.currentColor.r +=
            (targetColor.r - this.currentColor.r) * colorTransitionSpeed;
          this.currentColor.g +=
            (targetColor.g - this.currentColor.g) * colorTransitionSpeed;
          this.currentColor.b +=
            (targetColor.b - this.currentColor.b) * colorTransitionSpeed;
        }
      }
    }

    this.radius += (this.targetRadius - this.radius) * 0.05;

    // Gradually ramp up force multiplier during and after spawn (0 → 1 over spawn duration)
    if (this.state === "spawning" || this.state === "alive") {
      if (this.forceMultiplier < 1.0) {
        // Ramp up throughout spawn animation for single smooth phase
        this.forceMultiplier = Math.min(
          1.0,
          this.forceMultiplier + 0.012
        ); // Faster ramp during spawn
      }
    }

    if (this.state === "alive" && this !== _getDraggedNode()) {
      _PhysicsSystem.applyPerNodeForces(this);
    }

    this.time += 1;
    this.spinnerAngle += 0.05;
    this.ccRotation += 0.02; // Rotate C&C danger ring
    this.breathingPhase += this.heartbeatRate;

    // Update shield logic
    this.updateShield();

    const SPIN_DURATION = 1200 / _healSpeedMultiplier;
    const POP_DURATION = 300 / _healSpeedMultiplier;

    if (this.remediationState === "spinning") {
      if (Date.now() - this.remediationStart > SPIN_DURATION) {
        this.remediationState = "popping";
        this.remediationStart = Date.now();
        _ParticleSystem.createPopParticles(this.x, this.y, this.currentColor);
      }
    } else if (this.remediationState === "popping") {
      const elapsed = Date.now() - this.remediationStart;
      const progress = Math.min(1, elapsed / POP_DURATION);

      this.opacity = 1 - progress;
      this.radius = this.baseRadius * (1 - progress);

      if (progress >= 1) {
        this.remediationState = "none";
        _HealingSystem.updateNodeStatus(this, "green");
        this.opacity = 1;
        if (this.pendingDispatchPromotionCheck) {
          this.pendingDispatchPromotionCheck = false;
          if (
            !this.isGuardian &&
            this.state === "alive" &&
            this.status === "green" &&
            Math.random() < 0.1
          ) {
            _promoteToGuardian(this, "guardianPromotionDispatch");
          }
        }
      }
    }

    if (this.isSelfHealing) {
      const SELF_HEAL_DURATION = 5000;
      if (Date.now() > this.selfHealingStartTime + SELF_HEAL_DURATION) {
        this.isSelfHealing = false;
        this.selfHealingDispatchAllowance = 0;
        this.selfHealingPacketsCreated = 0;
        _HealingSystem.updateNodeStatus(this, "blue");
        _logEvent("centralSelfHealingCompleted");

        // Activate recovery shield for central node
        if (this.parent === null) {
          this.hasRecoveryShield = true;
          this.recoveryShieldStartTime = Date.now();
          this.shieldActive = true;
          this.shieldOpacity = 0; // Will fade in via updateShield
          this.shieldStrength = 1.0;
          _logEvent("recoveryShieldActivated", { node: this });
        }
      }
    }

    // Handle immunity healing
    if (
      this.isImmunityHealing &&
      (this.status === "malware" ||
        this.status === "botnet" ||
        this.status === "commandControl")
    ) {
      const numPackets = this.attachedImmunityPackets.length;
      if (numPackets > 0) {
        // Base healing time: 180 seconds for 1 packet (was 120s)
        // More packets = faster healing (direct division)
        // Supercharged packets count as 2 regular packets
        const BASE_HEAL_TIME = 180000 / _healSpeedMultiplier; // 180 seconds

        // Count regular and supercharged packets
        let regularCount = 0;
        let superchargedCount = 0;
        this.attachedImmunityPackets.forEach((packet) => {
          if (packet.isSupercharged) {
            superchargedCount++;
          } else {
            regularCount++;
          }
        });

        // Calculate effective packet count (supercharged = 2x regular)
        // Reduced recovery modifier by half for slower healing
        const effectivePackets =
          (regularCount + superchargedCount * 2) / 2;
        const healTime = BASE_HEAL_TIME / effectivePackets;

        const elapsed = Date.now() - this.immunityHealingStartTime;
        if (elapsed >= healTime) {
          // Healing complete!
          // Pop all attached immunity packets
          this.attachedImmunityPackets.forEach((packet) => {
            if (packet.active) {
              packet.active = false;
            }
          });
          this.attachedImmunityPackets = [];

          // Pop the node itself with white particles
          _ParticleSystem.createPopParticles(this.x, this.y, _colors.white);

          // Heal the node
          this.isImmunityHealing = false;
          this.immunityHealingStartTime = 0;
          _logEvent("immunityHealingCompleted", { node: this });
          // Central node heals to 'blue', other _getNodes() to 'green'
          const healedStatus = this.parent === null ? "blue" : "green";
          _HealingSystem.updateNodeStatus(this, healedStatus);
        }
      } else {
        // No packets attached anymore, stop healing
        this.isImmunityHealing = false;
        this.immunityHealingStartTime = 0;
      }
    }

    // Handle infection logic
    this.spreadingInfections = this.spreadingInfections.filter(
      (infection) => {
        const target = infection.target;

        // An attack is cancelled if the attacker is remediated, or the target becomes invalid.
        if (
          (this.status !== "malware" &&
            this.status !== "botnet" &&
            this.status !== "commandControl") ||
          !target ||
          target.state !== "alive" ||
          target.status === "malware" ||
          target.status === "botnet" ||
          target.status === "commandControl"
        ) {
          if (target) target.isBeingInfected = false;
          return false; // remove this infection
        }

        const elapsed = Date.now() - infection.startTime;

        if (target.parent === null) {
          const ATTACK_DURATION = 1500;
          const DEFENSE_DELAY = 1500;
          // FIX: Check if defense has been attempted for this specific attack instance to prevent double-hits
          if (
            elapsed > DEFENSE_DELAY &&
            !infection.defenseTriggered &&
            target.status !== "malware"
          ) {
            // Mark this attack instance as having triggered a defense, preventing re-triggers.
            infection.defenseTriggered = true;

            // Trigger the defense pulse animation regardless of success or failure.
            target.isDefending = true;
            target.defenseStartTime = Date.now();

            // Check if central node has supercharged immunity packets (requires 2 to buffer)
            const superchargedPackets =
              target.attachedImmunityPackets.filter(
                (p) => p && p.isSupercharged
              );
            const hasDefenseResources = superchargedPackets.length >= 2;

            // Now, determine the outcome.
            // Recovery shield provides 99% resistance (1% failure), otherwise 10% failure
            // Normal defense chance is NOT affected by packet availability
            const failureChance = target.hasRecoveryShield ? 0.01 : 0.1;

            if (target.hasRecoveryShield) {
              _logEvent("recoveryShieldAttack", { target });
            }

            const attackSucceeds = Math.random() < failureChance;

            if (attackSucceeds) {
              // Attack succeeded - check if we have packets to buffer the infection
              if (hasDefenseResources) {
                // Consume 2 packets to prevent infection (last-ditch buffer)
                for (
                  let i = 0;
                  i < 2 && superchargedPackets.length > 0;
                  i++
                ) {
                  const consumedPacket = superchargedPackets[i];
                  consumedPacket.active = false;
                  target.attachedImmunityPackets =
                    target.attachedImmunityPackets.filter(
                      (p) => p !== consumedPacket
                    );
                }
                _logEvent("custom", {
                  alert:
                    "🛡️ Central node consumed supercharged packets to buffer incoming attack!",
                  details: { node: "central", packetsConsumed: 2 },
                });
              } else {
                // No packets to buffer - infection succeeds
                _HealingSystem.updateNodeStatus(target, "malware");
                _logEvent("centralUnderAttack"); // Warning that defense resources depleted
                // If recovery shield was active but failed, it shatters
                if (target.hasRecoveryShield) {
                  target.hasRecoveryShield = false;
                  target.shieldCracking = true;
                  target.shieldCrackProgress = 0;
                  target.createShieldFragments();
                }
              }
            } else {
              // Defense successful! Consume 2 supercharged immunity packets if available
              if (hasDefenseResources) {
                for (
                  let i = 0;
                  i < 2 && superchargedPackets.length > 0;
                  i++
                ) {
                  const consumedPacket = superchargedPackets[i];
                  consumedPacket.active = false;
                  target.attachedImmunityPackets =
                    target.attachedImmunityPackets.filter(
                      (p) => p !== consumedPacket
                    );
                }
              }

              // Spawn immunity packets if in bot defense mode
              if (target.botDefenseModeActive) {
                _spawnCentralImmunityPackets(target);
              }
            }
          }
          // The infection object is removed after the attack animation (advance + retreat) is complete
          if (elapsed > ATTACK_DURATION + 1000) {
            return false; // remove this infection
          }
        } else {
          // Regular infection timing
          // Datacenters and honeypots have supercharged firewall — much harder to infect
          const INFECTION_DURATION = target.isDatacenter ? 6000 : (target.isHoneypot ? 5000 : 4000);
          let BASE_DEFENSE_CHANCE;
          if (target.isHoneypot) {
            BASE_DEFENSE_CHANCE = _CONFIG.honeypot.infectionResistChance ?? 0.85;
          } else if (target.isDatacenter) {
            BASE_DEFENSE_CHANCE = _CONFIG.datacenter.infectionResistChance ?? 0.78;
          } else {
            BASE_DEFENSE_CHANCE = 0.25;
          }

          // Apply size-based defense bonus
          const defenseBonus = _getNodeDefenseBonus(target);
          const defenseCap = target.isGuardian
            ? 0.95
            : target.isDatacenter
            ? 0.96
            : target.isHoneypot
            ? 0.92
            : 0.75;
          const DEFENSE_CHANCE = Math.min(
            BASE_DEFENSE_CHANCE + defenseBonus,
            defenseCap
          );

          if (elapsed > INFECTION_DURATION) {
            if (Math.random() < DEFENSE_CHANCE) {
              target.isDefending = true;
              target.defenseStartTime = Date.now();
              _logEvent("nodeDefended", { node: target });
              _incrementStat("totalDefenses");

              // Honeypot special ability: convert attacker to guardian on successful defense
              if (target.isHoneypot && target.honeypotConversions < _CONFIG.honeypot.maxConversions) {
                const attacker = this; // 'this' is the attacking infected node

                // Send stream of honeycomb packets back to the attacker
                _ParticleSystem.createHoneycombStream(target, attacker);

                target.honeypotConversions++;
                _logEvent("honeypotDefended", { node: target });

                // Check if honeypot is depleted
                if (target.honeypotConversions >= _CONFIG.honeypot.maxConversions) {
                  // Revert to normal firewall node after animation completes
                  setTimeout(() => {
                    if (target && target.state === "alive") {
                      target.isHoneypot = false;
                      target.hasFirewall = true;
                      target.currentColor = { ..._colors.neonGreen };
                      _logEvent("honeypotDepleted", { node: target });
                      _ParticleSystem.createPopParticles(target.x, target.y, _colors.neonGreen);
                    }
                  }, _CONFIG.honeypot.conversionAnimationDuration);
                }
              }
            } else {
              _HealingSystem.updateNodeStatus(target, "malware");
              _logEvent("nodeInfected", { node: target });
              _incrementStat("totalInfections");

              // If honeypot gets infected, it loses its honeypot status
              if (target.isHoneypot) {
                target.isHoneypot = false;
              }
            }
            target.isBeingInfected = false;
            return false; // remove this infection
          }
        }
        return true; // keep this infection
      }
    );
  }
}




  Node.prototype.startRemediation = function () {
    if (this.remediationState !== "none") return;
    this.remediationState = "spinning";
    this.remediationStart = Date.now();
    _logEvent("remediationStarted", { node: this });
  };

  window.NodeNet.Node = Node;
  window.NodeNet.NodeClass = { configure };
})();
