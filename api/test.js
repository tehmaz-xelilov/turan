// api/test.js - Debug endpoint
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const vars = {
        hasGithubToken: !!process.env.GITHUB_TOKEN,
        tokenStart: (process.env.GITHUB_TOKEN || '').substring(0, 7) + '...',
        repoOwner: process.env.GITHUB_REPO_OWNER || 'NOT SET',
        repoName: process.env.GITHUB_REPO_NAME || 'NOT SET',
        productsFile: process.env.GITHUB_FILE_PATH_PRODUCTS || 'products.json',
        categoriesFile: process.env.GITHUB_FILE_PATH_CATEGORIES || 'categories.json',
        hasCloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
    };

    // Test GitHub connection
    let githubTest = null;
    try {
        if (vars.repoOwner !== 'NOT SET' && vars.repoName !== 'NOT SET') {
            const resp = await fetch(
                `https://api.github.com/repos/${vars.repoOwner}/${vars.repoName}`,
                {
                    headers: {
                        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                        'User-Agent': 'Test',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            githubTest = {
                status: resp.status,
                ok: resp.ok,
                repoFullName: resp.ok ? (await resp.json()).full_name : null
            };
        }
    } catch (e) {
        githubTest = { error: e.message };
    }

    res.status(200).json({
        status: 'API is working!',
        environment: vars,
        githubConnection: githubTest
    });
};