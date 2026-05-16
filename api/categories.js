// api/categories.js - Simple working version
module.exports = async (req, res) => {
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
        const CATEGORIES_PATH = process.env.GITHUB_FILE_PATH_CATEGORIES || 'categories.json';

        if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
            return res.status(500).json({ 
                error: 'Configuration error',
                debug: { token: !!GITHUB_TOKEN, owner: !!GITHUB_REPO_OWNER, repo: !!GITHUB_REPO_NAME }
            });
        }

        const API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${CATEGORIES_PATH}`;

        async function getFromGitHub() {
            const resp = await fetch(API_URL, {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Turan'
                }
            });

            if (resp.status === 404) return { data: ["Hamısı"], sha: null };
            if (!resp.ok) throw new Error(`GitHub: ${resp.status}`);

            const json = await resp.json();
            const content = Buffer.from(json.content, 'base64').toString('utf-8');
            const parsed = JSON.parse(content);
            
            if (!parsed.includes('Hamısı')) parsed.unshift('Hamısı');
            
            return { data: parsed, sha: json.sha };
        }

        async function saveToGitHub(data, sha, msg) {
            const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
            const body = { message: msg, content };
            if (sha) body.sha = sha;

            const resp = await fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Turan'
                },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.message || 'Save failed');
            }

            return resp.json();
        }

        const { method } = req;

        // GET
        if (method === 'GET') {
            const { data } = await getFromGitHub();
            return res.status(200).json(data);
        }

        // POST
        if (method === 'POST') {
            const { name } = req.body;
            if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
            if (name === 'Hamısı') return res.status(400).json({ error: 'Reserved name' });

            const { data, sha } = await getFromGitHub();
            if (data.includes(name)) return res.status(400).json({ error: 'Exists' });

            data.push(name);
            await saveToGitHub(data, sha, `Add category: ${name}`);

            return res.status(201).json({ success: true, name });
        }

        // PUT
        if (method === 'PUT') {
            const { oldName, name } = req.body;
            if (!oldName || !name) return res.status(400).json({ error: 'Params required' });

            const { data, sha } = await getFromGitHub();
            const idx = data.indexOf(oldName);
            if (idx === -1) return res.status(404).json({ error: 'Not found' });

            data[idx] = name;
            await saveToGitHub(data, sha, `Rename: ${oldName} -> ${name}`);

            return res.status(200).json({ success: true });
        }

        // DELETE
        if (method === 'DELETE') {
            const { id } = req.query;
            if (!id || id === 'Hamısı') return res.status(400).json({ error: 'Cannot delete' });

            const { data, sha } = await getFromGitHub();
            const filtered = data.filter(c => c !== id);
            
            if (filtered.length === data.length) return res.status(404).json({ error: 'Not found' });

            await saveToGitHub(filtered, sha, `Delete: ${id}`);

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
};