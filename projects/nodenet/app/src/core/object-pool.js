/**
 * @module ObjectPool
 * @summary Generic object pool — reuse objects instead of allocating, to cut GC pressure.
 * @exports window.NodeNet.ObjectPool, window.NodeNetObjectPool
 * @tags object-pool, pooling, gc, performance, memory, reuse, particles
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};
  // ============================================================================
  // OBJECT POOL SYSTEM - Reuse objects to reduce GC pressure
  // ============================================================================
  /**
   * Generic object pool for reusing objects instead of creating/destroying
   * @param {Function} factory - Function to create new objects
   * @param {Function} reset - Function to reset object state for reuse
   * @param {number} initialSize - Initial pool size
   */
  class ObjectPool {
    constructor(factory, reset, initialSize = 20) {
      this.factory = factory;
      this.reset = reset;
      this.pool = [];
      this.active = new Set();

      // Pre-populate pool
      for (let i = 0; i < initialSize; i++) {
        this.pool.push(this.factory());
      }
    }

    /**
     * Get an object from the pool (or create new if empty)
     * @param {...any} args - Arguments to pass to reset function
     * @returns {Object} - Pooled or new object
     */
    acquire(...args) {
      let obj;
      if (this.pool.length > 0) {
        obj = this.pool.pop();
      } else {
        obj = this.factory();
      }
      this.reset(obj, ...args);
      this.active.add(obj);
      return obj;
    }

    /**
     * Return an object to the pool for reuse
     * @param {Object} obj - Object to release
     */
    release(obj) {
      if (this.active.has(obj)) {
        this.active.delete(obj);
        this.pool.push(obj);
      }
    }

    /**
     * Release all active objects back to pool
     */
    releaseAll() {
      this.active.forEach(obj => this.pool.push(obj));
      this.active.clear();
    }

    /**
     * Get pool statistics
     */
    getStats() {
      return {
        available: this.pool.length,
        active: this.active.size,
        total: this.pool.length + this.active.size,
      };
    }
  }

  window.NodeNet.ObjectPool = ObjectPool;
  window.NodeNetObjectPool = ObjectPool;
})();
