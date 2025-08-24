// Node Graph Animation
class NodeGraph {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nodes = [];
        this.lines = [];
        this.mouse = { x: null, y: null };
        this.resizeTimeout = null;
        
        this.init();
    }

    init() {
        this.resizeCanvas();
        this.createNodes();
        this.animate();
        
        // Event listeners
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.resizeCanvas();
                this.createNodes();
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
        
        const nodeCount = Math.floor((window.innerWidth * window.innerHeight) / 15000);
        
        // Create nodes
        for (let i = 0; i < nodeCount; i++) {
            this.nodes.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 1,
                baseX: Math.random() * this.canvas.width,
                baseY: Math.random() * this.canvas.height,
                speed: Math.random() * 0.2 + 0.1,
                angle: Math.random() * Math.PI * 2,
                radius: (Math.random() * 50) + 50,
                color: Math.random() > 0.5 ? '#00ffff' : '#ff00ff', // Cyan or Magenta
                pulseSpeed: Math.random() * 0.02 + 0.01,
                pulsePhase: Math.random() * Math.PI * 2,
            });
        }
        
        // Create lines between nearby nodes
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[i].x - this.nodes[j].x;
                const dy = this.nodes[i].y - this.nodes[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 150) {
                    this.lines.push({
                        x1: this.nodes[i].x,
                        y1: this.nodes[i].y,
                        x2: this.nodes[j].x,
                        y2: this.nodes[j].y,
                        opacity: (150 - distance) / 150 * 0.3
                    });
                }
            }
        }
    }

    updateNodes() {
        // Clear lines and reset node properties
        this.lines = [];
        
        // First pass: reset node properties
        this.nodes.forEach(node => {
            node.nearbyIntensity = 0;
            node.closestDistance = Infinity;
        });
        
        // Update node positions and calculate proximities
        this.nodes.forEach((node, i) => {
            // Move nodes in a circular motion
            node.angle += node.speed * 0.01;
            node.x = node.baseX + Math.cos(node.angle) * node.radius;
            node.y = node.baseY + Math.sin(node.angle) * node.radius;
            
            // Random movement
            node.x += (Math.random() - 0.5) * 0.5;
            node.y += (Math.random() - 0.5) * 0.5;
            
            // Keep nodes within canvas bounds
            node.x = Math.max(0, Math.min(this.canvas.width, node.x));
            node.y = Math.max(0, Math.min(this.canvas.height, node.y));
            
            // Calculate distances to other nodes
            for (let j = i + 1; j < this.nodes.length; j++) {
                const otherNode = this.nodes[j];
                const dx = node.x - otherNode.x;
                const dy = node.y - otherNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Update closest distance for both nodes
                node.closestDistance = Math.min(node.closestDistance, distance);
                otherNode.closestDistance = Math.min(otherNode.closestDistance, distance);
                
                // If nodes are close enough, create a line and increase intensity
                if (distance < 150) {
                    const intensity = 1 - (distance / 150); // 1 when touching, 0 at max distance
                    node.nearbyIntensity = Math.max(node.nearbyIntensity, intensity);
                    otherNode.nearbyIntensity = Math.max(otherNode.nearbyIntensity, intensity);
                    
                    this.lines.push({
                        x1: node.x,
                        y1: node.y,
                        x2: otherNode.x,
                        y2: otherNode.y,
                        opacity: intensity * 0.3,
                        intensity: intensity
                    });
                }
            }
            
            // React to mouse
            if (this.mouse.x !== null && this.mouse.y !== null) {
                const dx = node.x - this.mouse.x;
                const dy = node.y - this.mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 150) {
                    const intensity = 1 - (distance / 150);
                    node.nearbyIntensity = Math.max(node.nearbyIntensity, intensity);
                    
                    const angle = Math.atan2(dy, dx);
                    const force = (150 - distance) * 0.03;
                    node.x += Math.cos(angle) * force;
                    node.y += Math.sin(angle) * force;
                }
            }
        });
    }

    draw() {
        // Clear the entire canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw a solid background
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw lines with gradient based on intensity
        this.lines.forEach(line => {
            const intensity = line.intensity || 0.5;
            
            // Line color transitions from green to cyan to magenta based on intensity
            let r, g, b;
            if (intensity < 0.5) {
                // Green to cyan
                const t = intensity * 2;
                r = 0;
                g = Math.floor(160 + (95 * t));
                b = Math.floor(90 + (165 * t));
            } else {
                // Cyan to magenta
                const t = (intensity - 0.5) * 2;
                r = Math.floor(0 + (255 * t));
                g = Math.floor(255 - (255 * t));
                b = 255;
            }
            
            const gradient = this.ctx.createLinearGradient(line.x1, line.y1, line.x2, line.y2);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${line.opacity * 0.8})`);
            gradient.addColorStop(1, `rgba(${Math.max(0, r-30)}, ${Math.max(0, g-30)}, ${Math.max(0, b-30)}, ${line.opacity * 0.8})`);
            
            this.ctx.beginPath();
            this.ctx.moveTo(line.x1, line.y1);
            this.ctx.lineTo(line.x2, line.y2);
            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = 1 + (intensity * 2); // Thicker line for closer nodes
            this.ctx.stroke();
        });
        
        // Draw nodes with dynamic glow
        this.nodes.forEach(node => {
            // Update pulse phase for subtle breathing effect
            node.pulsePhase = (node.pulsePhase || 0) + 0.01;
            const pulseIntensity = 0.9 + (Math.sin(node.pulsePhase) * 0.1); // 0.8 to 1.0
            
            // Base intensity from nearby nodes
            const intensity = (node.nearbyIntensity || 0) * pulseIntensity;
            
            // Determine color based on intensity
            let r, g, b;
            if (intensity < 0.3) {
                // Green for distant nodes
                const t = intensity / 0.3;
                r = 0;
                g = Math.floor(100 + (100 * t));
                b = 0;
            } else if (intensity < 0.7) {
                // Green to cyan
                const t = (intensity - 0.3) / 0.4;
                r = 0;
                g = 200;
                b = Math.floor(0 + (200 * t));
            } else {
                // Cyan to magenta
                const t = (intensity - 0.7) / 0.3;
                r = Math.floor(0 + (255 * t));
                g = Math.floor(200 - (200 * t));
                b = 200;
            }
            
            const color = `rgb(${r}, ${g}, ${b})`;
            
            // Draw glow
            const glowSize = 5 + (intensity * 25); // More intense glow for closer nodes
            const gradient = this.ctx.createRadialGradient(
                node.x, node.y, node.radius,
                node.x, node.y, node.radius + glowSize
            );
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.radius + glowSize, 0, Math.PI * 2);
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            // Draw node
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            
            // Add highlight
            const highlightGradient = this.ctx.createRadialGradient(
                node.x - node.radius * 0.3, 
                node.y - node.radius * 0.3, 
                0, 
                node.x - node.radius * 0.3, 
                node.y - node.radius * 0.3, 
                node.radius * 2
            );
            highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = highlightGradient;
            this.ctx.fill();
        });
    }

    animate() {
        this.updateNodes();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize the node graph when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('nodeGraph');
    new NodeGraph(canvas);
});
