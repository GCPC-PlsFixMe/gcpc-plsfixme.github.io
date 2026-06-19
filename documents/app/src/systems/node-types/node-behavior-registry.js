/**
 * @module NodeBehaviorRegistry
 * @summary Ordered registry + dispatch so the Node class delegates drawing/behaviour per node type (no giant if/else).
 * @description Register more-specific types before general ones — first match wins.
 * @exports window.NodeNet.NodeBehaviorRegistry
 * @tags node-behavior, registry, dispatch, strategy, draw, node-types, polymorphism
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /** @type {Array<{ name: string, matches: (node: Node) => boolean, drawIcon: Function, drawEffects: Function, drawBody: Function|null }>} */
  const behaviors = [];

  let ctx = null;
  let colors = null;
  let CONFIG = null;
  let nodesRef = () => [];
  let centralImpactShakeOffsetX = () => 0;
  let centralImpactShakeOffsetY = () => 0;
  let healSpeedMultiplier = () => 1;
  let canvasRef = null;

  /**
   * Configure global dependencies shared by all behavior modules.
   * @param {object} deps
   */
  function configure(deps = {}) {
    if (deps.ctx !== undefined) ctx = deps.ctx;
    if (deps.colors !== undefined) colors = deps.colors;
    if (deps.CONFIG !== undefined) CONFIG = deps.CONFIG;
    if (deps.getNodes !== undefined) nodesRef = deps.getNodes;
    if (deps.getCentralImpactShakeOffsetX !== undefined) centralImpactShakeOffsetX = deps.getCentralImpactShakeOffsetX;
    if (deps.getCentralImpactShakeOffsetY !== undefined) centralImpactShakeOffsetY = deps.getCentralImpactShakeOffsetY;
    if (deps.getHealSpeedMultiplier !== undefined) healSpeedMultiplier = deps.getHealSpeedMultiplier;
    if (deps.canvas !== undefined) canvasRef = deps.canvas;
  }

  /**
   * Register a behavior module. Modules are checked in registration order
   * (first match wins), so register more-specific types before general ones.
   * @param {{ name: string, matches: Function, drawIcon: Function, drawEffects: Function, drawBody?: Function }} behavior
   */
  function register(behavior) {
    if (!behavior || typeof behavior.matches !== "function") {
      console.warn("[NodeBehaviorRegistry] Skipping invalid behavior registration:", behavior);
      return;
    }
    // Avoid duplicates
    const existing = behaviors.findIndex((b) => b.name === behavior.name);
    if (existing !== -1) {
      behaviors[existing] = behavior;
    } else {
      behaviors.push(behavior);
    }
  }

  /**
   * Find the first behavior whose `matches(node)` returns true.
   * @param {object} node
   * @returns {object|null}
   */
  function getBehavior(node) {
    for (let i = 0; i < behaviors.length; i++) {
      if (behaviors[i].matches(node)) {
        return behaviors[i];
      }
    }
    return null;
  }

  /**
   * @returns {CanvasRenderingContext2D}
   */
  function getCtx() { return ctx; }

  /**
   * @returns {object}
   */
  function getColors() { return colors; }

  /**
   * @returns {object}
   */
  function getConfig() { return CONFIG; }

  /**
   * @returns {Array}
   */
  function getNodes() { return typeof nodesRef === "function" ? nodesRef() : []; }

  /**
   * @returns {number}
   */
  function getCentralImpactShakeOffsetX() { return typeof centralImpactShakeOffsetX === "function" ? centralImpactShakeOffsetX() : 0; }

  /**
   * @returns {number}
   */
  function getCentralImpactShakeOffsetY() { return typeof centralImpactShakeOffsetY === "function" ? centralImpactShakeOffsetY() : 0; }

  /**
   * @returns {number}
   */
  function getHealSpeedMultiplier() { return typeof healSpeedMultiplier === "function" ? healSpeedMultiplier() : 1; }

  /**
   * @returns {HTMLCanvasElement|null}
   */
  function getCanvas() { return canvasRef; }

  window.NodeNet.NodeBehaviorRegistry = {
    configure,
    register,
    getBehavior,
    getCtx,
    getColors,
    getConfig,
    getNodes,
    getCentralImpactShakeOffsetX,
    getCentralImpactShakeOffsetY,
    getHealSpeedMultiplier,
    getCanvas,
  };
})();