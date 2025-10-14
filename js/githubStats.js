// GitHub Stats for GCPC
async function fetchGitHubStats() {
    const username = 'GCPC-PlsFixMe';
    const stats = {
        linesOfCode: 0,
        projectsCount: 0,
        contributors: new Set()
    };

    // Show loading state
    const statElements = {
        linesOfCode: document.getElementById('linesOfCode'),
        projectsCount: document.getElementById('projectsCount'),
        contributors: document.getElementById('contributors')
    };

    // Set loading state
    Object.values(statElements).forEach(el => {
        if (el) el.textContent = '...';
    });

    // GitHub API configuration
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        // Add User-Agent header as required by GitHub API
        'User-Agent': 'GCPC-Website/1.0'
    };

    try {
        // Get user public repositories (include all pages)
        let allRepos = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const response = await fetch(
                `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`, 
                { headers }
            );
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }
            
            const repos = await response.json();
            if (!Array.isArray(repos) || repos.length === 0) {
                hasMore = false;
            } else {
                allRepos = allRepos.concat(repos);
                page++;
                // Safety check to prevent infinite loops
                if (page > 10) break;
            }
        }

        // Filter out forks and archived repositories
        const activeRepos = allRepos.filter(repo => !repo.fork && !repo.archived);
        stats.projectsCount = activeRepos.length;
        
        // Get all contributors across all repositories
        const allContributors = new Set();
        
        // Process each repository
        for (const repo of activeRepos) {
            try {
                // Get repository contributors with pagination
                let page = 1;
                let hasMoreContributors = true;
                
                while (hasMoreContributors) {
                    const response = await fetch(
                        `${repo.contributors_url}?per_page=100&page=${page}`,
                        { headers }
                    );
                    
                    if (response.ok) {
                        const contributors = await response.json();
                        
                        if (Array.isArray(contributors) && contributors.length > 0) {
                            contributors.forEach(contributor => {
                                if (contributor && contributor.login) {
                                    allContributors.add(contributor.login);
                                }
                            });
                            page++;
                            // Safety check to prevent infinite loops
                            if (page > 10) break;
                        } else {
                            hasMoreContributors = false;
                        }
                    } else {
                        hasMoreContributors = false;
                    }
                }
                
                // Get repository languages to better estimate lines of code
                const languagesResponse = await fetch(repo.languages_url, { headers });
                if (languagesResponse.ok) {
                    const languages = await languagesResponse.json();
                    if (languages) {
                        // Sum up all language bytes
                        const totalBytes = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
                        // Estimate lines of code (average ~45 bytes per line including whitespace, comments)
                        stats.linesOfCode += Math.floor(totalBytes / 45);
                    }
                }
                
            } catch (error) {
                console.warn(`Skipping repository ${repo.name}:`, error.message);
                continue;
            }
        }
        
        // Update contributors count
        stats.contributors = allContributors;
        
        // Update the DOM with animation
        if (statElements.linesOfCode) {
            animateValue(statElements.linesOfCode, 0, stats.linesOfCode, 2000);
        }
        if (statElements.projectsCount) {
            animateValue(statElements.projectsCount, 0, stats.projectsCount, 1000);
        }
        if (statElements.contributors) {
            animateValue(statElements.contributors, 0, stats.contributors.size, 1500);
        }
        
    } catch (error) {
        console.error('Error fetching GitHub statistics:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            username: username
        });
        
        // Fallback to default values if there's an error
        if (statElements.linesOfCode) statElements.linesOfCode.textContent = '10,000+';
        if (statElements.projectsCount) statElements.projectsCount.textContent = '3+';
        if (statElements.contributors) statElements.contributors.textContent = '2+';
    }
}

// Helper function to animate counting up
function animateValue(element, start, end, duration) {
    const range = end - start;
    const minFrameTime = 50; // 50ms = 20fps
    let startTime = null;
    
    function updateCounter(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const current = Math.floor(start + (range * progress));
        element.textContent = current.toLocaleString();
        
        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent = end.toLocaleString();
        }
    }
    
    requestAnimationFrame(updateCounter);
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add a small delay to ensure the page is fully loaded
    setTimeout(fetchGitHubStats, 500);
});
