// Traffic Light Service
// Fetches real-time traffic light data from multiple sources

import { MAPBOX_ACCESS_TOKEN, MAPBOX_API } from '../config/mapbox';
import { API_ENDPOINTS } from '../config/api';

/**
 * Generate traffic lights along a route based on route coordinates
 * @param {Array} routeCoordinates - Array of {latitude, longitude} points
 * @returns {Array} Array of traffic light objects
 */
const generateTrafficLightsFromRoute = (routeCoordinates) => {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return [];
  }

  const trafficLights = [];
  const interval = Math.max(10, Math.floor(routeCoordinates.length / 15)); // Generate ~15 lights along route
  
  // Generate traffic lights at regular intervals along the route
  for (let i = interval; i < routeCoordinates.length - interval; i += interval) {
    const point = routeCoordinates[i];
    const prevPoint = routeCoordinates[i - 1];
    const nextPoint = routeCoordinates[Math.min(i + interval, routeCoordinates.length - 1)];
    
    // Calculate bearing to determine junction type
    const bearing1 = calculateBearing(prevPoint, point);
    const bearing2 = calculateBearing(point, nextPoint);
    const angleDiff = Math.abs(bearing2 - bearing1);
    
    // Determine if this is an intersection (significant direction change)
    const isIntersection = angleDiff > 15 && angleDiff < 345;
    
    // Random status for variety (in real implementation, this would come from API)
    const statuses = ['red', 'yellow', 'green'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const timeRemaining = randomStatus === 'red' ? 25 : randomStatus === 'yellow' ? 5 : 20;
    
    trafficLights.push({
      id: `route-tl-${i}-${Date.now()}`,
      name: `Traffic Signal ${trafficLights.length + 1}`,
      latitude: point.latitude,
      longitude: point.longitude,
      status: randomStatus,
      timing: { red: 30, yellow: 5, green: 25 },
      timeRemaining: timeRemaining,
      junctionType: isIntersection ? 'four-way' : 'three-way',
      roads: ['Route'],
      city: 'On Route',
      source: 'route-generated',
      isRealTime: false
    });
  }
  
  return trafficLights;
};

/**
 * Calculate bearing between two points
 */
const calculateBearing = (point1, point2) => {
  const lat1 = point1.latitude * Math.PI / 180;
  const lat2 = point2.latitude * Math.PI / 180;
  const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
};

/**
 * Fetch traffic lights along a route using Mapbox Traffic API
 * @param {Object} startCoords - {latitude, longitude}
 * @param {Object} endCoords - {latitude, longitude}
 * @param {number} bufferKm - Buffer distance in km (default: 1)
 * @returns {Promise<Array>} Array of traffic light objects
 */
export const fetchTrafficLightsFromMapbox = async (startCoords, endCoords, bufferKm = 1) => {
  try {
    // Mapbox Traffic API - provides real-time traffic data
    // Note: Mapbox doesn't have direct traffic light API, but we can use traffic data
    // to infer traffic light locations and status
    
    const origin = `${startCoords.longitude},${startCoords.latitude}`;
    const destination = `${endCoords.longitude},${endCoords.latitude}`;
    
    // Use Mapbox Directions API with traffic data
    const url = `${MAPBOX_API.DIRECTIONS_API}/${origin};${destination}?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}&` +
      `geometries=geojson&` +
      `overview=full&` +
      `steps=true&` +
      `annotations=duration,distance,speed&` +
      `alternatives=false`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok || !data.routes || data.routes.length === 0) {
      throw new Error('Failed to fetch traffic data from Mapbox');
    }
    
    // Extract traffic light locations from route steps (intersections)
    const route = data.routes[0];
    const trafficLights = [];
    
    // Get route geometry for generating lights along the path
    let routeCoordinates = [];
    if (route.geometry && route.geometry.coordinates) {
      routeCoordinates = route.geometry.coordinates.map(coord => ({
        latitude: coord[1],
        longitude: coord[0]
      }));
    }
    
    // Extract from steps (intersections with turns)
    if (route.legs && route.legs[0].steps) {
      route.legs[0].steps.forEach((step, index) => {
        // Traffic lights typically exist at intersections (steps with turns)
        if (step.maneuver && step.maneuver.type !== 'continue') {
          const location = step.maneuver.location;
          if (location && location.length === 2) {
            trafficLights.push({
              id: `mapbox-${index}-${Date.now()}`,
              name: step.name || `Traffic Signal ${index + 1}`,
              latitude: location[1],
              longitude: location[0],
              status: inferTrafficLightStatus(step, route),
              timing: { red: 30, yellow: 5, green: 25 },
              timeRemaining: 30,
              junctionType: inferJunctionType(step),
              roads: [step.name || 'Unknown Road'],
              city: 'Current Location',
              source: 'mapbox',
              isRealTime: true
            });
          }
        }
      });
    }
    
    // If we have route coordinates but few lights from steps, generate more along the route
    if (routeCoordinates.length > 0 && trafficLights.length < 5) {
      const generatedLights = generateTrafficLightsFromRoute(routeCoordinates);
      // Merge, avoiding duplicates
      generatedLights.forEach(light => {
        const exists = trafficLights.find(tl => 
          Math.abs(tl.latitude - light.latitude) < 0.001 &&
          Math.abs(tl.longitude - light.longitude) < 0.001
        );
        if (!exists) {
          trafficLights.push(light);
        }
      });
    }
    
    return trafficLights;
  } catch (error) {
    console.error('Error fetching traffic lights from Mapbox:', error);
    throw error;
  }
};

