/**
 * Construction Alert Module
 * Handles the display and behavior of the construction alert based on configuration
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check if config exists and construction alert is enabled
    if (!window.SITE_CONFIG?.constructionAlert?.enabled) {
        return;
    }
    
    const config = window.SITE_CONFIG.constructionAlert;
    const alertElement = document.getElementById('constructionAlert');
    
    if (!alertElement) return;

    const titleElement = document.getElementById('constructionTitle');
    const messageElement = document.getElementById('constructionMessage');

    // Set alert content from config
    if (titleElement) {
        titleElement.innerHTML = '';
        if (config.style?.showIcon !== false && config.style?.icon) {
            const icon = document.createElement('i');
            icon.className = config.style.icon;
            titleElement.appendChild(icon);
            titleElement.appendChild(document.createTextNode(' '));
        }
        titleElement.appendChild(document.createTextNode(config.title || 'Under Construction'));
    }

    if (messageElement) {
        messageElement.textContent = config.message || 'This website is currently under construction. Some features may not be fully functional yet.';
    }

    // Apply position class if specified
    if (config.style?.position === 'bottom') {
        alertElement.classList.add('bottom');
    } else {
        alertElement.classList.add('top');
    }

    // Show the alert with slide-in animation
    setTimeout(() => {
        alertElement.style.display = 'block';
        // Trigger reflow
        void alertElement.offsetWidth;
        // Add show class to trigger slide-in
        alertElement.classList.add('show');
    }, 1000);

    // Close alert when clicked anywhere
    alertElement.addEventListener('click', () => {
        alertElement.classList.remove('show');
        // Wait for animation to complete before hiding
        setTimeout(() => {
            alertElement.style.display = 'none';
            // Store in localStorage to prevent showing again
            try {
                localStorage.setItem('constructionAlertClosed', 'true');
            } catch (e) {
                console.warn('Could not access localStorage', e);
            }
        }, 500);
    });

    // Auto-close if enabled
    if (config.autoClose && config.autoCloseDelay > 0) {
        setTimeout(() => {
            alertElement.classList.remove('show');
            setTimeout(() => {
                alertElement.style.display = 'none';
            }, 500);
        }, config.autoCloseDelay);
    }

    // Check if alert was previously closed
    try {
        if (localStorage.getItem('constructionAlertClosed') === 'true') {
            alertElement.style.display = 'none';
        }
    } catch (e) {
        console.warn('Could not access localStorage', e);
    }
});
