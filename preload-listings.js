const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 86400 }); // 24h

async function preloadListings() {
  try {
    const response = await axios.get('https://buildout.com/api/v1/ad60e63d545c98569763dd4b3bf32816b6f1b755/properties.json');
    cache.set('listings', response.data);
    console.log('✅ Listings preloaded into cache');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to preload listings:', error.message);
    process.exit(1);
  }
}

preloadListings();
