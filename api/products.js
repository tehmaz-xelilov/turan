// api/products.js - Vercel Serverless Function
// Handles GET, POST, PUT, DELETE for products

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH_PRODUCTS || 'products.json';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE_PATH}`;

// Helper: Fetch current products from GitHub
async function getProductsFromGitHub() {
    try {
        const response = await fetch(GITHUB_API_BASE, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 404) {
            // File doesn't exist, return empty array
            return { products: [], sha: null };
        }
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const products = JSON.parse(content);
        
        return { products: Array.isArray(products) ? products : [], sha: data.sha };
    } catch (error) {
        console.error('Error fetching from GitHub:', error);
        // If file doesn't exist, return empty
        return { products: [], sha: null };
    }
}

// Helper: Save products to GitHub
async function saveProductsToGitHub(products, sha = null, message = 'Update products.json') {
    const content = Buffer.from(JSON.stringify(products, null, 2)).toString('base64');
    
    const body = {
        message: message,
        content: content
    };
    
    if (sha) {
        body.sha = sha;
    }
    
    const response = await fetch(GITHUB_API_BASE, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub save error: ${error.message}`);
    }
    
    return await response.json();
}

// Helper: Delete image from Cloudinary
async function deleteCloudinaryImage(publicId) {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = generateCloudinarySignature(publicId, timestamp);
    
    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', timestamp);
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('signature', signature);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
        method: 'POST',
        body: formData
    });
    
    return await response.json();
}

function generateCloudinarySignature(publicId, timestamp) {
    const crypto = require('crypto');
    const str = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    return crypto.createHash('sha1').update(str).digest('hex');
}

function extractPublicIdFromUrl(url) {
    try {
        const urlParts = url.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex === -1) return null;
        
        let publicIdWithExt = urlParts.slice(uploadIndex + 1).join('/');
        publicIdWithExt = publicIdWithExt.replace(/^v\d+\//, '');
        return publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
    } catch {
        return null;
    }
}

// Main handler
module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const method = req.method;
        const { id } = req.query;
        
        // GET - Fetch all products
        if (method === 'GET') {
            const { products } = await getProductsFromGitHub();
            return res.status(200).json(products);
        }
        
        // POST - Add new product
        if (method === 'POST') {
            const newProduct = req.body;
            
            if (!newProduct.name || !newProduct.price) {
                return res.status(400).json({ error: 'Name and price are required' });
            }
            
            if (!newProduct.id) {
                newProduct.id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            newProduct.createdAt = newProduct.createdAt || new Date().toISOString();
            newProduct.updatedAt = new Date().toISOString();
            
            const { products, sha } = await getProductsFromGitHub();
            products.push(newProduct);
            
            await saveProductsToGitHub(products, sha, `Add product: ${newProduct.name}`);
            
            return res.status(201).json(newProduct);
        }
        
        // PUT - Update product
        if (method === 'PUT') {
            if (!id) {
                return res.status(400).json({ error: 'Product ID is required' });
            }
            
            const updatedData = req.body;
            const { products, sha } = await getProductsFromGitHub();
            
            const index = products.findIndex(p => p.id === id);
            if (index === -1) {
                return res.status(404).json({ error: 'Product not found' });
            }
            
            // Merge existing product with updates
            products[index] = {
                ...products[index],
                ...updatedData,
                id: products[index].id, // Preserve original ID
                updatedAt: new Date().toISOString()
            };
            
            await saveProductsToGitHub(products, sha, `Update product: ${products[index].name}`);
            
            return res.status(200).json(products[index]);
        }
        
        // DELETE - Delete product
        if (method === 'DELETE') {
            if (!id) {
                return res.status(400).json({ error: 'Product ID is required' });
            }
            
            const { products, sha } = await getProductsFromGitHub();
            
            const productToDelete = products.find(p => p.id === id);
            if (!productToDelete) {
                return res.status(404).json({ error: 'Product not found' });
            }
            
            // Delete images from Cloudinary
            const imagesToDelete = [
                productToDelete.mainImage,
                ...(productToDelete.images || [])
            ].filter(Boolean);
            
            for (const imageUrl of imagesToDelete) {
                const publicId = extractPublicIdFromUrl(imageUrl);
                if (publicId) {
                    try {
                        await deleteCloudinaryImage(publicId);
                    } catch (err) {
                        console.error(`Failed to delete image ${publicId}:`, err.message);
                    }
                }
            }
            
            // Remove product from array
            const updatedProducts = products.filter(p => p.id !== id);
            
            await saveProductsToGitHub(updatedProducts, sha, `Delete product: ${productToDelete.name}`);
            
            return res.status(200).json({ success: true, message: 'Product deleted' });
        }
        
        return res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};