/**
 * @module Spatial
 * @summary Quadtree spatial index (Circle / Rectangle / Quadtree) for fast neighbor queries.
 * @exports window.NodeNet.Spatial, window.NodeNetSpatial
 * @tags spatial-index, quadtree, collision, neighbor-query, performance, broad-phase
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};
  // --- NEW: Quadtree Implementation for Performance Optimization ---

  // Represents a circular area for querying the quadtree
  class Circle {
    constructor(x, y, r) {
      this.x = x;
      this.y = y;
      this.r = r;
      this.rSquared = this.r * this.r;
    }

    // Check if a node is inside this circle
    contains(node) {
      let d = Math.pow(node.x - this.x, 2) + Math.pow(node.y - this.y, 2);
      return d <= this.rSquared;
    }

    // Check if this circle intersects with a rectangular boundary
    intersects(range) {
      let xDist = Math.abs(range.x - this.x);
      let yDist = Math.abs(range.y - this.y);
      let r = this.r;
      let w = range.w;
      let h = range.h;

      if (xDist > w + r || yDist > h + r) return false;
      if (xDist <= w || yDist <= h) return true;

      let cornerDistSq = Math.pow(xDist - w, 2) + Math.pow(yDist - h, 2);
      return cornerDistSq <= this.rSquared;
    }
  }

  // Represents a rectangular boundary for a quadtree quadrant
  class Rectangle {
    constructor(x, y, w, h) {
      this.x = x; // center x
      this.y = y; // center y
      this.w = w; // half-width
      this.h = h; // half-height
    }

    // Check if a node is within this boundary
    contains(node) {
      return (
        node.x >= this.x - this.w &&
        node.x < this.x + this.w &&
        node.y >= this.y - this.h &&
        node.y < this.y + this.h
      );
    }

    // Check if another rectangular boundary intersects with this one
    intersects(range) {
      return !(
        range.x - range.w > this.x + this.w ||
        range.x + range.w < this.x - this.w ||
        range.y - range.h > this.y + this.h ||
        range.y + range.h < this.y - this.h
      );
    }
  }

  // The Quadtree class for spatial partitioning
  class Quadtree {
    constructor(boundary, capacity) {
      this.boundary = boundary;
      this.capacity = capacity; // Max number of nodes in a quadrant before it subdivides
      this.nodes = [];
      this.divided = false;
    }

    // Create four sub-quadrants
    subdivide() {
      let { x, y, w, h } = this.boundary;
      let hw = w / 2;
      let hh = h / 2;

      let nw = new Rectangle(x - hw, y - hh, hw, hh);
      this.northwest = new Quadtree(nw, this.capacity);
      let ne = new Rectangle(x + hw, y - hh, hw, hh);
      this.northeast = new Quadtree(ne, this.capacity);
      let sw = new Rectangle(x - hw, y + hh, hw, hh);
      this.southwest = new Quadtree(sw, this.capacity);
      let se = new Rectangle(x + hw, y + hh, hw, hh);
      this.southeast = new Quadtree(se, this.capacity);

      this.divided = true;
    }

    // Insert a node into the quadtree
    insert(node) {
      if (!this.boundary.contains(node)) {
        return false;
      }

      if (this.nodes.length < this.capacity) {
        this.nodes.push(node);
        return true;
      }

      if (!this.divided) {
        this.subdivide();
      }

      // Pass the node down to the correct sub-quadrant
      return (
        this.northeast.insert(node) ||
        this.northwest.insert(node) ||
        this.southeast.insert(node) ||
        this.southwest.insert(node)
      );
    }

    // Find all nodes within a given range (a Circle)
    query(range, found) {
      if (!found) {
        found = [];
      }

      if (!range.intersects(this.boundary)) {
        return found;
      }

      for (let n of this.nodes) {
        if (range.contains(n)) {
          found.push(n);
        }
      }

      if (this.divided) {
        this.northwest.query(range, found);
        this.northeast.query(range, found);
        this.southwest.query(range, found);
        this.southeast.query(range, found);
      }

      return found;
    }
  }

  window.NodeNet.Spatial = { Circle, Rectangle, Quadtree };
  window.NodeNetSpatial = window.NodeNet.Spatial;
})();
