/**
 * @module NetworkStorms
 * @summary Visual storm overlays — organic glitch/cascade effects over compromised node clusters.
 * @exports window.NodeNet.NetworkStorms
 * @tags network-storms, glitch, cascade, visual, overlay, compromised, vfx
 */

(function () {
  "use strict";

  window.NodeNet = window.NodeNet || {};

  // Network Storms System
  const NetworkStorms = {
    storms: [],
    droplets: [], 
    lastUpdate: Date.now(),
    deltaSeconds: 0,

    init() {
        for(let i=0; i<400; i++) {
            this.droplets.push({
                active: false,
                x: 0, y: 0,
                speed: 0,
                char: '',
                life: 0,
                maxLife: 1,
                storm: null
            });
        }
    },

    update(now, nodes) {
        this.deltaSeconds = Math.min(0.05, (now - this.lastUpdate) / 1000) || 0.016;
        this.lastUpdate = now;

        // DBSCAN-style spatial clustering: group nodes within CLUSTER_DIST of any cluster member.
        // This replaces the grid-cell approach which failed when nodes were spread across cells.
        const CLUSTER_DIST = 200; // px — nodes within this distance join the same cluster

        const infectedPool = [];
        const downPool = [];
        for (const node of nodes) {
            if (node.state !== 'alive' || node.isSatellite || node.parent === null) continue;
            if (node.status === 'malware' || node.status === 'botnet' || node.status === 'commandControl') {
                infectedPool.push(node);
            } else if (node.status === 'red' || node.status === 'yellow') {
                downPool.push(node);
            }
        }

        /**
         * Groups nodeList into spatially connected clusters.
         * Two nodes belong to the same cluster if any member of the cluster is within CLUSTER_DIST.
         */
        const buildClusters = (nodeList) => {
            if (nodeList.length === 0) return [];
            const clusters = [];
            const assigned = new Set();
            for (let i = 0; i < nodeList.length; i++) {
                if (assigned.has(i)) continue;
                const cluster = [nodeList[i]];
                assigned.add(i);
                // Expand: repeatedly sweep for unassigned nodes close to any cluster member
                let expanded = true;
                while (expanded) {
                    expanded = false;
                    for (let j = 0; j < nodeList.length; j++) {
                        if (assigned.has(j)) continue;
                        for (const m of cluster) {
                            if (Math.hypot(m.x - nodeList[j].x, m.y - nodeList[j].y) <= CLUSTER_DIST) {
                                cluster.push(nodeList[j]);
                                assigned.add(j);
                                expanded = true;
                                break;
                            }
                        }
                    }
                }
                clusters.push(cluster);
            }
            return clusters;
        };

        /**
         * Computes centroid + bounding radius for a cluster and returns a storm target.
         */
        const makeStorm = (cluster, type) => {
            let cx = 0, cy = 0;
            for (const n of cluster) { cx += n.x; cy += n.y; }
            cx /= cluster.length;
            cy /= cluster.length;
            let maxDist = 0;
            for (const n of cluster) {
                const d = Math.hypot(n.x - cx, n.y - cy);
                if (d > maxDist) maxDist = d;
            }
            // Tight hug: node radius (~14px) + small padding so the aura just clears the node
            const radius = Math.max(35, Math.min(200, maxDist + 28));
            const intensity = Math.min(1, cluster.length / 5);
            return { x: cx, y: cy, type, targetIntensity: intensity, radius };
        };

        let targetStorms = [];

        // Cascade storms from infected/botnet/C&C clusters
        for (const cluster of buildClusters(infectedPool)) {
            targetStorms.push(makeStorm(cluster, 'cascade'));
        }

        // Glitch storms from red/yellow clusters (need at least 2 nodes to avoid single-node noise)
        for (const cluster of buildClusters(downPool)) {
            if (cluster.length >= 2) targetStorms.push(makeStorm(cluster, 'glitch'));
        }

        // Match targets to existing storms
        for (const storm of this.storms) {
            storm.matched = false;
        }

        for (const target of targetStorms) {
            let bestMatch = null;
            let bestDist = 200; // Match within 200px

            for (const storm of this.storms) {
                if (!storm.matched && storm.type === target.type) {
                    const dist = Math.hypot(storm.x - target.x, storm.y - target.y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestMatch = storm;
                    }
                }
            }

            if (bestMatch) {
                bestMatch.matched = true;
                bestMatch.targetX = target.x;
                bestMatch.targetY = target.y;
                bestMatch.targetIntensity = target.targetIntensity;
                bestMatch.targetRadius = target.radius;
            } else {
                this.storms.push({
                    x: target.x, y: target.y,
                    targetX: target.x, targetY: target.y,
                    type: target.type,
                    intensity: 0,
                    targetIntensity: target.targetIntensity,
                    radius: target.radius,
                    targetRadius: target.radius,
                    matched: true,
                    seed: Math.random() * 1000
                });
            }
        }

        // Update storms
        for (let i = this.storms.length - 1; i >= 0; i--) {
            const storm = this.storms[i];
            if (!storm.matched) {
                storm.targetIntensity = 0;
            }

            // Lerp position, intensity, radius
            storm.x += (storm.targetX - storm.x) * 0.1;
            storm.y += (storm.targetY - storm.y) * 0.1;
            if (storm.targetRadius !== undefined) {
                storm.radius += (storm.targetRadius - storm.radius) * 0.1;
            }

            if (storm.intensity < storm.targetIntensity) {
                storm.intensity = Math.min(storm.targetIntensity, storm.intensity + 0.05);
            } else {
                storm.intensity = Math.max(storm.targetIntensity, storm.intensity - 0.05);
            }

            if (storm.intensity <= 0.01 && !storm.matched) {
                this.storms.splice(i, 1);
            }
        }
    },

    /**
     * Returns the organic blob radius at a given angle and time.
     * Multiple sine harmonics at different frequencies create a fluid, amoeba-like shape.
     * @param {number} baseR - base storm radius
     * @param {number} angle - angle in radians
     * @param {number} t    - time in seconds (from now * 0.001)
     */
    _blobR(baseR, angle, t) {
        return baseR * (
            1.0
            + 0.20 * Math.sin(2 * angle + t * 0.45)
            + 0.13 * Math.sin(3 * angle - t * 0.65)
            + 0.07 * Math.sin(5 * angle + t * 0.28)
            + 0.05 * Math.sin(7 * angle - t * 0.38)
        );
    },

    draw(ctx, now, deltaSeconds) {
        if (this.storms.length === 0 && !this.droplets.some(d => d.active)) return;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Draw Auras and Effects
        for (const storm of this.storms) {
            if (storm.intensity <= 0) continue;

            if (storm.type === 'glitch') {
                this.drawGlitchStorm(ctx, storm, now, deltaSeconds);
            } else if (storm.type === 'cascade') {
                this.drawDataCascadeAura(ctx, storm, now, deltaSeconds);
            }
        }

        // Draw Droplets (Data Cascade)
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const chars = "0123456789ABCDEF!@#$%^&*";
        for (const droplet of this.droplets) {
            if (!droplet.active) continue;

            // Only advance life if we passed deltaSeconds (unpaused)
            if (deltaSeconds > 0) {
                droplet.life += deltaSeconds;
                droplet.y += droplet.speed * deltaSeconds;

                // Randomly change char
                if (Math.random() < 0.1) {
                    droplet.char = chars[Math.floor(Math.random() * chars.length)];
                }
            }

            const stormRef = droplet.storm;
            if (!stormRef) {
                droplet.active = false;
                continue;
            }

            // Deactivate if droplet has drifted outside the blob boundary
            const _rdx = droplet.x - stormRef.x;
            const _rdy = droplet.y - stormRef.y;
            const _radialDist = Math.sqrt(_rdx * _rdx + _rdy * _rdy);
            const _dropAngle = Math.atan2(_rdy, _rdx);
            const _blobBound = this._blobR(stormRef.radius, _dropAngle, now * 0.001);
            if (_radialDist > _blobBound) {
                droplet.active = false;
                continue;
            }

            const progress = droplet.life / droplet.maxLife;
            if (progress >= 1 || stormRef.intensity <= 0) {
                droplet.active = false;
                continue;
            }

            // Fade in and out
            let alpha = 1;
            if (progress < 0.08) alpha = progress / 0.08;
            else if (progress > 0.6) alpha = (1 - progress) / 0.4;

            // Radial fade: smooth falloff from center → edge (quadratic curve)
            const _radialFade = Math.max(0, 1 - Math.pow(_radialDist / stormRef.radius, 1.8));
            alpha *= _radialFade;

            alpha *= stormRef.intensity * 0.9;

            ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`; // purple-500
            ctx.fillText(droplet.char, droplet.x, droplet.y);

            // Trail
            ctx.fillStyle = `rgba(168, 85, 247, ${alpha * 0.4})`;
            ctx.fillText(droplet.char, droplet.x, droplet.y - 15);
            ctx.fillStyle = `rgba(168, 85, 247, ${alpha * 0.15})`;
            ctx.fillText(droplet.char, droplet.x, droplet.y - 30);
        }

        ctx.restore();
    },

    drawGlitchStorm(ctx, storm, now, deltaSeconds) {
        const alpha = storm.intensity * 0.7;
        const r = storm.radius;

        // Dark aura
        const grad = ctx.createRadialGradient(storm.x, storm.y, 0, storm.x, storm.y, r);
        grad.addColorStop(0, `rgba(220, 38, 38, ${alpha * 0.4})`); // Slightly stronger core
        grad.addColorStop(0.6, `rgba(139, 0, 0, ${alpha * 0.2})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(storm.x, storm.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Static Interference Effect (Horizontal lines + noise)
        const staticCount = Math.floor(storm.intensity * 25);
        for (let i = 0; i < staticCount; i++) {
            if (Math.random() > 0.3) continue;
            const sx = storm.x + (Math.random() - 0.5) * r * 1.8;
            const sy = storm.y + (Math.random() - 0.5) * r * 1.8;

            // Horizontal scan line segment or noise dot
            if (Math.random() > 0.5) {
                const w = Math.random() * 40 + 10;
                const h = 1; 
                ctx.fillStyle = `rgba(200, 200, 200, ${Math.random() * 0.3 * alpha})`;
                ctx.fillRect(sx, sy, w, h);
            } else {
                ctx.fillStyle = Math.random() > 0.5 ? `rgba(255, 255, 255, ${Math.random() * alpha})` : `rgba(220, 38, 38, ${Math.random() * alpha})`;
                ctx.fillRect(sx, sy, 2, 2);
            }
        }

        // Fewer, "fail" lightning arcs
        const numArcs = Math.max(0, Math.floor(storm.intensity * 2.0)); 
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < numArcs; i++) {
            if (Math.random() > 0.7) continue; // Fail/Flicker very often

            const angle1 = Math.random() * Math.PI * 2;
            const dist1 = Math.random() * r * 0.5;
            const x1 = storm.x + Math.cos(angle1) * dist1;
            const y1 = storm.y + Math.sin(angle1) * dist1;

            const angle2 = angle1 + (Math.random() - 0.5) * Math.PI * 1.5;
            const dist2 = dist1 + Math.random() * r * 0.6;
            const x2 = storm.x + Math.cos(angle2) * dist2;
            const y2 = storm.y + Math.sin(angle2) * dist2;

            ctx.beginPath();
            ctx.moveTo(x1, y1);

            // Jagged, erratic path with fewer steps
            const steps = Math.floor(Math.random() * 3) + 2;
            let curX = x1, curY = y1;
            for (let j = 1; j <= steps; j++) {
                const t = j / steps;
                const targetX = x1 + (x2 - x1) * t;
                const targetY = y1 + (y2 - y1) * t;
                curX = targetX + (Math.random() - 0.5) * 40;
                curY = targetY + (Math.random() - 0.5) * 40;
                ctx.lineTo(curX, curY);
            }

            // Faint/Failing appearance
            ctx.strokeStyle = Math.random() > 0.5 ? `rgba(248, 113, 113, ${alpha * 0.7})` : `rgba(255, 255, 255, ${alpha * 0.5})`;
            ctx.lineWidth = Math.random() * 1.2 + 0.5;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 8;
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Glitch blocks
        const numBlocks = Math.floor(storm.intensity * 8);
        for (let i = 0; i < numBlocks; i++) {
            if (Math.random() > 0.2) continue;
            const bx = storm.x + (Math.random() - 0.5) * r * 1.4;
            const by = storm.y + (Math.random() - 0.5) * r * 1.4;
            const bw = Math.random() * 40 + 10;
            const bh = Math.random() * 6 + 2;

            ctx.fillStyle = Math.random() > 0.5 ? `rgba(220, 38, 38, ${alpha * 0.5})` : `rgba(0, 0, 0, ${alpha * 0.6})`;
            ctx.fillRect(bx, by, bw, bh);
        }
    },

    drawDataCascadeAura(ctx, storm, now, deltaSeconds) {
        const alpha = storm.intensity * 0.8;
        const r = storm.radius;

        // Purple/Malware aura — blob-shaped path using organic radius deformation
        const grad = ctx.createRadialGradient(storm.x, storm.y, 0, storm.x, storm.y, r * 1.25);
        grad.addColorStop(0,   `rgba(168, 85, 247, ${alpha * 0.35})`);
        grad.addColorStop(0.5, `rgba(100, 40, 180, ${alpha * 0.2})`);
        grad.addColorStop(1,   'rgba(0, 0, 0, 0)');

        const t = now * 0.001;
        const nPts = 64;
        ctx.beginPath();
        for (let i = 0; i <= nPts; i++) {
            const a = (i / nPts) * Math.PI * 2;
            const br = this._blobR(r, a, t);
            const px = storm.x + Math.cos(a) * br;
            const py = storm.y + Math.sin(a) * br;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Spawn droplets only if we are advancing time
        if (deltaSeconds > 0) {
            const spawnCount = Math.floor(storm.intensity * 8);
            for (let i = 0; i < spawnCount; i++) {
                if (Math.random() > 0.3) continue;
                const droplet = this.droplets.find(d => !d.active);
                if (droplet) {
                    droplet.active = true;
                    // Blob-aware spawn: pick angle, get blob radius at that angle,
                    // then place droplet uniformly within that radius (sqrt = even disk)
                    const spawnAngle = Math.random() * Math.PI * 2;
                    const spawnBlobR = this._blobR(r, spawnAngle, t);
                    const spawnDist  = Math.sqrt(Math.random()) * spawnBlobR * 0.88;
                    droplet.x = storm.x + Math.cos(spawnAngle) * spawnDist;
                    droplet.y = storm.y + Math.sin(spawnAngle) * spawnDist;
                    droplet.speed = Math.random() * 100 + 60; // px per second
                    const chars = "0123456789ABCDEF!@#$%^&*";
                    droplet.char = chars[Math.floor(Math.random() * chars.length)];
                    droplet.life = 0;
                    droplet.maxLife = Math.random() * 0.9 + 1.0;
                    droplet.storm = storm;
                }
            }
        }
    }
  };
  NetworkStorms.init();

  window.NodeNet.NetworkStorms = NetworkStorms;
})();
