// Loading Splash Screen Animation
class LoaderAnimation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.centerNode = null;
        this.branches = [];
        this.branchCount = 6;
        this.isRunning = true;
        
        this.init();
    }

    init() {
        this.resizeCanvas();
        
        // Initialize center node AFTER canvas is sized
        const nodeRadius = Math.max(8, this.canvas.width * 0.015);
        this.centerNode = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: nodeRadius,
            color: 'rgb(0, 255, 255)',
            pulsePhase: Math.random() * Math.PI * 2,
            colorPhase: Math.random() * Math.PI * 2
        };
        
        // Initialize branches
        this.initBranches();
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            const newNodeRadius = Math.max(8, this.canvas.width * 0.015);
            this.centerNode.x = this.canvas.width / 2;
            this.centerNode.y = this.canvas.height / 2;
            this.centerNode.radius = newNodeRadius;
            this.initBranches();
        });
        
        this.animate();
    }

    resizeCanvas() {
        // Get viewport dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Use smaller dimension, take 80% of it
        const size = Math.min(width, height) * 0.8;
        
        // Set canvas dimensions
        this.canvas.width = size;
        this.canvas.height = size;
        
        // Update max branch length
        this.maxBranchLength = size * 0.2;
    }

    initBranches() {
        this.branches = [];
        const angleStep = (Math.PI * 2) / this.branchCount;
        
        for (let i = 0; i < this.branchCount; i++) {
            const angle = angleStep * i;
            const randomPhaseOffset = Math.random() * Math.PI * 2;
            const randomSpeed = 0.012 + Math.random() * 0.006;
            const randomLength = this.maxBranchLength * (0.85 + Math.random() * 0.3);
            const nodeRadius = Math.max(5, this.canvas.width * 0.01) + Math.random() * 2;
            
            this.branches.push({
                angle: angle,
                length: 0,
                targetLength: randomLength,
                velocity: 0,
                phase: randomPhaseOffset,
                phaseSpeed: randomSpeed,
                colorPhase: Math.random() * Math.PI * 2,
                baseColor: i % 2 === 0 ? 'cyan' : 'magenta',
                node: {
                    x: this.centerNode.x,
                    y: this.centerNode.y,
                    radius: nodeRadius,
                    color: 'rgb(0, 255, 255)'
                }
            });
        }
    }

    applySpringPhysics(current, target, velocity, stiffness = 0.08, damping = 0.82) {
        const displacement = target - current;
        const springForce = displacement * stiffness;
        velocity += springForce;
        velocity *= damping;
        current += velocity;
        
        return { value: current, velocity: velocity };
    }

    updateAnimation() {
        if (!this.isRunning) return;
        
        // Update branches independently
        this.branches.forEach(branch => {
            branch.phase += branch.phaseSpeed;
            branch.colorPhase += 0.03;
            
            const normalizedPhase = (Math.sin(branch.phase) + 1) / 2;
            const target = normalizedPhase * branch.targetLength;
            
            const result = this.applySpringPhysics(
                branch.length,
                target,
                branch.velocity
            );
            
            branch.length = result.value;
            branch.velocity = result.velocity;
            
            const wobble = Math.sin(branch.phase * 2) * (this.canvas.width * 0.005);
            branch.node.x = this.centerNode.x + Math.cos(branch.angle) * (branch.length + wobble);
            branch.node.y = this.centerNode.y + Math.sin(branch.angle) * (branch.length + wobble);
            
            // Update color
            const colorIntensity = (Math.sin(branch.colorPhase) + 1) / 2;
            const intensity = 0.6 + (colorIntensity * 0.4);
            
            if (branch.baseColor === 'cyan') {
                branch.node.color = `rgb(0, ${Math.floor(255 * intensity)}, ${Math.floor(255 * intensity)})`;
            } else {
                branch.node.color = `rgb(${Math.floor(255 * intensity)}, 0, ${Math.floor(255 * intensity)})`;
            }
        });
        
        // Update center node
        this.centerNode.pulsePhase += 0.04;
        this.centerNode.colorPhase += 0.025;
        
        const centerColorIntensity = (Math.sin(this.centerNode.colorPhase) + 1) / 2;
        const centerIntensity = 0.7 + (centerColorIntensity * 0.3);
        this.centerNode.color = `rgb(0, ${Math.floor(255 * centerIntensity)}, ${Math.floor(255 * centerIntensity)})`;
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw lines
        this.branches.forEach(branch => {
            if (branch.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.centerNode.x, this.centerNode.y);
                this.ctx.lineTo(branch.node.x, branch.node.y);
                
                const gradient = this.ctx.createLinearGradient(
                    this.centerNode.x,
                    this.centerNode.y,
                    branch.node.x,
                    branch.node.y
                );
                gradient.addColorStop(0, 'rgba(0, 255, 255, 0.6)');
                gradient.addColorStop(1, branch.baseColor === 'cyan'
                    ? 'rgba(0, 255, 255, 0.8)'
                    : 'rgba(255, 0, 255, 0.8)');
                
                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = Math.max(2, this.canvas.width * 0.003);
                this.ctx.stroke();
            }
        });
        
        // Draw branch nodes
        this.branches.forEach(branch => {
            if (branch.length > 1) {
                this.drawNode(branch.node.x, branch.node.y, branch.node.radius, branch.node.color);
            }
        });
        
        // Draw center node
        const pulseScale = 1 + Math.sin(this.centerNode.pulsePhase) * 0.15;
        const pulseRadius = this.centerNode.radius * pulseScale;
        this.drawNode(this.centerNode.x, this.centerNode.y, pulseRadius, this.centerNode.color, true);
    }

    drawNode(x, y, radius, color, isCenter = false) {
        // Outer glow
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, color.replace('rgb', 'rgba').replace(')', ', 0.5)'));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        // Core node
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        
        // Inner highlight
        if (isCenter) {
            this.ctx.beginPath();
            this.ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.fill();
        }
    }

    animate() {
        if (!this.isRunning) return;
        
        this.updateAnimation();
        this.draw();
        
        requestAnimationFrame(() => this.animate());
    }

    stop() {
        this.isRunning = false;
    }
}

