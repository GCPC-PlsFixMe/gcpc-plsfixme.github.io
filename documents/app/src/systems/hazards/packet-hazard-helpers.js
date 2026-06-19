/**
 * @module PacketHazardHelpers
 * @summary Glue between hazard systems (sinkhole, route-hijacker) and packet systems.
 * @description Extracted from the coordinator to keep hazard application logic together;
 *   configured with the active hazard instances via `configure(deps)`.
 * @exports window.NodeNet.PacketHazardHelpers
 * @tags hazard-helpers, sinkhole, route-hijacker, packet, glue, coordination
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  let _sinkholeSystem = null;
  let _routeHijackerSystem = null;
  let _getGlobalDeltaSeconds = () => 0.016;
  let _incrementStat = () => {};

  function configure(deps = {}) {
    if (deps.sinkholeSystem !== undefined) _sinkholeSystem = deps.sinkholeSystem;
    if (deps.routeHijackerSystem !== undefined) _routeHijackerSystem = deps.routeHijackerSystem;
    if (deps.getGlobalDeltaSeconds !== undefined) _getGlobalDeltaSeconds = deps.getGlobalDeltaSeconds;
    if (deps.incrementStat !== undefined) _incrementStat = deps.incrementStat;
    return this;
  }

  function markPacketConsumedBySinkhole(packet, packetType) {
    if (!packet) return;
    packet.consumedBySinkhole = true;

    if (packetType === "data" || packetType === "immunity") {
      packet.active = false;
    } else {
      packet.state = "finished";
    }

    if (packetType === "immunity" && packet.attachedNode) {
      const attachedIndex =
        packet.attachedNode.attachedImmunityPackets.indexOf(packet);
      if (attachedIndex !== -1) {
        packet.attachedNode.attachedImmunityPackets.splice(attachedIndex, 1);
      }
    }

    if (packetType === "dispatch" && packet.target) {
      packet.target.isTargeted = false;
    }

    if (
      packetType === "pingOfDeath" &&
      packet.source &&
      packet.source.activePingOfDeath === packet
    ) {
      packet.source.activePingOfDeath = null;
    }
  }

  function applySinkholeToPacket(packet, packetType) {
    if (!_sinkholeSystem || !packet || packet.consumedBySinkhole) return false;
    const consumed = _sinkholeSystem.applyToPacket(
      packet,
      packetType,
      _getGlobalDeltaSeconds()
    );
    if (!consumed) return false;

    _incrementStat("packetsConsumedBySinkhole");
    markPacketConsumedBySinkhole(packet, packetType);
    return true;
  }

  function applyRouteHijackerToPacket(packet) {
    if (!_routeHijackerSystem || !packet) return;
    const result = _routeHijackerSystem.applyToPacket(
      packet,
      _getGlobalDeltaSeconds()
    );
    if (!result) return;

    if (result.started) {
      _incrementStat("routeHijacks");
    }
    if (result.blocked) {
      _incrementStat("routeHijacksBlocked");
    }
    if (result.rerouted || result.corrupted || result.dropped) {
      _incrementStat("packetsRerouted");
    }
    if (result.corrupted) {
      _incrementStat("routeCorruptedPackets");
    }
    if (result.dropped) {
      _incrementStat("packetsDropped");
    }
  }

  window.NodeNet.PacketHazardHelpers = {
    configure,
    markPacketConsumedBySinkhole,
    applySinkholeToPacket,
    applyRouteHijackerToPacket,
  };
})();
