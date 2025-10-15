// Node Graph Animation
class NodeGraph {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nodes = [];
        this.lines = [];
        this.mouse = { x: null, y: null };
        this.resizeTimeout = null;
        this.nodeIdCounter = 0;
        this.ufoFrames = this.createUFOFrames();
        this.ufoFrameHeight = this.ufoFrames[0] ? this.ufoFrames[0].length : 0;
        this.ufoBeamRow = this.findBeamOriginRow();
        this.ufo = null;
        this.abductionCount = 0;
        this.rainbowClusters = [];
        this.rainbowHue = 0;
        
        this.init();
    }

    init() {
        this.resizeCanvas();
        this.createNodes();
        this.ufo = this.createUFO(this.ufo);
        this.animate();
        
        // Event listeners
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.resizeCanvas();
                this.createNodes();
                this.ufoFrames = this.createUFOFrames();
                this.ufoFrameHeight = this.ufoFrames[0] ? this.ufoFrames[0].length : 0;
                this.ufoBeamRow = this.findBeamOriginRow();
                this.ufo = this.createUFO(this.ufo);
            }, 100);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createNodes() {
        this.nodes = [];
        this.lines = [];
        this.nodeIdCounter = 0;
        
        const nodeCount = Math.floor((window.innerWidth * window.innerHeight) / 10000);
        
        // Create nodes
        for (let i = 0; i < nodeCount; i++) {
            const baseColor = Math.random() > 0.5 ? '#00ffff' : '#ff00ff';
            this.nodes.push({
                id: this.nodeIdCounter++,
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                color: baseColor,
                baseColor
            });
        }
        
        // Create initial lines between nearby nodes
        this.updateLines();
    }

    updateLines() {
        this.lines = [];
        
        // Create lines between nearby nodes
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[i].x - this.nodes[j].x;
                const dy = this.nodes[i].y - this.nodes[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    this.lines.push({
                        x1: this.nodes[i].x,
                        y1: this.nodes[i].y,
                        x2: this.nodes[j].x,
                        y2: this.nodes[j].y,
                        opacity: (100 - distance) / 100 * 0.3
                    });
                }
            }
        }
    }

    updateNodes() {
        // Update rainbow hue for color shifting
        this.rainbowHue = (this.rainbowHue + 1) % 360;
        
        // Update rainbow clusters
        this.updateRainbowClusters();
        
        // Update node positions
        this.nodes.forEach(node => {
            // Apply drag to ruptured nodes
            if (node.ruptured) {
                const dragFactor = 0.97; // Drag coefficient for smooth slowdown
                node.vx *= dragFactor;
                node.vy *= dragFactor;
                
                // Remove ruptured flag when velocity is close to normal
                const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
                if (speed < 0.6) {
                    node.ruptured = false;
                }
            }
            
            // Apply drag to launched rainbow nodes
            if (node.launched) {
                const dragFactor = 0.96; // Stronger drag for organic slowdown
                node.vx *= dragFactor;
                node.vy *= dragFactor;
                
                // Remove launched flag when velocity reaches normal speed
                const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
                if (speed < 0.5) {
                    node.launched = false;
                }
            }
            
            // Move nodes
            node.x += node.vx;
            node.y += node.vy;
            
            // Wrap around edges with buffer (go off-screen before wrapping)
            const wrapBuffer = 50; // Distance off-screen before wrapping
            if (node.x < -wrapBuffer) node.x = this.canvas.width + wrapBuffer;
            if (node.x > this.canvas.width + wrapBuffer) node.x = -wrapBuffer;
            if (node.y < -wrapBuffer) node.y = this.canvas.height + wrapBuffer;
            if (node.y > this.canvas.height + wrapBuffer) node.y = -wrapBuffer;
            
            // React to mouse
            if (this.mouse.x !== null && this.mouse.y !== null) {
                const dx = node.x - this.mouse.x;
                const dy = node.y - this.mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    const angle = Math.atan2(dy, dx);
                    const force = (100 - distance) * 0.03;
                    node.x += Math.cos(angle) * force;
                    node.y += Math.sin(angle) * force;
                }
            }
        });
        
        this.updateUFO();
        // Update lines
        this.updateLines();
    }

    draw() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw lines
        this.lines.forEach(line => {
            this.ctx.beginPath();
            this.ctx.moveTo(line.x1, line.y1);
            this.ctx.lineTo(line.x2, line.y2);
            this.ctx.strokeStyle = `rgba(0, 200, 255, ${line.opacity})`;
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        });

        if (this.ufo && this.ufo.beam) {
            this.drawBeam(this.ufo.beam);
        }

        // Draw nodes
        this.nodes.forEach(node => {
            this.ctx.beginPath();
            const isTargeted = this.ufo && this.ufo.beam && this.ufo.beam.targetId === node.id;
            const radius = isTargeted ? node.size + 0.6 : node.size;
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            
            // Use rainbow color if node is part of a cluster
            let fillColor = node.color;
            
            // Pulsing green effect for targeted nodes
            if (isTargeted) {
                const pulse = 0.5 + 0.5 * Math.sin(this.ufo.thrusterPhase * 0.15);
                const greenValue = Math.floor(128 + 127 * pulse);
                fillColor = `rgb(${Math.floor(greenValue * 0.6)}, ${greenValue}, 0)`;
            } else if (node.isRainbow) {
                const hue = (this.rainbowHue + (node.rainbowOffset || 0)) % 360;
                fillColor = `hsl(${hue}, 100%, 60%)`;
            }
            
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
            
            // Add glow for rainbow nodes and targeted nodes
            if (node.isRainbow || isTargeted) {
                this.ctx.shadowColor = fillColor;
                this.ctx.shadowBlur = isTargeted ? 15 : 10;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        });

        if (this.ufo) {
            this.drawUFO();
        }
    }

    animate() {
        this.updateNodes();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    createUFOFrames() {
        // 2 frames alternating - spinning top effect (left-right oscillation)
        return [
            // Frame 1: Two windows visible on top (front view)
            [
                '000000030000000',
                '000000111000000',
                '000011111110000',
                '001131111131100',
                '011333111333110',
                '111111111111111',
                '011111111111110',
                '001111111111100',
                '000111111111000',
                '000000000000000',
                '000000333000000'
            ],
            // Frame 2: One window visible on top (side view - tilted)
            [
                '000000000000000',
                '000000111000000',
                '000011111110000',
                '001111131111100',
                '011111333111110',
                '111111111111111',
                '011111111111110',
                '001111111111100',
                '000111111111000',
                '000033333330000',
                '000000000000000'
            ]
        ];
    }

    createUFO(previous) {
        const scale = Math.max(3, Math.floor(Math.min(this.canvas.width, this.canvas.height) / 200));
        const frame = previous ? previous.frame : 0;
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            speed: 1.2, // Increased from 0.8 for more aggressive movement
            frame,
            frameTicker: 0,
            frameInterval: 8, // Fast alternation for spinning top effect
            beam: null,
            cooldown: 0,
            spriteScale: scale,
            targetId: null,
            captureDistance: Math.max(500, scale * 50), // Even longer beam distance for dramatic effect
            minTargetDistance: Math.max(100, scale * 8), // Don't abduct nodes too close underneath
            searchRange: Math.max(600, scale * 70), // Extended search range
            captureCooldown: 240 + Math.floor(Math.random() * 120), // 4-6 second cooldown between abductions
            thrusterPhase: 0,
            idleFrames: 0, // Track how long without a target
            targetPursuitFrames: 0, // Track how long chasing current target
            maxPursuitFrames: Math.floor(Math.random() * 180) + 300, // Patience: 5-8 seconds
            stalkingFrames: 0, // Track how long in stalking mode without catching
            warpCooldown: 0, // Cooldown between warps
            warpEffect: null, // Active warp effect data
            rainbowCharging: null // Rainbow node charging state
        };
    }

    updateUFO() {
        if (!this.ufo) {
            return;
        }
        const ufo = this.ufo;
        if (this.nodes.length === 0) {
            ufo.targetId = null;
            ufo.beam = null;
        }

        if (ufo.cooldown > 0) {
            ufo.cooldown -= 1;
        }

        if (ufo.beam) {
            const targetExists = this.nodes.some(node => node.id === ufo.beam.targetId);
            if (!targetExists) {
                ufo.beam = null;
                ufo.targetId = null;
            }
        }

        if (!ufo.beam) {
            const previousTargetId = ufo.targetId;
            if (ufo.targetId === null || !this.nodes.some(node => node.id === ufo.targetId)) {
                ufo.targetId = this.findNearestNodeId(ufo);
                // Reset pursuit timer when getting a new target
                if (ufo.targetId !== previousTargetId && ufo.targetId !== null) {
                    ufo.targetPursuitFrames = 0;
                    ufo.maxPursuitFrames = Math.floor(Math.random() * 180) + 300;
                    ufo.stalkingFrames = 0;
                    
                    // Only warp if coming from idle state (no previous target)
                    // Don't warp if already chasing another node
                    if (ufo.warpCooldown <= 0 && !ufo.beam && !ufo.rainbowCharging && previousTargetId === null) {
                        const randomX = Math.random() * this.canvas.width;
                        const randomY = Math.random() * this.canvas.height;
                        this.initiateUFOTeleportWarp(ufo, randomX, randomY);
                        return;
                    }
                }
            }
        }

        let targetNode = ufo.targetId !== null ? this.nodes.find(node => node.id === ufo.targetId) : null;
        
        // Validate target distance only (can track nodes from any direction)
        if (targetNode && !ufo.beam) {
            const dx = targetNode.x - ufo.x;
            const dy = targetNode.y - ufo.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Clear target only if WAY too close (to prevent oscillation) or too far
            const tooCloseThreshold = ufo.minTargetDistance * 0.5; // Half the min distance
            if (distance < tooCloseThreshold || distance > ufo.searchRange) {
                ufo.targetId = null;
                targetNode = null; // Clear the reference too
                ufo.targetPursuitFrames = 0; // Reset timer
            }
        }

        if (targetNode && ufo.targetId !== null) {
            // Reset idle counter - we have a target
            ufo.idleFrames = 0;
            
            // Track how long we've been chasing this target
            ufo.targetPursuitFrames++;
            
            // Give up on target if we've been chasing too long without catching it
            if (ufo.targetPursuitFrames > ufo.maxPursuitFrames && !ufo.beam) {
                ufo.targetId = null;
                ufo.targetPursuitFrames = 0;
                ufo.maxPursuitFrames = Math.floor(Math.random() * 180) + 300; // New random timeout
                return; // Skip to patrol behavior this frame
            }
            
            const dx = targetNode.x - ufo.x;
            const dy = targetNode.y - ufo.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            if (!ufo.beam) {
                // Check if target is in abduction cone
                const beamBase = this.getBeamBasePosition();
                const bx = targetNode.x - beamBase.x;
                const by = targetNode.y - beamBase.y;
                let beamAngle = Math.atan2(by, bx) * (180 / Math.PI);
                const inAbductionCone = targetNode.y > ufo.y && beamAngle >= 60 && beamAngle <= 120;
                
                // Maintain stalking distance when target not in abduction zone
                const stalkingDistance = ufo.minTargetDistance * 1.5;
                
                if (inAbductionCone) {
                    // Target in abduction zone - move toward it aggressively
                    ufo.stalkingFrames = 0; // Reset stalking counter
                    ufo.x += (dx / distance) * ufo.speed * 1.3; // Even more aggressive
                    ufo.y += (dy / distance) * ufo.speed * 1.3;
                } else if (distance > stalkingDistance) {
                    // Target not in cone and far away - move toward it aggressively
                    ufo.x += (dx / distance) * ufo.speed; // Increased from 0.6
                    ufo.y += (dy / distance) * ufo.speed;
                } else {
                    // Target not in cone but close - reposition aggressively or warp
                    ufo.stalkingFrames++;
                    
                    // Warp to ideal position if stalking too long (3 seconds, more patient)
                    if (ufo.stalkingFrames > 180 && ufo.warpCooldown <= 0 && !ufo.beam && !ufo.rainbowCharging) {
                        const idealX = targetNode.x;
                        const idealY = targetNode.y - stalkingDistance;
                        this.initiateUFOTeleportWarp(ufo, idealX, idealY);
                        ufo.stalkingFrames = 0;
                        return;
                    }
                    
                    // Give up if stalking way too long without success (6 seconds)
                    if (ufo.stalkingFrames > 360) {
                        ufo.targetId = null;
                        ufo.stalkingFrames = 0;
                        ufo.targetPursuitFrames = 0;
                        return;
                    }
                    
                    // Aggressive repositioning
                    const idealX = targetNode.x;
                    const idealY = targetNode.y - stalkingDistance;
                    const toIdealX = idealX - ufo.x;
                    const toIdealY = idealY - ufo.y;
                    const idealDistance = Math.sqrt(toIdealX * toIdealX + toIdealY * toIdealY) || 1;
                    
                    // Much faster repositioning
                    const repositionSpeed = 0.8;
                    ufo.x += (toIdealX / idealDistance) * repositionSpeed;
                    ufo.y += (toIdealY / idealDistance) * repositionSpeed;
                }
                
                ufo.x += (Math.random() - 0.5) * 0.5; // More erratic movement
                ufo.y += (Math.random() - 0.5) * 0.5;
                this.handleUFOEdgeWrapping(ufo); // Asteroids-style edge wrapping
                
                if (distance < ufo.captureDistance && ufo.cooldown <= 0 && inAbductionCone) {
                    const baseDistance = Math.sqrt(bx * bx + by * by) || 1;
                    // Don't activate beam if target is too far from beam origin (prevents super long beams)
                    const maxBeamLength = ufo.captureDistance * 0.8;
                    if (baseDistance > maxBeamLength) {
                        return; // Target too far, skip beam activation
                    }
                    // Beam extension speed (doubled for faster action)
                    const extendSpeed = Math.max(ufo.spriteScale * 0.08, baseDistance / 250) * 2.66;
                    ufo.beam = {
                        targetId: targetNode.id,
                        progress: 0,
                        maxProgress: 60,
                        reach: 0,
                        extendSpeed,
                        locked: false,
                        renderPosition: { x: beamBase.x, y: beamBase.y }
                    };
                }
            } else {
                const beamBase = this.getBeamBasePosition();
                const beam = ufo.beam;
                const bx = targetNode.x - beamBase.x;
                const by = targetNode.y - beamBase.y;
                const baseDistance = Math.sqrt(bx * bx + by * by) || 1;
                
                // Cancel beam if target has moved too far away
                const maxBeamLength = ufo.captureDistance * 0.8;
                if (baseDistance > maxBeamLength) {
                    ufo.beam = null;
                    ufo.targetId = null;
                    return;
                }
                const extendSpeed = beam.extendSpeed || (Math.max(ufo.spriteScale * 0.08, baseDistance / 250) * 2.66);
                beam.extendSpeed = extendSpeed;
                beam.reach = Math.min(baseDistance, (beam.reach || 0) + extendSpeed);
                const reachRatio = baseDistance > 0 ? beam.reach / baseDistance : 1;
                beam.renderPosition = {
                    x: beamBase.x + bx * reachRatio,
                    y: beamBase.y + by * reachRatio
                };

                if (!beam.locked && beam.reach >= baseDistance - Math.max(1.5, ufo.spriteScale * 0.25)) {
                    beam.locked = true;
                    beam.reach = baseDistance;
                }

                if (beam.locked) {
                    // Gently spring node into vertical alignment under UFO
                    // Initialize alignment progress if just locked
                    if (!beam.alignmentProgress) {
                        beam.alignmentProgress = 0;
                    }
                    beam.alignmentProgress = Math.min(1, beam.alignmentProgress + 0.015);
                    
                    // Zero out node's velocity so it doesn't fight the beam
                    targetNode.vx = 0;
                    targetNode.vy = 0;
                    
                    // Target: directly under UFO center
                    const ufoX = ufo.x;
                    const ufoBaseY = beamBase.y;
                    
                    // Blend between current position and aligned position
                    // Horizontal alignment happens faster for spring effect
                    const hAlignSpeed = 0.08; // Gentle horizontal spring
                    const vPullSpeed = beam.extendSpeed * 1.2; // Vertical pull
                    
                    // Spring horizontally toward center
                    const hDist = ufoX - targetNode.x;
                    targetNode.x += hDist * hAlignSpeed;
                    
                    // Pull vertically upward
                    const vDist = ufoBaseY - targetNode.y;
                    const vDistance = Math.abs(vDist);
                    const distanceToBase = Math.sqrt(hDist * hDist + vDist * vDist) || 1;
                    targetNode.y += (vDist / vDistance) * vPullSpeed;
                    
                    // Add small wiggle to UFO while keeping it locked in place
                    const wiggleStrength = 0.3;
                    ufo.x += (Math.random() - 0.5) * wiggleStrength;
                    ufo.y += (Math.random() - 0.5) * wiggleStrength;
                    
                    beam.progress += 1;
                    beam.renderPosition = { x: targetNode.x, y: targetNode.y };
                    // Complete abduction when node actually reaches UFO bottom
                    if (distanceToBase < ufo.spriteScale * 1.5) {
                        const index = this.nodes.findIndex(node => node.id === targetNode.id);
                        if (index !== -1) {
                            this.nodes.splice(index, 1);
                        }
                        this.abductionCount++;
                        
                        // Initiate rainbow node charging after 10 abductions
                        if (this.abductionCount >= 10) {
                            ufo.rainbowCharging = {
                                progress: 0,
                                maxProgress: 90, // 1.5 second charge time
                                intensity: 0
                            };
                            this.abductionCount = 0;
                        }
                        
                        ufo.cooldown = ufo.captureCooldown;
                        ufo.beam = null;
                        ufo.targetId = null;
                        // Reset pursuit timer after successful capture
                        ufo.targetPursuitFrames = 0;
                        ufo.maxPursuitFrames = Math.floor(Math.random() * 180) + 300;
                        ufo.stalkingFrames = 0;
                    }
                }
                // Node only moves once beam is locked (removed hover effect)
            }
        } else {
            // No target - aggressive patrol behavior
            ufo.idleFrames++;
            ufo.targetPursuitFrames = 0; // Reset pursuit timer when idle
            ufo.stalkingFrames = 0; // Reset stalking timer when idle
            
            // Random warp when idle too long, biased toward center (more deliberate)
            // UFO roams much longer before considering a warp (6-8+ seconds)
            if (ufo.idleFrames > 360 && ufo.warpCooldown <= 0 && !ufo.beam && !ufo.targetId && !ufo.rainbowCharging && Math.random() < 0.005) {
                // 70% chance to warp near center, 30% chance anywhere
                let randomX, randomY;
                if (Math.random() < 0.7) {
                    // Warp to center area with some variance
                    const centerX = this.canvas.width / 2;
                    const centerY = this.canvas.height / 2;
                    const variance = 0.3; // 30% of screen size
                    randomX = centerX + (Math.random() - 0.5) * this.canvas.width * variance;
                    randomY = centerY + (Math.random() - 0.5) * this.canvas.height * variance;
                } else {
                    randomX = Math.random() * this.canvas.width;
                    randomY = Math.random() * this.canvas.height;
                }
                this.initiateUFOTeleportWarp(ufo, randomX, randomY);
                ufo.idleFrames = 0;
                return;
            }
            
            // Bias movement toward center of screen
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            const toCenterX = centerX - ufo.x;
            const toCenterY = centerY - ufo.y;
            const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY) || 1;
            
            // Gentle pull toward center (10% bias)
            ufo.x += (toCenterX / centerDist) * 0.35;
            ufo.y += (toCenterY / centerDist) * 0.25;
            
            // Much more aggressive random movement
            ufo.x += (Math.random() - 0.5) * 3.5;
            ufo.y += (Math.random() - 0.5) * 2.5;
            
            // Add momentum-like behavior
            if (ufo.idleFrames % 30 === 0) {
                // Random burst movement every half second, biased toward center
                const burstAngle = Math.atan2(toCenterY, toCenterX) + (Math.random() - 0.5) * Math.PI;
                ufo.x += Math.cos(burstAngle) * 15;
                ufo.y += Math.sin(burstAngle) * 10;
            }
            
            // Handle edge wrapping during patrol
            this.handleUFOEdgeWrapping(ufo);
        }
        
        // Update warp cooldown
        if (ufo.warpCooldown > 0) {
            ufo.warpCooldown--;
        }
        
        // Update warp effect
        if (ufo.warpEffect) {
            this.updateWarpEffect(ufo);
        }
        
        // Update rainbow charging effect
        if (ufo.rainbowCharging) {
            this.updateRainbowCharging(ufo);
        }

        ufo.frameTicker += 1;
        if (ufo.frameTicker >= ufo.frameInterval) {
            ufo.frame = (ufo.frame + 1) % this.ufoFrames.length;
            ufo.frameTicker = 0;
        }
        ufo.thrusterPhase = (ufo.thrusterPhase + 1) % 360;
    }
    
    // ============================================
    // UFO TELEPORT WARP (Strategic teleportation with particle effect)
    // ============================================
    
    initiateUFOTeleportWarp(ufo, targetX, targetY) {
        // Don't initiate teleport if already warping or charging
        if (ufo.warpEffect || ufo.rainbowCharging) {
            return;
        }
        
        // Cancel any active beam and target when teleporting
        if (ufo.beam) {
            ufo.beam = null;
            ufo.targetId = null;
        }
        
        ufo.warpEffect = {
            phase: 'out', // 'out' -> 'in'
            progress: 0,
            maxProgress: 20,
            startX: ufo.x,
            startY: ufo.y,
            targetX,
            targetY,
            particles: []
        };
        
        // Create warp particles at start position
        for (let i = 0; i < 30; i++) {
            const angle = (Math.PI * 2 * i) / 30;
            ufo.warpEffect.particles.push({
                angle,
                distance: 0,
                speed: Math.random() * 2 + 1,
                size: Math.random() * 2 + 1
            });
        }
    }
    
    updateWarpEffect(ufo) {
        const warp = ufo.warpEffect;
        warp.progress++;
        
        if (warp.phase === 'out') {
            // Warp out animation
            warp.particles.forEach(p => {
                p.distance += p.speed * 2;
            });
            
            if (warp.progress >= warp.maxProgress) {
                // Teleport to new position
                ufo.x = warp.targetX;
                ufo.y = warp.targetY;
                warp.phase = 'in';
                warp.progress = 0;
                
                // Reset particles for warp in
                warp.particles.forEach(p => {
                    p.distance = ufo.spriteScale * 15;
                });
            }
        } else {
            // Warp in animation
            warp.particles.forEach(p => {
                p.distance -= p.speed * 2;
            });
            
            if (warp.progress >= warp.maxProgress) {
                ufo.warpEffect = null;
                ufo.warpCooldown = 240; // 4 second cooldown for more deliberate warping
            }
        }
    }
    
    updateRainbowCharging(ufo) {
        const charging = ufo.rainbowCharging;
        charging.progress++;
        
        // Increase intensity over time with accelerating growth
        const progressRatio = charging.progress / charging.maxProgress;
        charging.intensity = Math.pow(progressRatio, 2); // Quadratic growth
        
        // Shake the UFO with increasing intensity
        const shakeStrength = charging.intensity * 4;
        ufo.x += (Math.random() - 0.5) * shakeStrength;
        ufo.y += (Math.random() - 0.5) * shakeStrength;
        
        // Release when fully charged
        if (charging.progress >= charging.maxProgress) {
            // Launch rainbow nodes in multiple directions
            const numNodes = 5;
            const baseY = this.getBeamBasePosition().y;
            
            for (let i = 0; i < numNodes; i++) {
                const angle = (Math.PI / 2) + (i - (numNodes - 1) / 2) * (Math.PI / 6); // Spread in arc
                this.dropRainbowNode(ufo.x, baseY, angle);
            }
            
            ufo.rainbowCharging = null;
        }
    }

    drawBeam(beam) {
        if (!beam) {
            return;
        }
        const basePosition = this.getBeamBasePosition();
        const startX = basePosition.x;
        const startY = basePosition.y;
        const endX = beam.renderPosition.x;
        const endY = beam.renderPosition.y;
        const totalLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2) || 1;
        
        this.ctx.save();
        
        // Draw multiple organic, flexible beam strands
        const numStrands = 5;
        const baseWidth = this.ufo.spriteScale * 2.5;
        
        for (let strand = 0; strand < numStrands; strand++) {
            const strandOffset = (strand - numStrands / 2) * (baseWidth / numStrands);
            const phase = this.ufo.thrusterPhase + strand * 60;
            
            // Create organic curve path with parabolic bend (tentacle-like)
            const segments = 20;
            const points = [];
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                
                // Progressive curve: starts straight, then tracks toward node
                // When locked, gradually straighten beam as node aligns
                // Use quadratic ease-in for smooth tracking behavior
                const baseTracking = t * t; // Starts at 0, increases to 1
                
                // Gradually straighten when locked (blend based on alignment progress)
                let trackingStrength = baseTracking;
                if (beam.locked && beam.alignmentProgress !== undefined) {
                    const alignProgress = beam.alignmentProgress;
                    const lockedTracking = t * 0.3; // Straight when fully aligned
                    trackingStrength = baseTracking + (lockedTracking - baseTracking) * alignProgress;
                }
                
                // Add slight animation to the curve for living tentacle effect (gradually reduced when locked)
                let swayScale = 1.0;
                if (beam.locked && beam.alignmentProgress !== undefined) {
                    swayScale = 1.0 - (0.9 * beam.alignmentProgress); // Gradually reduce from 1.0 to 0.1
                }
                const curveSway = Math.sin(phase * 0.03 + t * Math.PI) * 0.2 * swayScale;
                
                // Linearly interpolate from start to end, applying tracking at end
                const straightX = startX;
                const straightY = startY + (endY - startY) * t; // Straight down first
                
                // Final target position
                const targetX = startX + (endX - startX) * t;
                const targetY = startY + (endY - startY) * t;
                
                // Blend between straight down and tracking based on progress
                const curvedX = straightX + (targetX - straightX) * trackingStrength;
                const curvedY = straightY + (targetY - straightY) * trackingStrength;
                
                // Add subtle sway animation
                const dx = endX - startX;
                const dy = endY - startY;
                const perpX = -dy / totalLength;
                const perpY = dx / totalLength;
                const swayAmount = this.ufo.spriteScale * 0.5 * t * curveSway;
                
                // Add organic wave motion on top of the curve (gradually reduced when locked)
                let waveScale = 1.0;
                if (beam.locked && beam.alignmentProgress !== undefined) {
                    waveScale = 1.0 - (0.8 * beam.alignmentProgress); // Gradually reduce from 1.0 to 0.2
                }
                const waveAmplitude = this.ufo.spriteScale * 0.8 * (1 - t * 0.3) * waveScale;
                const waveFreq = 0.05;
                const wave1 = Math.sin(t * Math.PI * 4 + phase * waveFreq) * waveAmplitude;
                const wave2 = Math.cos(t * Math.PI * 3 - phase * waveFreq * 0.7) * waveAmplitude * 0.5;
                
                points.push({
                    x: curvedX + perpX * (wave1 + wave2 + swayAmount + strandOffset * (1 - t * 0.5)),
                    y: curvedY + perpY * (wave1 + wave2 + swayAmount + strandOffset * (1 - t * 0.5))
                });
            }
            
            // Draw strand with glow
            const alpha = 0.3 + 0.2 * Math.sin(phase * 0.08 + strand);
            const width = (this.ufo.spriteScale * 0.4) * (beam.locked ? 1.2 : 1.0);
            
            // Outer glow
            this.ctx.strokeStyle = `rgba(124, 255, 0, ${alpha * 0.3})`;
            this.ctx.lineWidth = width * 3;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
            
            // Inner strand
            this.ctx.strokeStyle = `rgba(180, 255, 180, ${alpha * 0.7})`;
            this.ctx.lineWidth = width * 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
            
            // Core bright line
            this.ctx.strokeStyle = `rgba(200, 255, 255, ${alpha})`;
            this.ctx.lineWidth = width * 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.stroke();
        }
        
        // Energy particles along the beam
        this.drawBeamEnergyWaves(startX, startY, endX, endY, baseWidth, baseWidth, totalLength, beam.locked, beam);

        // Lock indicator at target
        if (beam.locked) {
            this.ctx.beginPath();
            this.ctx.arc(endX, endY, this.ufo.spriteScale * 1.2, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(124, 255, 0, 0.8)';
            this.ctx.lineWidth = this.ufo.spriteScale * 0.2;
            this.ctx.stroke();
            
            // Pulsing outer ring
            const pulse = 0.7 + 0.3 * Math.sin(this.ufo.thrusterPhase * 0.2);
            this.ctx.beginPath();
            this.ctx.arc(endX, endY, this.ufo.spriteScale * 1.8 * pulse, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(124, 255, 0, ${0.4 * (1 - pulse + 0.7)})`;
            this.ctx.lineWidth = this.ufo.spriteScale * 0.15;
            this.ctx.stroke();
        }

        this.ctx.restore();
    }
    
    drawBeamEnergyWaves(startX, startY, endX, endY, topWidth, bottomWidth, totalLength, isLocked, beam) {
        const waveCount = isLocked ? 6 : 3;
        
        this.ctx.save();
        
        for (let i = 0; i < waveCount; i++) {
            const offset = (this.ufo.thrusterPhase * 1.5 + i * 60) % 360;
            const progress = ((offset / 360) * totalLength) / totalLength;
            if (progress > 1) continue;
            
            // Use same progressive tracking curve as beam strands
            const t = progress;
            const baseTracking = t * t; // Quadratic ease-in
            
            // Gradually straighten when locked (match beam behavior)
            let trackingStrength = baseTracking;
            if (isLocked && beam && beam.alignmentProgress !== undefined) {
                const alignProgress = beam.alignmentProgress;
                const lockedTracking = t * 0.3;
                trackingStrength = baseTracking + (lockedTracking - baseTracking) * alignProgress;
            } else if (isLocked) {
                trackingStrength = t * 0.3;
            }
            
            // Straight down first
            const straightX = startX;
            const straightY = startY + (endY - startY) * t;
            
            // Target position
            const targetX = startX + (endX - startX) * t;
            const targetY = startY + (endY - startY) * t;
            
            // Blend between straight and tracking
            const x = straightX + (targetX - straightX) * trackingStrength;
            const y = straightY + (targetY - straightY) * trackingStrength;
            const width = topWidth + (bottomWidth - topWidth) * progress;
            
            // Energy particle with glow
            const radius = this.ufo.spriteScale * (0.4 + 0.2 * Math.sin(offset * 0.1));
            const alpha = 0.6 * (1 - progress * 0.3);
            
            // Glow
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(124, 255, 0, ${alpha * 0.2})`;
            this.ctx.fill();
            
            // Particle
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(200, 255, 255, ${alpha})`;
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }

    drawUFO() {
        // Draw warp effect if active
        if (this.ufo.warpEffect) {
            this.drawWarpEffect();
        }
        
        // Draw rainbow charging effect
        if (this.ufo.rainbowCharging) {
            this.drawRainbowChargingEffect();
        }
        
        const frameData = this.ufoFrames[this.ufo.frame];
        if (!frameData) {
            return;
        }
        
        // Calculate UFO opacity based on warp phase
        let ufoAlpha = 1.0;
        if (this.ufo.warpEffect) {
            const warp = this.ufo.warpEffect;
            const progress = warp.progress / warp.maxProgress;
            if (warp.phase === 'out') {
                ufoAlpha = 1.0 - progress; // Fade out
            } else {
                ufoAlpha = progress; // Fade in
            }
        }
        
        const scale = this.ufo.spriteScale;
        const height = frameData.length;
        const width = frameData[0].length;
        const startX = this.ufo.x - (width * scale) / 2;
        const startY = this.ufo.y - (height * scale) / 2;
        
        // Enhanced glow during rainbow charging
        let glow = '#7cff00';
        let shadowBlur = 18;
        
        if (this.ufo.rainbowCharging) {
            const charging = this.ufo.rainbowCharging;
            const intensity = charging.intensity;
            
            // Flashing rainbow colors
            const hue = (this.rainbowHue + this.ufo.thrusterPhase * 3) % 360;
            glow = `hsl(${hue}, 100%, ${50 + intensity * 30}%)`;
            
            // Increasing glow intensity
            shadowBlur = 18 + intensity * 60;
            
            // Flash effect near the end
            if (intensity > 0.7) {
                const flash = Math.sin(charging.progress * 0.8) * 0.5 + 0.5;
                shadowBlur += flash * 40;
            }
        }
        
        this.ctx.save();
        this.ctx.globalAlpha = ufoAlpha;
        this.ctx.shadowColor = glow;
        this.ctx.shadowBlur = shadowBlur;
        for (let row = 0; row < height; row++) {
            const line = frameData[row];
            for (let col = 0; col < width; col++) {
                const cell = line[col];
                if (cell === '0') {
                    continue;
                }
                const alphaBase = 0.8;
                let fill;
                if (cell === '3') {
                    const alpha = 0.75;
                    fill = `rgba(255, 64, 192, ${alpha})`;
                } else if (cell === '4') {
                    const alpha = 0.75;
                    fill = `rgba(64, 240, 255, ${alpha})`;
                } else if (cell === '5') {
                    const alpha = 0.6;
                    fill = `rgba(160, 255, 180, ${alpha})`;
                } else if (cell === '6') {
                    const alpha = 0.65;
                    fill = `rgba(160, 255, 255, ${alpha})`;
                } else {
                    fill = `rgba(124, 255, 0, ${alphaBase})`;
                }
                this.ctx.fillStyle = fill;
                this.ctx.fillRect(startX + col * scale, startY + row * scale, scale, scale);
            }
        }
        this.ctx.restore();
    }
    
    drawRainbowChargingEffect() {
        const charging = this.ufo.rainbowCharging;
        const intensity = charging.intensity;
        const centerX = this.ufo.x;
        const centerY = this.ufo.y;
        
        this.ctx.save();
        
        // Draw multiple pulsing rainbow energy rings
        const numRings = 3;
        for (let i = 0; i < numRings; i++) {
            const ringPhase = (this.ufo.thrusterPhase * 2 + i * 120) % 360;
            const pulse = Math.sin(ringPhase * 0.05) * 0.3 + 0.7;
            const radius = this.ufo.spriteScale * (8 + i * 5) * intensity * pulse;
            
            // Rainbow color for each ring
            const hue = (this.rainbowHue + i * 120 + ringPhase) % 360;
            
            // Outer glow ring
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${intensity * 0.4})`;
            this.ctx.lineWidth = this.ufo.spriteScale * 1.5;
            this.ctx.stroke();
            
            // Inner bright ring
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `hsla(${hue}, 100%, 80%, ${intensity * 0.6})`;
            this.ctx.lineWidth = this.ufo.spriteScale * 0.5;
            this.ctx.stroke();
        }
        
        // Energy particles spiraling around UFO
        const numParticles = Math.floor(intensity * 20);
        for (let i = 0; i < numParticles; i++) {
            const angle = (this.ufo.thrusterPhase * 3 + i * 360 / numParticles) * (Math.PI / 180);
            const distance = this.ufo.spriteScale * (5 + Math.sin(angle * 3) * 3) * intensity;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            
            const hue = (this.rainbowHue + i * 360 / numParticles) % 360;
            const particleSize = this.ufo.spriteScale * 0.5 * (0.5 + Math.random() * 0.5);
            
            // Particle glow
            this.ctx.beginPath();
            this.ctx.arc(x, y, particleSize * 2, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${intensity * 0.3})`;
            this.ctx.fill();
            
            // Particle core
            this.ctx.beginPath();
            this.ctx.arc(x, y, particleSize, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsla(${hue}, 100%, 90%, ${intensity * 0.8})`;
            this.ctx.fill();
        }
        
        // Lightning bolts at high intensity
        if (intensity > 0.5) {
            const numBolts = Math.floor((intensity - 0.5) * 10);
            for (let i = 0; i < numBolts; i++) {
                const angle = Math.random() * Math.PI * 2;
                const length = this.ufo.spriteScale * 15 * intensity;
                const startDist = this.ufo.spriteScale * 3;
                
                const x1 = centerX + Math.cos(angle) * startDist;
                const y1 = centerY + Math.sin(angle) * startDist;
                const x2 = centerX + Math.cos(angle) * length;
                const y2 = centerY + Math.sin(angle) * length;
                
                const hue = (this.rainbowHue + Math.random() * 120) % 360;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.strokeStyle = `hsla(${hue}, 100%, 80%, ${intensity * 0.6})`;
                this.ctx.lineWidth = this.ufo.spriteScale * 0.3;
                this.ctx.stroke();
            }
        }
        
        this.ctx.restore();
    }
    
    drawWarpEffect() {
        const warp = this.ufo.warpEffect;
        const centerX = this.ufo.x;
        const centerY = this.ufo.y;
        
        this.ctx.save();
        
        // Draw expanding/contracting particle ring
        warp.particles.forEach(p => {
            const x = centerX + Math.cos(p.angle) * p.distance;
            const y = centerY + Math.sin(p.angle) * p.distance;
            
            // Calculate alpha based on distance
            const maxDist = this.ufo.spriteScale * 15;
            const alpha = Math.max(0, 1 - (p.distance / maxDist));
            
            // Outer glow
            this.ctx.beginPath();
            this.ctx.arc(x, y, p.size * 2, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(124, 255, 0, ${alpha * 0.3})`;
            this.ctx.fill();
            
            // Inner particle
            this.ctx.beginPath();
            this.ctx.arc(x, y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(200, 255, 255, ${alpha * 0.8})`;
            this.ctx.fill();
        });
        
        // Central energy vortex
        const progress = warp.progress / warp.maxProgress;
        const vortexSize = this.ufo.spriteScale * 3 * (warp.phase === 'out' ? (1 - progress) : progress);
        
        // Outer vortex ring
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, vortexSize * 1.5, 0, Math.PI * 2);
        this.ctx.strokeStyle = `rgba(124, 255, 0, ${0.6 * (warp.phase === 'out' ? (1 - progress) : progress)})`;
        this.ctx.lineWidth = this.ufo.spriteScale * 0.3;
        this.ctx.stroke();
        
        // Inner vortex ring
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, vortexSize, 0, Math.PI * 2);
        this.ctx.strokeStyle = `rgba(200, 255, 255, ${0.8 * (warp.phase === 'out' ? (1 - progress) : progress)})`;
        this.ctx.lineWidth = this.ufo.spriteScale * 0.2;
        this.ctx.stroke();
        
        // Rotating energy lines
        for (let i = 0; i < 4; i++) {
            const angle = (warp.progress * 0.2) + (i * Math.PI / 2);
            const lineLength = vortexSize * 1.2;
            const x1 = centerX + Math.cos(angle) * vortexSize * 0.3;
            const y1 = centerY + Math.sin(angle) * vortexSize * 0.3;
            const x2 = centerX + Math.cos(angle) * lineLength;
            const y2 = centerY + Math.sin(angle) * lineLength;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.strokeStyle = `rgba(124, 255, 0, ${0.5 * (warp.phase === 'out' ? (1 - progress) : progress)})`;
            this.ctx.lineWidth = this.ufo.spriteScale * 0.15;
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }

    findBeamOriginRow() {
        const frame = this.ufoFrames[0] || [];
        for (let row = frame.length - 1; row >= 0; row--) {
            if (/[1-9]/.test(frame[row])) {
                return row;
            }
        }
        return 0;
    }

    getBeamBasePosition() {
        if (!this.ufo) {
            return { x: 0, y: 0 };
        }
        const scale = this.ufo.spriteScale;
        const height = this.ufoFrameHeight;
        const startY = this.ufo.y - (height * scale) / 2;
        const row = this.ufoBeamRow;
        const baseY = startY + (row + 0.5) * scale;
        return { x: this.ufo.x, y: baseY };
    }

    drawThruster() {
        const ufo = this.ufo;
        if (!ufo) {
            return;
        }
        const base = this.getBeamBasePosition();
        const scale = ufo.spriteScale;
        const pulse = 0.6 + 0.4 * Math.sin(ufo.thrusterPhase * 0.15);
        const lineLength = scale * (1.5 + pulse * 0.5);
        const halfWidth = scale * (0.6 + pulse * 0.2);
        const endY = base.y + lineLength;

        this.ctx.save();
        const gradient = this.ctx.createLinearGradient(base.x, base.y, base.x, endY);
        gradient.addColorStop(0, 'rgba(124, 255, 0, 0.9)');
        gradient.addColorStop(0.5, 'rgba(124, 255, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(124, 255, 0, 0)');
        this.ctx.beginPath();
        this.ctx.moveTo(base.x - halfWidth, base.y);
        this.ctx.lineTo(base.x + halfWidth, base.y);
        this.ctx.lineTo(base.x + halfWidth * 0.6, endY);
        this.ctx.lineTo(base.x - halfWidth * 0.6, endY);
        this.ctx.closePath();
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        this.ctx.restore();
    }

    findNearestNodeId(ufo) {
        let closestDistance = Infinity;
        let closestId = null;
        this.nodes.forEach(node => {
            // Skip rainbow nodes - they cannot be abducted
            if (node.isRainbow) return;
            
            const dx = node.x - ufo.x;
            const dy = node.y - ufo.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Must be at minimum distance away
            if (distance < ufo.minTargetDistance) return;
            
            // Don't target nodes too far away
            if (distance > ufo.searchRange) return;
            
            // UFO can target nodes in any direction for tracking/following
            // No angle restriction here - just find nearest node
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestId = node.id;
            }
        });
        return closestId;
    }

    // ============================================
    // EDGE WRAPPING (Asteroids-style screen wrapping - no visual effect)
    // ============================================
    
    handleUFOEdgeWrapping(ufo) {
        // This is NOT teleport warp - this is continuous Asteroids-style edge wrapping
        // UFO goes off one side and appears on the opposite side
        const wrapBuffer = 100; // Distance off-screen before wrapping (larger for UFO)
        
        let didWrap = false; // Track if UFO actually wrapped
        
        // Cancel beam if UFO is approaching edge (prevents stuck beams during edge crossing)
        if (ufo.beam && (ufo.x < -wrapBuffer * 0.5 || ufo.x > this.canvas.width + wrapBuffer * 0.5 ||
                         ufo.y < -wrapBuffer * 0.5 || ufo.y > this.canvas.height + wrapBuffer * 0.5)) {
            ufo.beam = null;
            ufo.targetId = null;
        }
        
        // Wrap coordinates (Asteroids-style) and track if wrapping occurred
        if (ufo.x < -wrapBuffer) {
            ufo.x = this.canvas.width + wrapBuffer;
            didWrap = true;
        }
        if (ufo.x > this.canvas.width + wrapBuffer) {
            ufo.x = -wrapBuffer;
            didWrap = true;
        }
        if (ufo.y < -wrapBuffer) {
            ufo.y = this.canvas.height + wrapBuffer;
            didWrap = true;
        }
        if (ufo.y > this.canvas.height + wrapBuffer) {
            ufo.y = -wrapBuffer;
            didWrap = true;
        }
        
        // Cancel beam immediately after wrap (safety check)
        if (didWrap && ufo.beam) {
            ufo.beam = null;
            ufo.targetId = null;
        }
    }
    
    dropRainbowNode(x, y, launchAngle) {
        // Create the initial rainbow node with launch velocity
        const launchSpeed = 8;
        const rainbowNode = {
            id: this.nodeIdCounter++,
            x,
            y,
            size: 3,
            vx: Math.cos(launchAngle) * launchSpeed,
            vy: Math.sin(launchAngle) * launchSpeed,
            color: '#ffffff',
            baseColor: '#ffffff',
            isRainbow: true,
            rainbowOffset: 0,
            isReplicator: true,
            launched: true // Mark as launched for drag application
        };
        
        this.nodes.push(rainbowNode);
        
        // Create a cluster tracker
        this.rainbowClusters.push({
            parentId: rainbowNode.id,
            x,
            y,
            nodeIds: [rainbowNode.id],
            replicationProgress: 0,
            replicationInterval: 60, // Replicate every 60 frames (1 second)
            maxNodes: 10,
            ruptureProgress: 0,
            ruptureDelay: 120 // Wait 2 seconds after reaching max before rupture
        });
    }
    
    updateRainbowClusters() {
        for (let i = this.rainbowClusters.length - 1; i >= 0; i--) {
            const cluster = this.rainbowClusters[i];
            
            // Check if parent node still exists
            const parentExists = this.nodes.some(n => n.id === cluster.parentId);
            if (!parentExists) {
                // Parent was abducted, remove cluster
                this.rainbowClusters.splice(i, 1);
                continue;
            }
            
            // Replication phase
            if (cluster.nodeIds.length < cluster.maxNodes) {
                cluster.replicationProgress++;
                
                if (cluster.replicationProgress >= cluster.replicationInterval) {
                    cluster.replicationProgress = 0;
                    this.replicateNode(cluster);
                }
            } else {
                // Rupture phase
                cluster.ruptureProgress++;
                
                if (cluster.ruptureProgress >= cluster.ruptureDelay) {
                    this.ruptureCluster(cluster);
                    this.rainbowClusters.splice(i, 1);
                }
            }
        }
    }
    
    replicateNode(cluster) {
        // Find the parent node
        const parentNode = this.nodes.find(n => n.id === cluster.parentId);
        if (!parentNode) return;
        
        // Create a new node near the parent
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        
        const newNode = {
            id: this.nodeIdCounter++,
            x: parentNode.x + Math.cos(angle) * distance,
            y: parentNode.y + Math.sin(angle) * distance,
            size: 2 + Math.random(),
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            color: '#ffffff',
            baseColor: '#ffffff',
            isRainbow: true,
            rainbowOffset: Math.random() * 360
        };
        
        // Keep within bounds
        newNode.x = Math.max(0, Math.min(this.canvas.width, newNode.x));
        newNode.y = Math.max(0, Math.min(this.canvas.height, newNode.y));
        
        this.nodes.push(newNode);
        cluster.nodeIds.push(newNode.id);
    }
    
    ruptureCluster(cluster) {
        // Find all nodes in the cluster
        const clusterNodes = this.nodes.filter(n => cluster.nodeIds.includes(n.id));
        
        // Rupture: give them explosive velocities and return to normal colors
        clusterNodes.forEach(node => {
            const angle = Math.random() * Math.PI * 2;
            const force = 3 + Math.random() * 5;
            
            node.vx = Math.cos(angle) * force;
            node.vy = Math.sin(angle) * force;
            node.isRainbow = false;
            node.isReplicator = false;
            node.ruptured = true; // Mark as ruptured for drag application
            
            // Return to normal color scheme
            node.baseColor = Math.random() > 0.5 ? '#00ffff' : '#ff00ff';
            node.color = node.baseColor;
        });
    }
}

// Initialize the node graph when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('nodeGraph');
    if (canvas) {
        new NodeGraph(canvas);
    }
});
