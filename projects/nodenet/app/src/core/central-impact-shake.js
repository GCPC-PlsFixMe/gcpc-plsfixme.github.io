/**
 * @module CentralImpactShake
 * @summary Screen-shake state triggered by background comet impacts on the central node.
 * @exports window.NodeNet.CentralImpactShake
 * @tags screen-shake, camera, comet, impact, central-node, juice, feedback
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  let ParticleSystem = null;

  let centralImpactShake = 0;
  let centralImpactShakePhase = 0;
  let centralImpactShakeOffsetX = 0;
  let centralImpactShakeOffsetY = 0;

  function configure(deps = {}) {
    if (deps.ParticleSystem !== undefined) ParticleSystem = deps.ParticleSystem;
    return this;
  }

  function trigger(centralNode, color) {
    if (!centralNode) return;
    if (ParticleSystem) {
      ParticleSystem.createPopParticles(centralNode.x, centralNode.y, color);
    }
    centralImpactShake = Math.min(centralImpactShake + 8, 24);
    centralImpactShakePhase = Math.random() * Math.PI * 2;
    centralImpactShakeOffsetX = 0;
    centralImpactShakeOffsetY = 0;
  }

  function update(deltaSeconds) {
    if (centralImpactShake > 0.0001) {
      centralImpactShake = Math.max(0, centralImpactShake - deltaSeconds * 10);
      centralImpactShakePhase += deltaSeconds * 20;
      const magnitude = centralImpactShake;
      centralImpactShakeOffsetX = Math.sin(centralImpactShakePhase) * magnitude;
      centralImpactShakeOffsetY =
        Math.cos(centralImpactShakePhase * 1.3) * magnitude * 0.8;
      return;
    }

    centralImpactShake = 0;
    centralImpactShakeOffsetX = 0;
    centralImpactShakeOffsetY = 0;
  }

  function getOffsetX() {
    return centralImpactShakeOffsetX;
  }

  function getOffsetY() {
    return centralImpactShakeOffsetY;
  }

  window.NodeNet.CentralImpactShake = {
    configure,
    trigger,
    update,
    getOffsetX,
    getOffsetY,
  };
})();
