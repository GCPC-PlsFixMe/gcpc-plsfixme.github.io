/**
 * @module CameraSystem
 * @summary Camera/zoom — auto-zoom framing, manual zoom slider, mouse-wheel zoom, and the auto-zoom toggle.
 * @exports window.NodeNet.CameraSystem
 * @tags camera, zoom, pan, auto-zoom, framing, viewport, ux
 */
(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getNodes: () => [],
    canvas: null,
    viewState: null,
  };

  function updateCamera() {
    const nodes = dependencies.getNodes();
    const canvas = dependencies.canvas;
    const viewState = dependencies.viewState;

    if (!nodes || nodes.length === 0 || !canvas || !viewState) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Calculate network bounds
    let maxNetworkDistSq = 0;
    let maxTotalDistSq = 0;

    for (const node of nodes) {
      if (node.state !== "alive") continue;

      const dx = node.x - cx;
      const dy = node.y - cy;
      const distSq = dx * dx + dy * dy;

      // Track total bounds (including satellites) for camera zoom
      if (distSq > maxTotalDistSq) maxTotalDistSq = distSq;

      // Track network bounds (excluding satellites) for orbit calculations
      if (!node.isSatellite) {
        if (distSq > maxNetworkDistSq) maxNetworkDistSq = distSq;
      }
    }

    const maxNetworkDist = Math.sqrt(maxNetworkDistSq);
    const maxTotalDist = Math.sqrt(maxTotalDistSq);

    // Update global state for satellites to use
    viewState.maxNetworkRadius = maxNetworkDist;

    // Determine target scale
    let targetScale = 1.0;

    if (viewState.isAutoZoom) {
      // AUTO ZOOM: Fit main network to screen
      // We want the furthest NON-SATELLITE node to be at most 85% of the way to the edge
      const panelOffset = viewState.isSidePanelOpen
        ? viewState.sidePanelWidth
        : 0;
      const effectiveWidth = canvas.width - panelOffset;
      const minDimension = Math.min(effectiveWidth, canvas.height) / 2;
      const fitRadius = minDimension * 0.85;

      if (maxNetworkDist > 0) {
        targetScale = fitRadius / maxNetworkDist;
      }

      // Clamp scale
      targetScale = Math.max(
        viewState.minScale,
        Math.min(viewState.maxScale, targetScale)
      );

      // Update slider to reflect auto value (visual feedback only)
      const zoomSlider = document.getElementById("zoomSlider");
      const zoomValue = document.getElementById("zoomValue");
      if (zoomSlider && zoomValue) {
        zoomSlider.value = viewState.scale.toFixed(2);
        zoomValue.textContent = viewState.scale.toFixed(1) + "x";
      }
    } else {
      // MANUAL ZOOM: Use slider value
      const zoomSlider = document.getElementById("zoomSlider");
      if (zoomSlider) {
        targetScale = parseFloat(zoomSlider.value);
      }
    }

    // Smoothly interpolate
    viewState.targetScale = targetScale;
    viewState.scale += (viewState.targetScale - viewState.scale) * 0.05;
  }

  function initializeZoomControls() {
    const viewState = dependencies.viewState;
    const canvas = dependencies.canvas;
    if (!viewState) return;

    const zoomSlider = document.getElementById("zoomSlider");
    const autoZoomCheckbox = document.getElementById("autoZoomCheckbox");
    const zoomValue = document.getElementById("zoomValue");

    if (zoomSlider) {
      zoomSlider.addEventListener("input", function () {
        // User interaction disables auto-zoom
        viewState.isAutoZoom = false;
        if (autoZoomCheckbox) autoZoomCheckbox.checked = false;

        // Update value display
        if (zoomValue)
          zoomValue.textContent = parseFloat(this.value).toFixed(1) + "x";

        // Apply zoom immediately
        viewState.targetScale = parseFloat(this.value);
      });
    }

    if (canvas && zoomSlider) {
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();

          let delta = e.deltaY;
          if (e.deltaMode === 1) delta *= 15;
          else if (e.deltaMode === 2) delta *= 100;

          const current = parseFloat(zoomSlider.value) || 1.0;
          const min = parseFloat(zoomSlider.min) || viewState.minScale;
          const max = parseFloat(zoomSlider.max) || viewState.maxScale;

          const zoomFactor = Math.exp(-delta * 0.0015);
          let next = current * zoomFactor;
          next = Math.max(min, Math.min(max, next));

          zoomSlider.value = next.toFixed(2);
          zoomSlider.dispatchEvent(new Event("input"));
        },
        { passive: false }
      );
    }

    if (autoZoomCheckbox) {
      autoZoomCheckbox.addEventListener("change", function () {
        viewState.isAutoZoom = this.checked;
      });
    }
  }

  const CameraSystem = {
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },

    updateCamera,
    initializeZoomControls,
  };

  window.NodeNet.CameraSystem = CameraSystem;
})();
