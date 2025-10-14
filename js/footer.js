/**
 * Footer Module
 * Injects the site footer into pages
 */

(function() {
    const footerHTML = `
        <footer class="main-footer">
            <div class="social-links">
                <a href="https://gcpc.plsfix.me" target="_blank" rel="noopener noreferrer" title="Home">
                    <i class="fas fa-home"></i>
                </a>
                <a href="https://github.com/GCPC-PlsFixMe" target="_blank" rel="noopener noreferrer" title="GitHub">
                    <i class="fab fa-github"></i>
                </a>
            </div>
            <p>&copy; <span id="currentYear"></span> GCPC. All rights reserved.</p>
        </footer>
    `;

    // Function to inject footer
    function injectFooter() {
        const footerContainer = document.getElementById('footer-container');
        if (footerContainer) {
            footerContainer.innerHTML = footerHTML;
            
            // Set the current year
            const yearElement = document.getElementById('currentYear');
            if (yearElement) {
                yearElement.textContent = new Date().getFullYear();
            }
        }
    }

    // Inject footer as soon as DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
        // DOM already loaded
        injectFooter();
    }
})();
