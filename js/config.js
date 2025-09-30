/**
 * Site Configuration
 * This file contains configuration options for various site features.
 */

const CONFIG = {
    // Construction Alert Configuration
    constructionAlert: {
        enabled: true,  // Set to false to disable the construction alert
        title: "Under Construction",
        message: "This website is currently under construction. Some features may not be fully functional yet.",
        showCloseButton: true,
        autoClose: false,  // Set to true to auto-close after delay
        autoCloseDelay: 10000,  // 10 seconds in milliseconds
        // Styling options
        style: {
            position: 'top',  // 'top' or 'bottom'
            showIcon: true,   // Show the tools icon
            icon: 'fas fa-tools'  // Font Awesome icon class
        }
    },
    
    // Add other site-wide configurations here
};

// Make the configuration available globally
window.SITE_CONFIG = CONFIG;