// Initialize loader and handle page load
(function() {
    let loader = null;
    let pageLoaded = false;
    let minDisplayTime = false;
    const MIN_DISPLAY_MS = 2000; // Show for at least 2 seconds
    
    function initLoader() {
        const canvas = document.getElementById('loaderCanvas');
        if (canvas && !loader) {
            console.log('Initializing loader, canvas size:', canvas.width, canvas.height);
            loader = new LoaderAnimation(canvas);
            
            // Set minimum display time
            setTimeout(() => {
                console.log('Minimum display time reached');
                minDisplayTime = true;
                checkAndHide();
            }, MIN_DISPLAY_MS);
        }
    }
    
    function hideLoader() {
        const splash = document.getElementById('loadingSplash');
        if (splash) {
            console.log('Hiding loader');
            splash.classList.add('fade-out');
            
            setTimeout(() => {
                if (loader) {
                    loader.stop();
                }
                splash.classList.add('hidden');
            }, 800);
        }
    }
    
    function checkAndHide() {
        if (pageLoaded && minDisplayTime) {
            console.log('Both conditions met, hiding loader');
            hideLoader();
        } else {
            console.log('Waiting... pageLoaded:', pageLoaded, 'minDisplayTime:', minDisplayTime);
        }
    }
    
    function onPageLoad() {
        console.log('Page loaded');
        pageLoaded = true;
        checkAndHide();
    }
    
    // Initialize immediately if DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLoader);
    } else {
        initLoader();
    }
    
    // Wait for page to be fully loaded
    if (document.readyState === 'complete') {
        onPageLoad();
    } else {
        window.addEventListener('load', onPageLoad);
    }
})();
