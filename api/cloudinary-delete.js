// api/cloudinary-delete.js
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST allowed' });
    }

    try {
        const { public_id } = req.body;
        
        if (!public_id) {
            return res.status(400).json({ error: 'public_id required' });
        }

        const timestamp = Math.round(Date.now() / 1000);
        const signature = crypto
            .createHash('sha1')
            .update(`public_id=${public_id}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`)
            .digest('hex');

        const formData = new URLSearchParams();
        formData.append('public_id', public_id);
        formData.append('timestamp', timestamp);
        formData.append('api_key', process.env.CLOUDINARY_API_KEY);
        formData.append('signature', signature);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            }
        );

        const result = await response.json();
        return res.status(200).json(result);

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
};