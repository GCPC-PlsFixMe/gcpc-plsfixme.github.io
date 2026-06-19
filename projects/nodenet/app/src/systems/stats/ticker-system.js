/**
 * @module TickerSystem
 * @summary News ticker — queues event headlines and periodic runtime stats for the scrolling ribbon.
 * @exports window.NodeNet.TickerSystem
 * @tags ticker, news, headlines, ribbon, stats, marquee, ux
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  const dependencies = {
    getStatTypes: () => [],
  };

  // Ticker System
  const TickerSystem = {
    /**
     * Connect runtime stat providers owned by nodenet-app.js.
     */
    configure(options = {}) {
      Object.assign(dependencies, options);
      return this;
    },
    container: null,
    queue: [],
    activeItems: [],
    speed: 1.0, // Pixels per frame
    lastStatTime: 0,
    STAT_INTERVAL: 5000, // Show a stat every 5 seconds if quiet

    init() {
      this.container = document.getElementById("newsTicker");
      // Initial welcome message
      this.add(
        "NodeNet Visualization System Online - Monitoring Network Traffic...",
        "info"
      );
    },

    add(text, type = "info") {
      // Prevent queue flooding - keep only the most recent 3 items
      if (this.queue.length >= 3) {
        this.queue.shift();
      }
      this.queue.push({ text, type });
    },

    update() {
      if (!this.container) return;

      // Move existing items
      for (let i = this.activeItems.length - 1; i >= 0; i--) {
        const item = this.activeItems[i];
        item.x -= this.speed;
        item.el.style.transform = `translateX(${item.x}px)`;

        // Remove if off-screen (left)
        if (item.x + item.width < -50) {
          item.el.remove();
          this.activeItems.splice(i, 1);
        }
      }

      // Check if we need to spawn a new item
      const lastItem = this.activeItems[this.activeItems.length - 1];
      const containerWidth = this.container.clientWidth;

      // Determine where the right edge of the last item is
      // If no items, right edge is effectively negative infinity (spawn immediately)
      // But we want to spawn at the right edge of the container
      const rightEdgeOfLastItem = lastItem
        ? lastItem.x + lastItem.width
        : -1000;

      // Gap between items
      const gap = 50;

      // If the last item has moved far enough left to leave a gap...
      if (rightEdgeOfLastItem < containerWidth - gap) {
        // Try to get next item from queue
        let nextData = this.queue.shift();

        // If queue is empty, check if we should show a random stat
        if (
          !nextData &&
          Date.now() - this.lastStatTime > this.STAT_INTERVAL
        ) {
          nextData = this.getRandomStat();
          this.lastStatTime = Date.now();
        }

        if (nextData) {
          this.spawn(nextData);
        }
      }
    },

    spawn(data) {
      const el = document.createElement("div");
      el.className = `ticker-item ticker-${data.type}`;

      // Icon mapping
      let icon = "ℹ️";
      if (data.type === "critical") icon = "🚨";
      else if (data.type === "warning") icon = "⚠️";
      else if (data.type === "attack") icon = "⚔️";
      else if (data.type === "defense") icon = "🛡️";
      else if (data.type === "success") icon = "✅";
      else if (data.type === "stat") icon = "📊";

      el.innerHTML = `
        <span class="ticker-label">${icon} ${data.type.toUpperCase()}</span>
        <span class="ticker-msg">${data.text}</span>
      `;

      this.container.appendChild(el);

      // Measure width
      const width = el.offsetWidth;
      const startX = this.container.clientWidth;

      // Position initially
      el.style.transform = `translateX(${startX}px)`;

      this.activeItems.push({
        el,
        x: startX,
        width,
        type: data.type,
      });
    },

    getRandomStat() {
      const statTypes = dependencies.getStatTypes();
      if (!statTypes.length) return null;
      const randomStat =
        statTypes[Math.floor(Math.random() * statTypes.length)];
      return {
        text: `${randomStat.label}: ${randomStat.val}`,
        type: "stat",
      };
    },
  };

  window.NodeNet.TickerSystem = TickerSystem;
})();
