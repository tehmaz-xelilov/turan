// api/cloudinary-delete.js - Vercel Serverless Function
// Handles deletion of images from Cloudinary

const crypto = require('crypto');

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

function generateSignature(publicId, timestamp) {
    const str = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    return crypto.createHash('sha1').update(str).digest('hex');
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { public_id } = req.body;
        
        if (!public_id) {
            return res.status(400).json({ error: 'public_id is required' });
        }
        
        const timestamp = Math.round(new Date().getTime() / 1000);
        const signature = generateSignature(public_id, timestamp);
        
        const formData = new FormData();
        formData.append('public_id', public_id);
        formData.append('timestamp', timestamp);
        formData.append('api_key', CLOUDINARY_API_KEY);
        formData.append('signature', signature);
        
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        const result = await response.json();
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return res.status(500).json({ error: error.message || 'Delete failed' });
    }
};