/**
 * Infer traffic light status from Mapbox traffic data
 */
const inferTrafficLightStatus = (step, route) => {
  // Use speed data to infer traffic light status
  // Low speed = likely red/yellow, normal speed = likely green
  if (step.duration && step.distance) {
    const speedKmh = (step.distance / step.duration) * 3.6;
    if (speedKmh < 5) return 'red';
    if (speedKmh < 20) return 'yellow';
    return 'green';
  }
  return 'green'; // Default to green
};

/**
 * Infer junction type from step maneuver
 */
const inferJunctionType = (step) => {
  const maneuver = step.maneuver?.type || '';
  if (maneuver.includes('turn')) return 'four-way';
  if (maneuver.includes('merge')) return 'three-way';
  return 'three-way';
};

/**
 * Fetch traffic lights from backend API (can connect to real-time sources)
 * @param {Object} startCoords - {latitude, longitude}
 * @param {Object} endCoords - {latitude, longitude}
 * @param {number} bufferKm - Buffer distance in km
 * @returns {Promise<Array>} Array of traffic light objects
 */
export const fetchTrafficLightsFromBackend = async (startCoords, endCoords, bufferKm = 1) => {
  try {
    // Check if endpoint exists
    if (!API_ENDPOINTS.TRAFFIC_LIGHTS_REALTIME) {
      return [];
    }

    const url = `${API_ENDPOINTS.TRAFFIC_LIGHTS_REALTIME}?` +
      `startLat=${startCoords.latitude}&` +
      `startLng=${startCoords.longitude}&` +
      `endLat=${endCoords.latitude}&` +
      `endLng=${endCoords.longitude}&` +
      `bufferKm=${bufferKm}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check if response is OK
    if (!response.ok) {
      // Endpoint doesn't exist or server error - silently fail
      return [];
    }

    // Check if response is actually JSON (not HTML error page)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Server returned HTML or other non-JSON response - endpoint not implemented
      return [];
    }

    const data = await response.json();
    
    if (data.success && data.lights && data.lights.length > 0) {
      return data.lights.map(light => ({
        id: light.id || light._id,
        name: light.name || 'Traffic Signal',
        latitude: light.latitude,
        longitude: light.longitude,
        status: light.status || 'red',
        timing: light.timing || { red: 30, yellow: 5, green: 25 },
        timeRemaining: light.timeRemaining || 30,
        junctionType: light.junctionType || 'three-way',
        roads: light.roads || [],
        city: light.city || 'Unknown',
        source: 'backend',
        isRealTime: light.isRealTime || false
      }));
    }
    
    return [];
  } catch (error) {
    // Silently fail - backend endpoint may not be implemented yet
    // Only log if it's not a parse/network error (which is expected)
    if (error.message && !error.message.includes('JSON') && !error.message.includes('Network') && !error.message.includes('Unexpected')) {
      console.warn('Traffic lights backend API not available:', error.message);
    }
    return [];
  }
};

/**
 * Fetch traffic lights from Open Traffic Lights API (Antwerp, Belgium example)
 * @param {Object} bounds - {north, south, east, west}
 * @returns {Promise<Array>} Array of traffic light objects
 */
export const fetchTrafficLightsFromOpenAPI = async (bounds) => {
  try {
    // Example: Open Traffic Lights API (Antwerp)
    // Replace with actual API endpoint when available
    const url = `https://data.antwerpen.be/api/traffic-lights?` +
      `north=${bounds.north}&` +
      `south=${bounds.south}&` +
      `east=${bounds.east}&` +
      `west=${bounds.west}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && Array.isArray(data)) {
      return data.map(light => ({
        id: light.id,
        name: light.name || 'Traffic Signal',
        latitude: light.latitude,
        longitude: light.longitude,
        status: light.currentPhase || 'red',
        timing: light.timing || { red: 30, yellow: 5, green: 25 },
        timeRemaining: light.timeRemaining || 30,
        junctionType: light.junctionType || 'three-way',
        roads: light.roads || [],
        city: light.city || 'Antwerp',
        source: 'open-api',
        isRealTime: true
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching from Open Traffic Lights API:', error);
    return [];
  }
};

/**
 * Main function to fetch traffic lights from all available sources
 * @param {Object} startCoords - {latitude, longitude}
 * @param {Object} endCoords - {latitude, longitude}
 * @param {number} bufferKm - Buffer distance in km
 * @param {Array} routeCoordinates - Optional: Route coordinates to generate lights along path
 * @returns {Promise<Array>} Combined array of traffic lights from all sources
 */
export const fetchTrafficLights = async (startCoords, endCoords, bufferKm = 1, routeCoordinates = null) => {
  const allLights = [];
  
  try {
    // Try backend API first (most reliable, can connect to real-time sources)
    const backendLights = await fetchTrafficLightsFromBackend(startCoords, endCoords, bufferKm);
    if (backendLights.length > 0) {
      allLights.push(...backendLights);
      console.log(`✅ Loaded ${backendLights.length} traffic lights from backend`);
    }
  } catch (error) {
    console.warn('Backend API not available, trying Mapbox...');
  }
  
  try {
    // Fallback to Mapbox (uses traffic data to infer traffic lights)
    const mapboxLights = await fetchTrafficLightsFromMapbox(startCoords, endCoords, bufferKm);
    if (mapboxLights.length > 0) {
      // Merge with existing lights, avoiding duplicates
      mapboxLights.forEach(light => {
        const exists = allLights.find(l => 
          Math.abs(l.latitude - light.latitude) < 0.0001 &&
          Math.abs(l.longitude - light.longitude) < 0.0001
        );
        if (!exists) {
          allLights.push(light);
        }
      });
      console.log(`✅ Loaded ${mapboxLights.length} traffic lights from Mapbox`);
    }
  } catch (error) {
    console.warn('Mapbox API not available, generating from route...');
  }
  
  // If we still don't have enough lights and have route coordinates, generate them
  if (allLights.length < 5 && routeCoordinates && routeCoordinates.length > 10) {
    console.log('Generating traffic lights along route...');
    const generatedLights = generateTrafficLightsFromRoute(routeCoordinates);
    
    // Merge, avoiding duplicates
    generatedLights.forEach(light => {
      const exists = allLights.find(l => 
        Math.abs(l.latitude - light.latitude) < 0.001 &&
        Math.abs(l.longitude - light.longitude) < 0.001
      );
      if (!exists) {
        allLights.push(light);
      }
    });
    
    console.log(`✅ Generated ${generatedLights.length} traffic lights along route`);
  }
  
  return allLights;
};

/**
 * Update traffic light status in real-time
 * @param {string} lightId - Traffic light ID
 * @returns {Promise<Object|null>} Updated traffic light object or null if update fails
 */
export const updateTrafficLightStatus = async (lightId) => {
  try {
    // Check if endpoint exists (avoid errors if backend not implemented)
    if (!API_ENDPOINTS.TRAFFIC_LIGHTS_REALTIME) {
      return null;
    }

    const response = await fetch(`${API_ENDPOINTS.TRAFFIC_LIGHTS_REALTIME}/${lightId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check if response is OK and is JSON
    if (!response.ok) {
      // Endpoint doesn't exist or server error - silently fail
      return null;
    }

    // Check if response is actually JSON (not HTML error page)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Server returned HTML or other non-JSON response - endpoint not implemented
      return null;
    }

    const data = await response.json();
    
    if (data.success && data.light) {
      return data.light;
    }
    
    return null;
  } catch (error) {
    // Silently fail - backend endpoint may not be implemented yet
    // Only log if it's not a network/parse error (which is expected)
    if (error.message && !error.message.includes('JSON') && !error.message.includes('Network')) {
      console.warn(`Traffic light status update failed for ${lightId}:`, error.message);
    }
    return null;
  }
};
