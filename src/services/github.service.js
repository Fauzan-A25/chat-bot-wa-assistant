function parseGithubUrl(url) {
    const regex = /github\.com\/([^\/]+)\/([^\/]+)/;
    const match = url.match(regex);
    
    if (!match) return null;
    
    return {
        owner: match[1],
        repo: match[2].replace('.git', '')
    };
}

async function fetchGithubRepo(owner, repo) {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'WhatsApp-Portfolio-Bot'
            }
        });
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ GitHub API failed:', error);
        throw error;
    }
}

async function fetchGithubReadme(owner, repo) {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
            headers: {
                'Accept': 'application/vnd.github.v3.raw',
                'User-Agent': 'WhatsApp-Portfolio-Bot'
            }
        });
        
        if (!response.ok) {
            throw new Error(`README not found: ${response.status}`);
        }
        
        return await response.text();
    } catch (error) {
        console.error('❌ README fetch failed:', error);
        return null;
    }
}

module.exports = {
    parseGithubUrl,
    fetchGithubRepo,
    fetchGithubReadme
};
