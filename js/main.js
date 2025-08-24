// Main JavaScript for GCPC GitHub Pages
document.addEventListener('DOMContentLoaded', () => {
    // Update copyright year
    document.getElementById('currentYear').textContent = new Date().getFullYear();
    
    // Animate stats counting
    animateStats();
    
    // Add smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Add scroll animations
    setupScrollAnimations();
    
    // Load projects dynamically (placeholder for future API integration)
    loadProjects();
});

// Animate statistics counting
function animateStats() {
    const statElements = {
        linesOfCode: { target: 10000, duration: 2000, current: 0 },
        projectsCount: { target: 5, duration: 1500, current: 0 },
        contributors: { target: 10, duration: 1800, current: 0 }
    };
    
    const startAnimation = (elementId, target, duration) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const startTime = performance.now();
        const startValue = 0;
        const endValue = target;
        
        const updateCounter = (currentTime) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            
            // Easing function for smooth animation
            const easeOutQuad = t => t * (2 - t);
            const currentValue = Math.floor(easeOutQuad(progress) * endValue);
            
            element.textContent = currentValue.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            } else {
                element.textContent = endValue.toLocaleString();
            }
        };
        
        requestAnimationFrame(updateCounter);
    };
    
    // Start animations when stats are in viewport
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                Object.entries(statElements).forEach(([id, { target, duration }]) => {
                    startAnimation(id, target, duration);
                });
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });
    
    const statsSection = document.querySelector('.stats');
    if (statsSection) {
        observer.observe(statsSection);
    }
}

// Setup scroll animations for sections
function setupScrollAnimations() {
    const sections = document.querySelectorAll('section');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(section);
    });
}

// Load projects (placeholder for future API integration)
function loadProjects() {
    // This is a placeholder for future project loading from an API
    // For now, we'll use the static content from the HTML
    
    // Example of how you might load projects in the future:
    /*
    fetch('https://api.github.com/users/GCPC-PlsFixMe/repos')
        .then(response => response.json())
        .then(projects => {
            const projectGrid = document.getElementById('projectGrid');
            if (!projectGrid) return;
            
            // Clear loading/placeholder content
            projectGrid.innerHTML = '';
            
            // Add each project to the grid
            projects.slice(0, 6).forEach(project => {
                const projectCard = document.createElement('div');
                projectCard.className = 'project-card';
                projectCard.innerHTML = `
                    <i class="fas fa-code-branch"></i>
                    <h3>${project.name}</h3>
                    <p>${project.description || 'No description available'}</p>
                    <a href="${project.html_url}" target="_blank" class="project-link">View on GitHub</a>
                `;
                projectGrid.appendChild(projectCard);
            });
        })
        .catch(error => {
            console.error('Error loading projects:', error);
        });
    */
}

// Add a simple typewriter effect for future use
class Typewriter {
    constructor(element, text, speed = 50) {
        this.element = element;
        this.text = text;
        this.speed = speed;
        this.currentText = '';
        this.charIndex = 0;
    }
    
    type() {
        if (this.charIndex < this.text.length) {
            this.currentText += this.text.charAt(this.charIndex);
            this.element.textContent = this.currentText;
            this.charIndex++;
            setTimeout(() => this.type(), this.speed);
        }
    }
    
    start() {
        this.element.textContent = '';
        this.currentText = '';
        this.charIndex = 0;
        this.type();
    }
}

// Export for potential future use
window.GCPC = {
    Typewriter
};
