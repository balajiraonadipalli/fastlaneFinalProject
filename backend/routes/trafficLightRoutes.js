const TrafficLight = require('../models/TrafficLight');
const https = require('https');

// Overpass API base URL
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// Helper function to make Overpass API request
const queryOverpass = (query) => {
  return new Promise((resolve, reject) => {
    const postData = query;
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000 // 30 seconds timeout
    };

    const req = https.request(OVERPASS_API_URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (err) {
          reject(new Error(`Failed to parse Overpass response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Overpass API request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Overpass API request timeout'));
    });

    req.write(postData);
    req.end();
  });
};

module.exports = (app) => {
  // Seed initial lights (optional helper)
  app.post('/api/traffic-lights/seed', async (req, res) => {
    try {
      const lights = req.body?.lights || [];
      if (!Array.isArray(lights) || lights.length === 0) {
        return res.status(400).json({ success: false, message: 'lights array required' });
      }

      const inserted = await TrafficLight.insertMany(lights);
      res.json({ success: true, count: inserted.length, lights: inserted });
    } catch (err) {
      res.status(500).json({ success: false, message: 'seed failed', error: err.message });
    }
  });

  // Create single traffic light
  app.post('/api/traffic-lights', async (req, res) => {
    try {
      const light = await TrafficLight.create(req.body);
      res.json({ success: true, light });
    } catch (err) {
      res.status(500).json({ success: false, message: 'create failed', error: err.message });
    }
  });

  // Get all (optional bounding box query)
  app.get('/api/traffic-lights', async (req, res) => {
    try {
      const { minLat, maxLat, minLng, maxLng } = req.query;
      let query = {};
      if ([minLat, maxLat, minLng, maxLng].every(v => v !== undefined)) {
        query = {
          latitude: { $gte: parseFloat(minLat), $lte: parseFloat(maxLat) },
          longitude: { $gte: parseFloat(minLng), $lte: parseFloat(maxLng) }
        };
      }
      const lights = await TrafficLight.find(query).sort({ createdAt: -1 });
      res.json({ success: true, count: lights.length, lights });
    } catch (err) {
      res.status(500).json({ success: false, message: 'fetch failed', error: err.message });
    }
  });

  // Query by corridor between two points (simple buffer in km)
  app.get('/api/traffic-lights/corridor', async (req, res) => {
    try {
      const { startLat, startLng, endLat, endLng, bufferKm = 1 } = req.query;
      if (!startLat || !startLng || !endLat || !endLng) {
        return res.status(400).json({ success: false, message: 'startLat,startLng,endLat,endLng required' });
      }

      const sLat = parseFloat(startLat);
      const sLng = parseFloat(startLng);
      const eLat = parseFloat(endLat);
      const eLng = parseFloat(endLng);
      const buf = parseFloat(bufferKm);

      // Pre-filter using expanded bounding box to reduce DB results
      const minLat = Math.min(sLat, eLat) - (buf / 111); // ~1 deg lat ~ 111km
      const maxLat = Math.max(sLat, eLat) + (buf / 111);
      const kmPerDegLngAtLat = (lat) => 111 * Math.cos((lat * Math.PI) / 180);
      const midLat = (sLat + eLat) / 2;
      const degLng = buf / kmPerDegLngAtLat(midLat);
      const minLng = Math.min(sLng, eLng) - degLng;
      const maxLng = Math.max(sLng, eLng) + degLng;

      const candidates = await TrafficLight.find({
        latitude: { $gte: minLat, $lte: maxLat },
        longitude: { $gte: minLng, $lte: maxLng }
      });

      // Filter by distance to segment (Haversine + projection)
      const toRad = (d) => (d * Math.PI) / 180;
      const R = 6371;
      function haversine(a, b) {
        const dLat = toRad(b.latitude - a.latitude);
        const dLng = toRad(b.longitude - a.longitude);
        const lat1 = toRad(a.latitude);
        const lat2 = toRad(b.latitude);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
      }

      // Approx project to meters using local scale
      const latScale = 111_000; // m per deg lat
      const lngScale = 111_000 * Math.cos(toRad(midLat));
      const ax = (eLng - sLng) * lngScale;
      const ay = (eLat - sLat) * latScale;
      function distancePointToSegmentMeters(p) {
        const px = (p.longitude - sLng) * lngScale;
        const py = (p.latitude - sLat) * latScale;
        const segLen2 = ax * ax + ay * ay || 1;
        let t = (px * ax + py * ay) / segLen2;
        t = Math.max(0, Math.min(1, t));
        const projx = t * ax;
        const projy = t * ay;
        const dx = px - projx;
        const dy = py - projy;
        return Math.sqrt(dx * dx + dy * dy);
      }

      const maxDistanceMeters = buf * 1000;
      const filtered = candidates.filter((c) => distancePointToSegmentMeters({ latitude: c.latitude, longitude: c.longitude }) <= maxDistanceMeters);

      res.json({ success: true, count: filtered.length, lights: filtered });
    } catch (err) {
      res.status(500).json({ success: false, message: 'corridor query failed', error: err.message });
    }
  });

  // Update light (e.g., police control)
  app.patch('/api/traffic-lights/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await TrafficLight.findByIdAndUpdate(id, req.body, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'not found' });
      res.json({ success: true, light: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: 'update failed', error: err.message });
    }
  });

  // Fetch traffic signals from OpenStreetMap using Overpass API
  app.get('/api/traffic-lights/overpass', async (req, res) => {
    try {
      const { startLat, startLng, endLat, endLng, bufferKm = 5 } = req.query;
      
      if (!startLat || !startLng || !endLat || !endLng) {
        return res.status(400).json({ 
          success: false, 
          message: 'startLat, startLng, endLat, endLng are required' 
        });
      }

      const sLat = parseFloat(startLat);
      const sLng = parseFloat(startLng);
      const eLat = parseFloat(endLat);
      const eLng = parseFloat(endLng);
      const buf = parseFloat(bufferKm);

      // Calculate bounding box with buffer
      const minLat = Math.min(sLat, eLat) - (buf / 111);
      const maxLat = Math.max(sLat, eLat) + (buf / 111);
      const kmPerDegLngAtLat = (lat) => 111 * Math.cos((lat * Math.PI) / 180);
      const midLat = (sLat + eLat) / 2;
      const degLng = buf / kmPerDegLngAtLat(midLat);
      const minLng = Math.min(sLng, eLng) - degLng;
      const maxLng = Math.max(sLng, eLng) + degLng;

      // Overpass QL query to get traffic signals in bounding box
      // Query syntax: [bbox:south,west,north,east] where bbox = (minLat, minLng, maxLat, maxLng)
      const overpassQuery = `[out:json][timeout:25][bbox:${minLat},${minLng},${maxLat},${maxLng}];
(
  node["highway"="traffic_signals"];
);
out body;`;

      console.log(`🔍 Querying Overpass API for traffic signals in bbox: [${minLat}, ${minLng}, ${maxLat}, ${maxLng}]`);

      const overpassData = await queryOverpass(overpassQuery);

      if (!overpassData || !overpassData.elements) {
        return res.json({ success: true, count: 0, lights: [] });
      }

      // Transform OSM nodes to our traffic light format
      const lights = overpassData.elements
        .filter(element => element.type === 'node')
        .map((node, index) => {
          // Extract road names from tags if available
          const roads = [];
          if (node.tags) {
            if (node.tags.ref) roads.push(node.tags.ref);
            if (node.tags.name) roads.push(node.tags.name);
            if (node.tags['addr:street']) roads.push(node.tags['addr:street']);
          }
          if (roads.length === 0) roads.push('Highway');

          // Extract city/area name
          const city = node.tags?.['addr:city'] || 
                      node.tags?.['addr:place'] || 
                      node.tags?.['addr:district'] || 
                      'Unknown';

          // Determine junction type from tags (default to three-way)
          let junctionType = 'three-way';
          if (node.tags?.['junction']) {
            junctionType = node.tags.junction === 'roundabout' ? 'roundabout' : 
                          node.tags.junction === 'crossing' ? 'four-way' : 'three-way';
          }

          return {
            id: `osm_${node.id}`,
            _id: `osm_${node.id}`,
            name: node.tags?.name || `Traffic Signal ${index + 1}`,
            latitude: node.lat,
            longitude: node.lon,
            junctionType: junctionType,
            roads: roads,
            city: city,
            status: 'red', // Default status (OSM doesn't provide real-time status)
            currentPhase: 'red',
            timeRemaining: 30,
            timing: {
              red: 30,
              yellow: 5,
              green: 25
            },
            isEmergency: false,
            source: 'openstreetmap' // Mark as from OSM
          };
        });

      console.log(`✅ Found ${lights.length} traffic signals from OpenStreetMap`);

      // Filter lights that are within buffer distance from route segment
      const toRad = (d) => (d * Math.PI) / 180;
      const R = 6371;
      const latScale = 111000; // meters per degree latitude
      const lngScale = 111000 * Math.cos(toRad(midLat));
      const ax = (eLng - sLng) * lngScale;
      const ay = (eLat - sLat) * latScale;

      function distancePointToSegmentMeters(point) {
        const px = (point.longitude - sLng) * lngScale;
        const py = (point.latitude - sLat) * latScale;
        const segLen2 = ax * ax + ay * ay || 1;
        let t = (px * ax + py * ay) / segLen2;
        t = Math.max(0, Math.min(1, t));
        const projx = t * ax;
        const projy = t * ay;
        const dx = px - projx;
        const dy = py - projy;
        return Math.sqrt(dx * dx + dy * dy);
      }

      const maxDistanceMeters = buf * 1000;
      const filteredLights = lights.filter(light => 
        distancePointToSegmentMeters({ latitude: light.latitude, longitude: light.longitude }) <= maxDistanceMeters
      );

      res.json({ 
        success: true, 
        count: filteredLights.length, 
        lights: filteredLights,
        source: 'openstreetmap'
      });

    } catch (err) {
      console.error('❌ Overpass API error:', err);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch traffic signals from Overpass API', 
        error: err.message 
      });
    }
  });
};



