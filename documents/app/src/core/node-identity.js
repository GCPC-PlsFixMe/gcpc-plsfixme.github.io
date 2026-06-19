/**
 * @module NodeIdentity
 * @summary Generates unique MAC-like addresses and randomized "friendly" names for nodes.
 * @description Replaces the legacy numeric/timestamp node id system. Every node gets a
 *   locally-administered, unicast MAC-style address (e.g. "0A:1B:2C:3D:4E:5F") that is
 *   guaranteed unique within the running session, plus a memorable friendly name drawn
 *   from leetspeak, Gen Z slang, meme, and technology dictionaries (e.g. "RizzCanary7",
 *   "H0tD0g3"). Friendly names help operators identify nodes at a glance in logs and the
 *   hover info card.
 * @exports window.NodeNet.NodeIdentity
 * @tags node, identity, mac-address, friendly-name, dictionary, leetspeak, naming
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  /* ── uniqueness registries ─────────────────────────────────────────────
   * We keep Sets of every MAC and friendly name handed out this session so we
   * never issue a duplicate. node.id is used as an identity key in Sets/Maps
   * across many systems, so collisions would silently merge two nodes. */
  const usedMacs = new Set();
  const usedNames = new Set();

  /* ── dictionaries ──────────────────────────────────────────────────────
   * adjectives: Gen Z slang / meme / vibe words.
   * nouns: technology + meme creature/object words.
   * Names are assembled as <Adjective><Noun><digit?> and optionally leetspeak'd. */
  const ADJECTIVES = [
    "Rizz", "Sigma", "Based", "Cringe", "Sus", "Bussin", "Goated", "Sheesh",
    "Drip", "Mid", "Vibey", "Lit", "Savage", "Yeet", "Cap", "NoCap",
    "Sticc", "Thicc", "Chonky", "Smol", "Dank", "Spicy", "Cursed", "Blessed",
    "Pog", "Epic", "Glitchy", "Turbo", "Mega", "Ultra", "Hyper", "Quantum",
    "Cyber", "Pixel", "Neon", "Retro", "Phantom", "Shadow", "Frosty", "Toasty",
    "Sneaky", "Zoomer", "Boomer", "Gigachad", "Skibidi", "Gyatt", "Fanum",
    "Wholesome", "Feral", "Unhinged", "Galaxy", "Cosmic", "Astral", "Hollow",
  ];

  const NOUNS = [
    "Canary", "Daemon", "Kernel", "Router", "Packet", "Socket", "Cache",
    "Cookie", "Token", "Proxy", "Gateway", "Firewall", "Honeypot", "Botnet",
    "Worm", "Trojan", "Phisher", "Sniffer", "Crawler", "Spider", "Node",
    "Server", "Cluster", "Shard", "Buffer", "Stack", "Queue", "Thread",
    "Doge", "Pepe", "Chad", "Nyan", "Grumpy", "HotDog", "Nugget", "Waffle",
    "Goblin", "Gremlin", "Raptor", "Falcon", "Kraken", "Yeti", "Phoenix",
    "Beacon", "Relay", "Bridge", "Tunnel", "Vault", "Sentinel", "Warden",
    "Pinger", "Cipher", "Hashbrown", "Bitlord", "Netrunner", "Datamoth",
  ];

  /* Leetspeak substitution table — applied probabilistically so some names read
   * cleanly ("RizzCanary7") and others get the classic l33t treatment ("H0tD0g3"). */
  const LEET_MAP = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", b: "8", g: "9" };

  /**
   * Pick a random element from an array.
   * @param {Array} arr
   * @returns {*}
   */
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Apply leetspeak substitutions to a string. Each eligible character has an
   * independent chance to be swapped so output varies between subtle and heavy.
   * @param {string} str
   * @param {number} chance per-character substitution probability (0..1)
   * @returns {string}
   */
  function leetify(str, chance) {
    let out = "";
    for (const ch of str) {
      const lower = ch.toLowerCase();
      if (LEET_MAP[lower] && Math.random() < chance) {
        out += LEET_MAP[lower];
      } else {
        out += ch;
      }
    }
    return out;
  }

  /**
   * Generate a unique locally-administered, unicast MAC-style address.
   * The first octet has bit 1 set (locally administered) and bit 0 cleared
   * (unicast) so the address looks like a legitimate device MAC.
   * @returns {string} e.g. "0A:1B:2C:3D:4E:5F"
   */
  function generateMac() {
    // Guard against the (astronomically unlikely) exhaustion / collision loop.
    for (let attempt = 0; attempt < 1000; attempt++) {
      const octets = new Array(6);
      // First octet: force locally-administered (|2) and unicast (& ~1).
      octets[0] = (Math.floor(Math.random() * 256) | 0x02) & 0xfe;
      for (let i = 1; i < 6; i++) {
        octets[i] = Math.floor(Math.random() * 256);
      }
      const mac = octets
        .map((o) => o.toString(16).toUpperCase().padStart(2, "0"))
        .join(":");
      if (!usedMacs.has(mac)) {
        usedMacs.add(mac);
        return mac;
      }
    }
    // Fallback: timestamp-derived pseudo-MAC (still registered for uniqueness).
    const fallback = "FE:ED:" +
      Date.now().toString(16).toUpperCase().slice(-8).padStart(8, "0").match(/.{2}/g).join(":");
    usedMacs.add(fallback);
    return fallback;
  }

  /**
   * Generate a unique, memorable friendly name from the slang/tech dictionaries.
   * Roughly half the time the name gets a trailing digit and/or leetspeak.
   * @returns {string} e.g. "RizzCanary7", "H0tD0g3", "SigmaKernel"
   */
  function generateFriendlyName() {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let name = pick(ADJECTIVES) + pick(NOUNS);

      // ~55% of names get a trailing digit for extra disambiguation/flavor.
      if (Math.random() < 0.55) {
        name += Math.floor(Math.random() * 10);
      }

      // ~45% of names get leetspeak'd; intensity varies per name.
      if (Math.random() < 0.45) {
        name = leetify(name, 0.4 + Math.random() * 0.4);
      }

      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    // Fallback: guaranteed-unique suffix.
    const fallback = "Node" + (usedNames.size + 1);
    usedNames.add(fallback);
    return fallback;
  }

  /**
   * Register an externally-supplied identity (e.g. restored from a saved state)
   * so future generation never collides with it.
   * @param {string} [mac]
   * @param {string} [name]
   */
  function register(mac, name) {
    if (mac) usedMacs.add(mac);
    if (name) usedNames.add(name);
  }

  window.NodeNet.NodeIdentity = {
    generateMac,
    generateFriendlyName,
    register,
  };
})();
