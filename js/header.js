/**
 * Header Module
 * Injects the site header into pages
 */

(function() {
    const headerHTML = `
        <header>
            <h1>
                <a href="https://gcpc.plsfix.me" target="_blank" rel="noopener noreferrer" class="title-link">
                    <span class="title-word">
                        <span class="letter">G</span>
                        <span class="letter">C</span>
                        <span class="letter">P</span>
                        <span class="letter">C</span>
                    </span>
                </a>
                <span class="heart" aria-hidden="true">❤️</span>
                <a href="https://github.com/GCPC-PlsFixMe" target="_blank" rel="noopener noreferrer" class="title-link">
                    <span class="title-word">
                        <span class="letter">G</span>
                        <span class="letter">i</span>
                        <span class="letter">t</span>
                        <span class="letter">H</span>
                        <span class="letter">u</span>
                        <span class="letter">b</span>
                    </span>
                </a>
            </h1>
            <p class="tagline" id="tagline">
                <span class="tag-hash">$</span>
                <span class="tag-letters" aria-label="ELEVATE">
                    <span class="tag-letter" data-letter="E">E</span>
                    <span class="tag-letter" data-letter="L">L</span>
                    <span class="tag-letter" data-letter="E">E</span>
                    <span class="tag-letter" data-letter="V">V</span>
                    <span class="tag-letter" data-letter="A">A</span>
                    <span class="tag-letter" data-letter="T">T</span>
                    <span class="tag-letter" data-letter="E">E</span>
                </span>
            </p>
            
            <nav class="main-nav">
                <div class="nav-container">
                    <a href="/" class="nav-link">
                        <i class="fas fa-home"></i>
                        <span>Home</span>
                    </a>
                    <a href="/subpages/projects/" class="nav-link">
                        <i class="fas fa-code-branch"></i>
                        <span>Projects</span>
                    </a>
                    <a href="/subpages/documents/" class="nav-link">
                        <i class="fas fa-book"></i>
                        <span>Documents</span>
                    </a>
                    <a href="/subpages/rabbit-hole/" class="nav-link">
                        <i class="fas fa-flask"></i>
                        <span>Rabbit Hole</span>
                    </a>
                    <a href="/subpages/about/" class="nav-link">
                        <i class="fas fa-info-circle"></i>
                        <span>About</span>
                    </a>
                    <a href="https://github.com/GCPC-PlsFixMe" class="nav-link" target="_blank" rel="noopener noreferrer">
                        <i class="fab fa-github"></i>
                        <span>GitHub</span>
                    </a>
                </div>
            </nav>
        </header>
    `;

    // Function to inject header
    function injectHeader() {
        const headerContainer = document.getElementById('header-container');
        if (headerContainer) {
            headerContainer.innerHTML = headerHTML;
        }
    }

    // Inject header as soon as DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectHeader);
    } else {
        // DOM already loaded
        injectHeader();
    }
})();
