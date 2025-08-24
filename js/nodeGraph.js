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
        this.lines = [];
        
        // Update node positions
        this.nodes.forEach(node => {
            // Move nodes in a circular motion
            node.angle += node.speed * 0.01;
            node.x = node.baseX + Math.cos(node.angle) * node.radius;
            node.y = node.baseY + Math.sin(node.angle) * node.radius;
            
            // Add some random movement
            node.x += (Math.random() - 0.5) * 0.5;
            node.y += (Math.random() - 0.5) * 0.5;
            
            // Keep nodes within canvas bounds
            node.x = Math.max(0, Math.min(this.canvas.width, node.x));
            node.y = Math.max(0, Math.min(this.canvas.height, node.y));
            
            // React to mouse
            if (this.mouse.x !== null && this.mouse.y !== null) {
                const dx = node.x - this.mouse.x;
                const dy = node.y - this.mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    const angle = Math.atan2(dy, dx);
                    const force = (100 - distance) * 0.05;
                    node.x += Math.cos(angle) * force;
                    node.y += Math.sin(angle) * force;
                }
            }
        });
        
        // Update lines between nodes
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

    draw() {
        // Clear the entire canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw a solid background
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw lines with a subtle glow effect
        this.lines.forEach(line => {
            const gradient = this.ctx.createLinearGradient(line.x1, line.y1, line.x2, line.y2);
            gradient.addColorStop(0, `rgba(160, 214, 122, ${line.opacity * 0.8})`);
            gradient.addColorStop(1, `rgba(90, 154, 45, ${line.opacity * 0.8})`);
            
            this.ctx.beginPath();
            this.ctx.moveTo(line.x1, line.y1);
            this.ctx.lineTo(line.x2, line.y2);
            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();
        });
        
        // Draw nodes with pulsing colors
        this.nodes.forEach(node => {
            // Update pulse phase
            node.pulsePhase += node.pulseSpeed;
            const pulseIntensity = (Math.sin(node.pulsePhase) + 1) / 2; // 0 to 1
            
            // Alternate between cyan and magenta with pulsing opacity
            const isCyan = node.color === '#00ffff';
            const baseColor = isCyan ? 
                { r: 0, g: 255, b: 255 } : 
                { r: 255, g: 0, b: 255 };
                
            // Pulsing glow effect
            const glowGradient = this.ctx.createRadialGradient(
                node.x, node.y, 0,
                node.x, node.y, node.size * 4
            );
            
            glowGradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${0.3 + pulseIntensity * 0.4})`);
            glowGradient.addColorStop(1, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`);
            
            // Draw glow
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.size * 4, 0, Math.PI * 2);
            this.ctx.fillStyle = glowGradient;
            this.ctx.fill();
            
            // Node core with pulsing size and brightness
            const coreSize = node.size * (0.8 + pulseIntensity * 0.4);
            const brightness = 0.7 + pulseIntensity * 0.3;
            
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, coreSize, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${brightness})`;
            this.ctx.fill();
            
            // Add a small white highlight
            this.ctx.beginPath();
            this.ctx.arc(
                node.x - coreSize * 0.5, 
                node.y - coreSize * 0.5, 
                coreSize * 0.3, 
                0, 
                Math.PI * 2
            );
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
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
