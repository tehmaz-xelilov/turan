// api/products.js - Simple working version
module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
        const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
        const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH_PRODUCTS || 'products.json';

        // Check env variables
        if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
            console.error('Missing env vars:', { 
                token: !!GITHUB_TOKEN, 
                owner: !!GITHUB_REPO_OWNER, 
                repo: !!GITHUB_REPO_NAME 
            });
            return res.status(500).json({ 
                error: 'Server configuration error',
                details: 'Environment variables not set'
            });
        }

        const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE_PATH}`;

        // Helper: Get file from GitHub
        async function getFromGitHub() {
            const response = await fetch(GITHUB_API, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Turan-Leather'
                }
            });

            if (response.status === 404) {
                return { content: [], sha: null };
            }

            if (!response.ok) {
                throw new Error(`GitHub error: ${response.status}`);
            }

            const data = await response.json();
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            return { content: JSON.parse(content), sha: data.sha };
        }

        // Helper: Save file to GitHub
        async function saveToGitHub(data, sha, message) {
            const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
            
            const body = { message, content };
            if (sha) body.sha = sha;

            const response = await fetch(GITHUB_API, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Turan-Leather'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Save failed');
            }

            return response.json();
        }

        // ROUTES
        const method = req.method;

        // GET all products
        if (method === 'GET') {
            const { content } = await getFromGitHub();
            return res.status(200).json(Array.isArray(content) ? content : []);
        }

        // POST new product
        if (method === 'POST') {
            const product = req.body;
            
            if (!product.name || !product.price) {
                return res.status(400).json({ error: 'Name and price required' });
            }

            const { content, sha } = await getFromGitHub();
            const products = Array.isArray(content) ? content : [];
            
            product.id = product.id || 'prod_' + Date.now();
            product.createdAt = new Date().toISOString();
            
            products.push(product);
            await saveToGitHub(products, sha, `Add: ${product.name}`);

            return res.status(201).json(product);
        }

        // PUT update product
        if (method === 'PUT') {
            const { id } = req.query;
            const updates = req.body;

            if (!id) return res.status(400).json({ error: 'ID required' });

            const { content, sha } = await getFromGitHub();
            const products = Array.isArray(content) ? content : [];
            const index = products.findIndex(p => p.id === id);

            if (index === -1) return res.status(404).json({ error: 'Not found' });

            products[index] = { ...products[index], ...updates, id: products[index].id };
            await saveToGitHub(products, sha, `Update: ${products[index].name}`);

            return res.status(200).json(products[index]);
        }

        // DELETE product
        if (method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'ID required' });

            const { content, sha } = await getFromGitHub();
            const products = Array.isArray(content) ? content : [];
            const filtered = products.filter(p => p.id !== id);

            if (filtered.length === products.length) {
                return res.status(404).json({ error: 'Not found' });
            }

            await saveToGitHub(filtered, sha, `Delete: ${id}`);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            error: error.message || 'Internal error',
            env: {
                hasToken: !!process.env.GITHUB_TOKEN,
                hasOwner: !!process.env.GITHUB_REPO_OWNER,
                hasRepo: !!process.env.GITHUB_REPO_NAME
            }
        });
    }
};