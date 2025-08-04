const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');    // <-- Add this!
const cache = new NodeCache({ stdTTL: 86400 }); // <-- And this!
const fs = require('fs');
const path = require('path');

// Directory and file for persisting listing data between restarts.  The server
// will read from this file on boot and write fresh data any time the cache is
// refreshed.  Using a simple JSON file avoids the need for an external
// database and keeps your deployment portable.  If you prefer to use a real
// database (e.g. Postgres or Supabase) you can replace the file reads/writes
// with appropriate DB queries.
const DATA_DIR = path.join(__dirname, 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
// This is a simple Express server that fetches and serves real estate listings from Buildout's API.

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache
let listingsCache = [];
let listingsLastUpdated = null;

// Buildout API info
const BUILDOUT_API_URL = 'https://buildout.com/api/v1/ad60e63d545c98569763dd4b3bf32816b6f1b755/properties.json';
const PAGE_LIMIT = 1000; // Set to 1000 (max) or your known "enough" value

app.use(cors());

// Helper: Fetch ALL pages of listings
async function fetchAllListings() {
  let allListings = [];
  let offset = 0;

  while (true) {
    const url = `${BUILDOUT_API_URL}?limit=${PAGE_LIMIT}&offset=${offset}`;
    console.log(`Fetching: ${url}`);
    const res = await axios.get(url);
    const { properties = [], count } = res.data;
    allListings = allListings.concat(properties);
    if (properties.length < PAGE_LIMIT) break; // Got last page
    offset += PAGE_LIMIT;
  }

  return allListings;
}

// On startup: Load listings
async function loadCache() {
  try {
    console.log('⏳ Fetching listings from Buildout API...');
    const freshListings = await fetchAllListings();
    listingsCache = freshListings;
    listingsLastUpdated = new Date();
    console.log(`✅ Listings cache loaded: ${listingsCache.length} listings.`);

    // Persist data to disk so that it survives server restarts.  Write to
    // a temporary file first then rename it to avoid corrupting the main file.
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = LISTINGS_FILE + '.tmp';
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        lastUpdated: listingsLastUpdated.toISOString(),
        listings: listingsCache
      }),
      'utf8'
    );
    fs.renameSync(tmpFile, LISTINGS_FILE);
  } catch (err) {
    console.error('❌ Error loading listings:', err.message);
    // If fetching fails and we have a persisted copy, fall back to that.
    if (fs.existsSync(LISTINGS_FILE)) {
      try {
        const json = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
        listingsCache = json.listings || [];
        listingsLastUpdated = json.lastUpdated
          ? new Date(json.lastUpdated)
          : null;
        console.log(
          `⚠️ Using cached file data with ${listingsCache.length} listings (last updated ${listingsLastUpdated}).`
        );
        return;
      } catch (readErr) {
        console.error(
          '❌ Failed to read fallback cache file:',
          readErr.message
        );
      }
    }
    // As a last resort, clear the cache to avoid serving stale/incomplete data.
    listingsCache = [];
    listingsLastUpdated = null;
  }
}

// Listings endpoint (serves from cache only).  Supports optional
// query parameters for server-side filtering:
//   search - free text search across address, title and broker names
//   type   - property type id to filter results
app.get('/api/listings', (req, res) => {
  // Optional query parameters:
  //   search=<text> – free text search across address, city, state, zip, and title
  //   type=<property_type_id> – numeric ID of the property type to filter by
  const search = (req.query.search || '').toString().toLowerCase();
  const typeFilter = (req.query.type || '').toString();

  let filtered = listingsCache;

  if (typeFilter) {
    filtered = filtered.filter(
      (l) => String(l.property_type_id) === typeFilter
    );
  }
  if (search) {
    filtered = filtered.filter((l) => {
      const address = `${l.address || ''} ${l.city || ''} ${l.state || ''} ${
        l.zip || ''
      }`.toLowerCase();
      const title =
        (l.lease_listing_web_title ||
          l.sale_listing_web_title ||
          '')?.toLowerCase() || '';
      const brokers = `${l.brokerDisplay || ''}`.toLowerCase();
      return (
        address.includes(search) ||
        title.includes(search) ||
        brokers.includes(search)
      );
    });
  }
  res.json({
    properties: filtered,
    last_updated: listingsLastUpdated,
    count: filtered.length
  });
});

// (Optional) Manual refresh endpoint
app.post('/api/refresh', async (req, res) => {
  await loadCache();
  res.json({ refreshed: true, count: listingsCache.length });
});

// Also preload brokers (optional)
let brokersCache = [];
app.get('/api/brokers', async (req, res) => {
  if (brokersCache.length) return res.json({ brokers: brokersCache });
  try {
    const resp = await axios.get('https://buildout.com/api/v1/ad60e63d545c98569763dd4b3bf32816b6f1b755/brokers.json');
    brokersCache = resp.data.brokers || [];
    res.json({ brokers: brokersCache });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch brokers' });
  }
});

// Lease Spaces endpoint with cache
app.get('/api/lease_spaces', async (req, res) => {
  const cacheKey = 'lease_spaces';
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json(cached); // Serve cached
  }

  try {
    // You might need to adjust the limit for your API!
    const response = await axios.get('https://buildout.com/api/v1/ad60e63d545c98569763dd4b3bf32816b6f1b755/lease_spaces.json', {
      params: { limit: 1000 } // Increase if your org has more than 1000 spaces!
    });
    cache.set(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error fetching lease spaces:", error.message);
    res.status(500).json({ error: 'Failed to fetch lease spaces', message: error.message });
  }
});

// Start server & load cache on boot
app.listen(PORT, async () => {
  // On boot, attempt to load persisted listings from disk.  This avoids
  // hammering the Buildout API every time the process starts.
  if (fs.existsSync(LISTINGS_FILE)) {
    try {
      const json = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
      listingsCache = json.listings || [];
      listingsLastUpdated = json.lastUpdated
        ? new Date(json.lastUpdated)
        : null;
      console.log(
        `💾 Loaded ${listingsCache.length} listings from disk (last updated ${listingsLastUpdated}).`
      );
    } catch (err) {
      console.warn(
        '⚠️ Failed to parse existing cache file, ignoring:',
        err.message
      );
    }
  }

  // If we have no cached data or it's older than 24 hours, refresh now.
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (
    !listingsLastUpdated ||
    now - new Date(listingsLastUpdated).getTime() > oneDayMs
  ) {
    await loadCache();
  } else {
    console.log('✅ Using existing cached data; skipping immediate refresh.');
  }

  // Set up automatic refresh every 24 hours.  This ensures your data stays
  // current without manual intervention or re-deploys.  If you need more
  // frequent updates, adjust the interval accordingly.
  setInterval(async () => {
    console.log('🔄 Performing scheduled cache refresh…');
    await loadCache();
  }, oneDayMs);

  console.log(`✅ Proxy server running on port ${PORT}`);
});
