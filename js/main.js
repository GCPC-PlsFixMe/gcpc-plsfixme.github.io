// Main JavaScript for GCPC GitHub Pages
document.addEventListener('DOMContentLoaded', () => {
    // Update copyright year
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    // Initialize statistics with zeros
    ['linesOfCode', 'projectsCount', 'contributors'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
    });

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

    // Secret code: ELEVATE
    setupSecretCode();
});

// Secret code handling: ELEVATE -> illuminate tagline, flash, and open game
function setupSecretCode() {
    const TARGET = 'ELEVATE';
    const tagline = document.getElementById('tagline');
    if (!tagline) return;
    const letters = Array.from(tagline.querySelectorAll('.tag-letter'));
    if (letters.length !== TARGET.length) return;

    let index = 0;

    const clearActive = () => {
        letters.forEach(el => el.classList.remove('active'));
    };

    const onKeyDown = (e) => {
        // ignore if overlay/game is open
        const overlay = document.getElementById('flappyNodeOverlay');
        const isOpen = overlay && overlay.style.display !== 'none';
        if (isOpen) return;

        const key = e.key.toUpperCase();
        const expected = TARGET[index];
        if (key === expected) {
            letters[index].classList.add('active');
            index += 1;
            if (index === TARGET.length) {
                tagline.classList.add('flash');
                setTimeout(() => tagline.classList.remove('flash'), 800);
                index = 0;
                // Show quick unlock toast, then open overlay
                // Swap the tagline symbol from $ to # upon unlock
                const tagHash = tagline.querySelector('.tag-hash');
                if (tagHash) tagHash.textContent = '#';
                showUnlockToast('UNLOCKED');
                setTimeout(() => {
                    openFlappyNode();
                }, 650);
                clearActive();
            }
        } else if (/^[A-Z]$/.test(key)) {
            index = 0;
            clearActive();
        }
    };

    window.addEventListener('keydown', onKeyDown);

    // Wire the close button and FlappyNode exit hook
    const closeBtn = document.getElementById('flappyClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeFlappyNode);
    }
    if (window.FlappyNode) {
        window.FlappyNode.onRequestExit = closeFlappyNode;
    }
}

function openFlappyNode() {
    const overlay = document.getElementById('flappyNodeOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    if (window.FlappyNode && typeof window.FlappyNode.start === 'function') {
        window.FlappyNode.start('flappyCanvas');
        window.FlappyNode.onRequestExit = closeFlappyNode;
    }
}

function closeFlappyNode() {
    const overlay = document.getElementById('flappyNodeOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    if (window.FlappyNode && typeof window.FlappyNode.stop === 'function') {
        window.FlappyNode.stop();
    }
}

// Create and briefly show a neon unlock toast at center-top
function showUnlockToast(text = 'UNLOCKED') {
    const el = document.createElement('div');
    el.className = 'unlock-toast';
    el.textContent = text;
    document.body.appendChild(el);
    // Remove after animation
    setTimeout(() => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 950);
}

// Animate statistics counting (now handled by githubStats.js)
// This function is kept for backward compatibility
function animateStats() {
    // No-op as stats are now handled by githubStats.js
    return;
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
