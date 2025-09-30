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

    // Footer Configuration
    footer: {
        enabled: true,  // Set to false to disable the footer
        className: 'main-footer',  // CSS class for the footer element
        socialLinks: [
            {
                url: 'https://gcpc.plsfix.me',
                title: 'Home',
                iconClass: 'fas fa-home',
                target: '_blank',
                rel: 'noopener noreferrer'
            },
            {
                url: 'https://github.com/GCPC-PlsFixMe',
                title: 'GitHub',
                iconClass: 'fab fa-github',
                target: '_blank',
                rel: 'noopener noreferrer'
            }
        ],
        copyright: {
            text: 'GCPC',
            showYear: true  // Set to false to hide the year
        }
    },

    // Add other site-wide configurations here
};

// Make the configuration available globally
window.SITE_CONFIG = CONFIG;

/**
 * Generates the footer HTML based on the site configuration
 * @returns {string} HTML string for the footer
 */
function generateFooter() {
    if (!CONFIG.footer.enabled) {
        return '';
    }

    const currentYear = new Date().getFullYear();
    let footerHTML = `<footer class="${CONFIG.footer.className}">`;

    // Add social links
    footerHTML += '<div class="social-links">';
    CONFIG.footer.socialLinks.forEach(link => {
        footerHTML += `
            <a href="${link.url}" target="${link.target}" rel="${link.rel}" title="${link.title}">
                <i class="${link.iconClass}"></i>
            </a>`;
    });
    footerHTML += '</div>';

    // Add copyright notice
    footerHTML += '<p>&copy; ';
    if (CONFIG.footer.copyright.showYear) {
        footerHTML += `<span id="currentYear"></span> `;
    }
    footerHTML += `${CONFIG.footer.copyright.text}.</p>`;

    footerHTML += '</footer>';

    return footerHTML;
}

// Make the function available globally
window.generateFooter = generateFooter;
