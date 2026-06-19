/**
 * @module UIInitializers
 * @summary DOM wiring — stats-pane toggle, tab system, Codex help panel, sliders, and background selector.
 * @exports window.NodeNet.UIInitializers
 * @tags ui-init, dom, tabs, sliders, codex, controls, wiring, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getViewState: () => ({ isSidePanelOpen: false, sidePanelWidth: 300 }),
    setSidePanelOpen: () => {},
    setSimSpeedMultiplier: () => {},
    setPacketSpeedMultiplier: () => {},
    setAttackFreqMultiplier: () => {},
    setHealSpeedMultiplier: () => {},
    setDesiredBranchCount: () => {},
    setMaxBranchDepth: () => {},
    setNetworkSoftCap: () => {},
    applySproutPruneBalance: () => {},
    formatSproutPruneLabel: () => "1.0 : 1.0",
    getDefaultBranchCount: () => 6,
    getDefaultMaxBranchDepth: () => 5,
    getDefaultNetworkSoftCap: () => 200,
    getBackgroundSystem: () => null,
  };

  const UIInitializers = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    initializeStatsPaneToggle() {
      const statsPane = document.getElementById("statsPane");
      const toggleBtn = document.getElementById("statsPaneToggle");
      const toggleIcon = document.getElementById("toggleIcon");
      const topStatusBar = document.getElementById("topStatusBar");
      const liveEventFeed = document.getElementById("liveEventFeed");

      if (!statsPane || !toggleBtn) return;

      toggleBtn.classList.toggle(
        "collapsed",
        statsPane.classList.contains("collapsed")
      );
      if (toggleIcon) {
        toggleIcon.textContent = statsPane.classList.contains("collapsed")
          ? "\u00ab" // «
          : "\u00bb"; // »
      }

      // Sync initial state for new UI elements
      const isCollapsed = statsPane.classList.contains("collapsed");
      if (topStatusBar) topStatusBar.classList.toggle("sidebar-closed", isCollapsed);
      if (liveEventFeed) liveEventFeed.classList.toggle("sidebar-closed", isCollapsed);

      toggleBtn.addEventListener("click", () => {
        statsPane.classList.toggle("collapsed");
        toggleBtn.classList.toggle(
          "collapsed",
          statsPane.classList.contains("collapsed")
        );

        const isOpen = !statsPane.classList.contains("collapsed");
        dependencies.setSidePanelOpen(isOpen);

        const isClosed = statsPane.classList.contains("collapsed");

        // Update Top Status Bar position
        if (topStatusBar) {
          topStatusBar.classList.toggle("sidebar-closed", isClosed);
        }

        // Update Live Event Feed position
        if (liveEventFeed) {
          liveEventFeed.classList.toggle("sidebar-closed", isClosed);
        }

        // Update legacy Ticker position (hidden but kept for compatibility)
        const ticker = document.getElementById("newsTicker");
        if (ticker) {
          ticker.classList.toggle("sidebar-open", isOpen);
        }

        // Update toggle icon
        if (toggleIcon) {
          toggleIcon.textContent = isClosed ? "\u00ab" : "\u00bb";
        }
      });
    },

    initializeTabs() {
      const tabButtons = document.querySelectorAll(".tab-btn");
      const tabContents = document.querySelectorAll(".tab-content");

      tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetTab = btn.dataset.tab;

          // Remove active class from all buttons and contents
          tabButtons.forEach((b) => b.classList.remove("active"));
          tabContents.forEach((content) =>
            content.classList.remove("active")
          );

          // Add active class to clicked button and corresponding content
          btn.classList.add("active");
          document.getElementById(`tab-${targetTab}`).classList.add("active");
        });
      });
    },

    /**
     * Draw compact visual replicas on all Codex canvases and start a
     * lightweight animation loop (~15 fps) that pulses glows when visible.
     * Node canvases: 28x28 | Packet canvases: 24x24 | Edge canvases: 76x12/18
     */
    initCodex() {
      const cx = (id) => { const el = document.getElementById(id); return el ? el.getContext("2d") : null; };

      /** Redraw a node with animated glow rings (28x28). */
      function nodeAt(c, opts, phase) {
        const mx = 14, my = 14;
        const { r, fill, glow, rings = [], icon, iconSize = 7 } = opts;
        const pulse = 0.5 + 0.5 * Math.sin(phase);
        c.clearRect(0, 0, 28, 28);
        rings.forEach(({ rad, color, lw = 1 }) => {
          c.beginPath(); c.arc(mx, my, rad, 0, Math.PI * 2);
          c.strokeStyle = color; c.globalAlpha = 0.1 + 0.32 * pulse;
          c.lineWidth = lw; c.stroke(); c.globalAlpha = 1;
        });
        if (glow) { c.shadowColor = glow; c.shadowBlur = 4 + 6 * pulse; }
        c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2);
        c.fillStyle = fill; c.fill(); c.shadowBlur = 0;
        if (icon) { c.font = `${iconSize}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(icon, mx, my + 1); }
      }

      /** Redraw a packet with animated glow (24x24). */
      function packetAt(c, opts, phase) {
        const mx = 12, my = 12;
        const { r = 3, fill, glow, ring } = opts;
        const pulse = 0.5 + 0.5 * Math.sin(phase + 0.5);
        c.clearRect(0, 0, 24, 24);
        if (glow) { c.shadowColor = glow; c.shadowBlur = 4 + 7 * pulse; }
        c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2);
        c.fillStyle = fill; c.fill(); c.shadowBlur = 0;
        if (ring) {
          c.beginPath(); c.arc(mx, my, r + 2, 0, Math.PI * 2);
          c.strokeStyle = ring; c.globalAlpha = 0.15 + 0.45 * pulse;
          c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        }
      }

      /** Draw a static edge sample (dimensions taken from element). */
      function drawEdge(id, opts) {
        const c = cx(id); if (!c) return;
        const el = document.getElementById(id), W = el.width, H = el.height;
        c.clearRect(0, 0, W, H);
        const { color = "#fff", lw = 1.5, dash = [], glow, arch = 0, gradient } = opts;
        const x1 = 4, y1 = H / 2, x2 = W - 4, y2 = H / 2;
        const cpx = (x1 + x2) / 2, cpy = y1 - arch;
        if (glow) { c.shadowColor = glow; c.shadowBlur = 6; }
        c.setLineDash(dash); c.lineWidth = lw;
        if (gradient) {
          const g = c.createLinearGradient(x1, 0, x2, 0);
          gradient.forEach(([p, col]) => g.addColorStop(p, col));
          c.strokeStyle = g;
        } else { c.strokeStyle = color; }
        c.beginPath();
        if (arch !== 0) { c.moveTo(x1, y1 + arch * 0.4); c.quadraticCurveTo(cpx, cpy, x2, y2 + arch * 0.4); }
        else { c.moveTo(x1, y1); c.lineTo(x2, y2); }
        c.stroke(); c.setLineDash([]); c.shadowBlur = 0;
      }

      // -- node draw configs
      const nodeConfigs = {
        "cdx-green":         { r: 6, fill: "#16a34a", glow: "#16a34a" },
        "cdx-firewall":      { r: 6, fill: "#39ff14", glow: "#39ff14", rings: [{ rad: 10, color: "#39ff14" }] },
        "cdx-yellow":        { r: 6, fill: "#facc15", glow: "#facc15" },
        "cdx-malware":       { r: 6, fill: "#a855f7", glow: "#a855f7", rings: [{ rad: 10, color: "#a855f7" }] },
        "cdx-botnet":        { r: 6, fill: "#dc2626", glow: "#dc2626" },
        "cdx-cc":            { r: 7, fill: "#8b0000", glow: "#ef4444", rings: [{ rad: 11, color: "#ef4444" }], icon: "\u2620", iconSize: 7 },
        "cdx-guardian":      { r: 6, fill: "#ffffff", glow: "#ffffff", rings: [{ rad: 9, color: "#ffffff" }, { rad: 12, color: "#ffffff" }] },
        "cdx-datacenter":    { r: 6, fill: "#00e0ff", glow: "#00e0ff", rings: [{ rad: 10, color: "#00e0ff" }], icon: "\ud83c\udfe2", iconSize: 7 },
        "cdx-groundstation": { r: 6, fill: "#60a5fa", glow: "#60a5fa", icon: "\ud83d\udce1", iconSize: 7 },
      };

      // -- packet draw configs
      const packetConfigs = {
        "cdx-pkt-data":          { r: 3, fill: "#16a34a", glow: "#16a34a" },
        "cdx-pkt-immunity":      { r: 3, fill: "#16a34a", glow: "#39ff14", ring: "rgba(57,255,20,0.6)" },
        "cdx-pkt-dispatch":      { r: 3, fill: "#3b82f6", glow: "#3b82f6" },
        "cdx-pkt-phishing":      { r: 3, fill: "#dc2626", glow: "#dc2626" },
        "cdx-pkt-counterstrike": { r: 3, fill: "#fbbf24", glow: "#fbbf24", ring: "rgba(251,191,36,0.5)" },
      };

      // -- static edge draws (drawn once, no animation needed)
      drawEdge("cdx-edge-tree",      { gradient: [[0,"rgba(22,163,74,0.35)"],[0.5,"#16a34a"],[1,"rgba(22,163,74,0.35)"]], lw: 2, glow: "#16a34a" });
      drawEdge("cdx-edge-wireless",  { color: "#60a5fa", lw: 1.5, dash: [2,4], glow: "#60a5fa" });
      drawEdge("cdx-edge-guardian",  { color: "#39ff14", lw: 1.5, dash: [5,3], arch: 7, glow: "#39ff14" });
      drawEdge("cdx-edge-dcvpn",     { color: "#00e0ff", lw: 1.5, dash: [5,3], arch: 7, glow: "#00e0ff" });
      drawEdge("cdx-edge-botnet",    { color: "#dc2626", lw: 1.5, dash: [3,3], glow: "#ef4444" });
      drawEdge("cdx-edge-infection", { gradient: [[0,"rgba(168,85,247,0)"],[0.45,"#a855f7"],[1,"rgba(168,85,247,0.22)"]], lw: 2, glow: "#a855f7" });

      // -- animation loop
      let phase = 0;

      function redrawLive(force) {
        const tab = document.getElementById("tab-codex");
        if (!force && (!tab || !tab.classList.contains("active"))) return;
        phase = (phase + 0.055) % (Math.PI * 2);
        const pulse = 0.5 + 0.5 * Math.sin(phase);

        // Central node
        (() => {
          const c = cx("cdx-central"); if (!c) return;
          c.clearRect(0, 0, 28, 28);
          [[13, 0.07 + 0.18 * pulse], [11, 0.12 + 0.22 * pulse]].forEach(([rad, alpha]) => {
            c.beginPath(); c.arc(14, 14, rad, 0, Math.PI * 2);
            c.strokeStyle = "#3b82f6"; c.globalAlpha = alpha; c.lineWidth = 1.2; c.stroke(); c.globalAlpha = 1;
          });
          c.shadowColor = "#3b82f6"; c.shadowBlur = 5 + 6 * pulse;
          c.beginPath(); c.arc(14, 14, 7, 0, Math.PI * 2);
          c.fillStyle = "#3b82f6"; c.fill(); c.shadowBlur = 0;
        })();

        // Red/down -- static dim with X
        (() => {
          const c = cx("cdx-red"); if (!c) return;
          c.clearRect(0, 0, 28, 28);
          c.globalAlpha = 0.5; c.shadowColor = "#f87171"; c.shadowBlur = 4;
          c.beginPath(); c.arc(14, 14, 6, 0, Math.PI * 2);
          c.fillStyle = "#f87171"; c.fill(); c.shadowBlur = 0; c.globalAlpha = 1;
          c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 1.5;
          [[-3,-3,3,3],[3,-3,-3,3]].forEach(([ax,ay,bx,by]) => { c.beginPath(); c.moveTo(14+ax,14+ay); c.lineTo(14+bx,14+by); c.stroke(); });
        })();

        // Satellite -- pulsing orbital body
        (() => {
          const c = cx("cdx-satellite"); if (!c) return;
          c.clearRect(0, 0, 28, 28);
          c.save(); c.translate(14,14); c.scale(1.3,0.4);
          c.beginPath(); c.arc(0,0,11,0,Math.PI*2);
          c.strokeStyle="rgba(147,197,253,0.28)"; c.lineWidth=1; c.stroke(); c.restore();
          c.shadowColor="#93c5fd"; c.shadowBlur=4+5*pulse;
          c.beginPath(); c.arc(14,14,5,0,Math.PI*2);
          c.fillStyle="#93c5fd"; c.fill(); c.shadowBlur=0;
        })();

        // Supercharged -- animated multi-ring neon burst
        (() => {
          const c = cx("cdx-pkt-supercharged"); if (!c) return;
          const p2 = 0.5 + 0.5 * Math.sin(phase + 1);
          c.clearRect(0,0,24,24);
          [[9,0.07+0.15*p2],[6,0.12+0.25*p2]].forEach(([r,a]) => {
            c.beginPath(); c.arc(12,12,r,0,Math.PI*2); c.strokeStyle="#39ff14"; c.globalAlpha=a; c.lineWidth=1; c.stroke(); c.globalAlpha=1;
          });
          c.shadowColor="#39ff14"; c.shadowBlur=7+8*p2;
          c.beginPath(); c.arc(12,12,3,0,Math.PI*2); c.fillStyle="#39ff14"; c.fill(); c.shadowBlur=0;
        })();

        // Ping of death -- animated spikes
        (() => {
          const c = cx("cdx-pkt-ping"); if (!c) return;
          const p2 = 0.5 + 0.5 * Math.sin(phase * 1.7);
          c.clearRect(0,0,24,24);
          c.shadowColor="#ef4444"; c.shadowBlur=5+8*p2;
          c.beginPath(); c.arc(12,12,3,0,Math.PI*2); c.fillStyle="#ef4444"; c.fill(); c.shadowBlur=0;
          for (let i=0; i<8; i++) {
            const a=(i/8)*Math.PI*2;
            c.beginPath(); c.moveTo(12+Math.cos(a)*4,12+Math.sin(a)*4); c.lineTo(12+Math.cos(a)*(6+2*p2),12+Math.sin(a)*(6+2*p2));
            c.strokeStyle=`rgba(239,68,68,${0.35+0.45*p2})`; c.lineWidth=1; c.stroke();
          }
        })();

        // Standard nodes and packets
        Object.entries(nodeConfigs).forEach(([id, opts]) => { const c=cx(id); if(c) nodeAt(c, opts, phase); });
        Object.entries(packetConfigs).forEach(([id, opts]) => { const c=cx(id); if(c) packetAt(c, opts, phase); });
      }

      redrawLive(true);
      setInterval(redrawLive, 66);
    },

    initializeSliders() {
      const setSim = dependencies.setSimSpeedMultiplier;
      const setPkt = dependencies.setPacketSpeedMultiplier;
      const setAtk = dependencies.setAttackFreqMultiplier;
      const setHlr = dependencies.setHealSpeedMultiplier;
      const setBr  = dependencies.setDesiredBranchCount;
      const setDp  = dependencies.setMaxBranchDepth;
      const setDn  = dependencies.setNetworkSoftCap;
      const applyBalance = dependencies.applySproutPruneBalance;
      const fmtLabel = dependencies.formatSproutPruneLabel;
      const DEF_BR = dependencies.getDefaultBranchCount;
      const DEF_DP = dependencies.getDefaultMaxBranchDepth;
      const DEF_DN = dependencies.getDefaultNetworkSoftCap;

      // Simulation Speed Slider
      const simSpeedSlider = document.getElementById("simSpeed");
      const simSpeedValue = document.getElementById("simSpeed-value");
      if (simSpeedSlider && simSpeedValue) {
        simSpeedSlider.addEventListener("input", (e) => {
          setSim(e.target.value / 100);
          simSpeedValue.textContent = `${(e.target.value / 100).toFixed(1)}x`;
        });
      }

      // Packet Speed Slider
      const packetSpeedSlider = document.getElementById("packetSpeed");
      const packetSpeedValue = document.getElementById("packetSpeed-value");
      if (packetSpeedSlider && packetSpeedValue) {
        packetSpeedSlider.addEventListener("input", (e) => {
          setPkt(e.target.value / 100);
          packetSpeedValue.textContent = `${(e.target.value / 100).toFixed(1)}x`;
        });
      }

      // Attack Frequency Slider
      const attackFreqSlider = document.getElementById("attackFreq");
      const attackFreqValue = document.getElementById("attackFreq-value");
      if (attackFreqSlider && attackFreqValue) {
        attackFreqSlider.addEventListener("input", (e) => {
          setAtk(e.target.value / 100);
          attackFreqValue.textContent = `${(e.target.value / 100).toFixed(1)}x`;
        });
      }

      // Healing Speed Slider
      const healSpeedSlider = document.getElementById("healSpeed");
      const healSpeedValue = document.getElementById("healSpeed-value");
      if (healSpeedSlider && healSpeedValue) {
        healSpeedSlider.addEventListener("input", (e) => {
          setHlr(e.target.value / 100);
          healSpeedValue.textContent = `${(e.target.value / 100).toFixed(1)}x`;
        });
      }

      // Central Branches Slider
      const branchSlider = document.getElementById("branchCount");
      const branchValue = document.getElementById("branchCount-value");
      if (branchSlider && branchValue) {
        branchSlider.addEventListener("input", (e) => {
          setBr(parseInt(e.target.value, 10));
          branchValue.textContent = e.target.value;
        });
      }

      // Branch Depth Slider
      const depthSlider = document.getElementById("branchDepth");
      const depthValue = document.getElementById("branchDepth-value");
      if (depthSlider && depthValue) {
        depthSlider.addEventListener("input", (e) => {
          setDp(parseInt(e.target.value, 10));
          depthValue.textContent = e.target.value;
        });
      }

      // Network Density Slider
      const densitySlider = document.getElementById("networkDensity");
      const densityValue = document.getElementById("networkDensity-value");
      if (densitySlider && densityValue) {
        densitySlider.addEventListener("input", (e) => {
          setDn(parseInt(e.target.value, 10));
          densityValue.textContent = e.target.value;
        });
      }

      // Sprout/Prune Balance Slider
      const sproutPruneSlider = document.getElementById("sproutPrune");
      const sproutPruneValue = document.getElementById("sproutPrune-value");
      if (sproutPruneSlider && sproutPruneValue) {
        sproutPruneSlider.addEventListener("input", (e) => {
          applyBalance(parseInt(e.target.value, 10));
          sproutPruneValue.textContent = fmtLabel();
        });
        sproutPruneSlider.value = 50; // Balanced default
        applyBalance(50);
        sproutPruneValue.textContent = fmtLabel();
      }

      // Reset Button
      const resetBtn = document.getElementById("resetSliders");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          if (simSpeedSlider) simSpeedSlider.value = 100;
          if (packetSpeedSlider) packetSpeedSlider.value = 100;
          if (attackFreqSlider) attackFreqSlider.value = 100;
          if (healSpeedSlider) healSpeedSlider.value = 100;
          if (branchSlider) branchSlider.value = DEF_BR();
          if (depthSlider) depthSlider.value = DEF_DP();
          if (densitySlider) densitySlider.value = DEF_DN();
          if (sproutPruneSlider) sproutPruneSlider.value = 50;

          // Update multipliers
          setSim(1.0);
          setPkt(1.0);
          setAtk(1.0);
          setHlr(1.0);
          setBr(DEF_BR());
          setDp(DEF_DP());
          setDn(DEF_DN());
          applyBalance(50);

          // Update display values
          if (simSpeedValue) simSpeedValue.textContent = "1.0x";
          if (packetSpeedValue) packetSpeedValue.textContent = "1.0x";
          if (attackFreqValue) attackFreqValue.textContent = "1.0x";
          if (healSpeedValue) healSpeedValue.textContent = "1.0x";
          if (branchValue) branchValue.textContent = DEF_BR();
          if (depthValue) depthValue.textContent = DEF_DP();
          if (densityValue) densityValue.textContent = DEF_DN();
          if (sproutPruneValue) sproutPruneValue.textContent = fmtLabel();
        });
      }
    },

    initializeBackgroundSelector() {
      const selector = document.getElementById("background-style");
      if (!selector) return;

      const initialBackgroundSystem = dependencies.getBackgroundSystem();
      if (initialBackgroundSystem?.activeId) {
        selector.value = initialBackgroundSystem.activeId;
      }

      selector.addEventListener("change", (e) => {
        const bs = dependencies.getBackgroundSystem();
        if (bs && typeof bs.setActive === "function") {
          bs.setActive(e.target.value);
        }
      });
    },
  };

  window.NodeNet.UIInitializers = UIInitializers;
})();
