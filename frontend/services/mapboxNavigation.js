// Mapbox Navigation Service
// Uses Mapbox Directions API for route calculation and navigation
import { MAPBOX_ACCESS_TOKEN, MAPBOX_API } from '../config/mapbox';

/**
 * Calculate route using Mapbox Directions API
 * @param {Object} origin - {latitude, longitude}
 * @param {Object} destination - {latitude, longitude}
 * @returns {Promise} Route data with coordinates, distance, duration, and instructions
 */
export const calculateRouteWithMapbox = async (origin, destination) => {
  try {
    const originCoords = `${origin.longitude},${origin.latitude}`;
    const destCoords = `${destination.longitude},${destination.latitude}`;
    
    // Mapbox Directions API endpoint
    const url = `${MAPBOX_API.DIRECTIONS_API}/${originCoords};${destCoords}?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}&` +
      `geometries=geojson&` +
      `overview=full&` +
      `steps=true&` +
      `alternatives=false&` +
      `voice_instructions=true&` +
      `banner_instructions=true`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      const errorMsg = data.message || `HTTP ${response.status}: Failed to calculate route`;
      throw new Error(errorMsg);
    }
    
    // Mapbox returns code field, check it
    if (data.code && data.code !== 'Ok') {
      throw new Error(data.message || 'Failed to calculate route');
    }
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const geometry = route.geometry;
      
      // Convert GeoJSON coordinates to [latitude, longitude] format
      const coordinates = geometry.coordinates.map(coord => ({
        longitude: coord[0],
        latitude: coord[1],
      }));
      
      // Extract turn-by-turn instructions
      const instructions = [];
      if (route.legs && route.legs.length > 0) {
        route.legs.forEach(leg => {
          if (leg.steps) {
            leg.steps.forEach((step, index) => {
              instructions.push({
                index: index,
                instruction: step.maneuver.instruction || step.maneuver.type,
                icon: getManeuverIcon(step.maneuver.type, step.maneuver.modifier),
                distance: step.distance, // in meters
                duration: step.duration, // in seconds
                point: {
                  latitude: step.maneuver.location[1],
                  longitude: step.maneuver.location[0],
                },
                type: step.maneuver.type,
                modifier: step.maneuver.modifier,
              });
            });
          }
        });
      }
      
      return {
        coordinates,
        distance: route.distance / 1000, // Convert to km
        duration: Math.round(route.duration / 60), // Convert to minutes
        instructions,
        geometry: route.geometry,
        route: route,
      };
    }
    
    throw new Error('No route found');
  } catch (error) {
    console.error('Mapbox route calculation error:', error);
    throw error;
  }
};

/**
 * Get icon for maneuver type (Google Maps style)
 */
const getManeuverIcon = (type, modifier) => {
  // Mapbox maneuver types: https://docs.mapbox.com/api/navigation/directions/#maneuver-types
  const iconMap = {
    'turn': {
      'left': '←',
      'right': '→',
      'sharp left': '↙',
      'sharp right': '↘',
      'slight left': '↖',
      'slight right': '↗',
      'straight': '↑',
    },
    'depart': '→',
    'arrive': '📍',
    'continue': '↑',
    'merge': '→',
    'ramp': '→',
    'fork': '→',
    'roundabout': '↻',
    'rotary': '↻',
    'exit roundabout': '→',
    'exit rotary': '→',
    'uturn': '↶',
  };
  
  if (type === 'turn' && modifier && iconMap[type] && iconMap[type][modifier]) {
    return iconMap[type][modifier];
  }
  
  return iconMap[type] || '→';
};

/**
 * Geocode address using Mapbox Geocoding API
 */
export const geocodeAddressWithMapbox = async (address) => {
  try {
    const url = `${MAPBOX_API.GEOCODING_API}/${encodeURIComponent(address)}.json?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}&` +
      `limit=1`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        latitude: feature.center[1],
        longitude: feature.center[0],
        address: feature.place_name,
        fullAddress: feature,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    throw error;
  }
};

/**
 * Reverse geocode coordinates to address
 */
export const reverseGeocodeWithMapbox = async (latitude, longitude) => {
  try {
    const url = `${MAPBOX_API.GEOCODING_API}/${longitude},${latitude}.json?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}&` +
      `limit=1`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        address: feature.place_name,
        fullAddress: feature,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox reverse geocoding error:', error);
    throw error;
  }
};

/**
 * Check if user has deviated from route and needs rerouting
 */
export const checkRouteDeviation = (currentPosition, routeCoordinates, maxDeviationMeters = 50) => {
  if (!routeCoordinates || routeCoordinates.length === 0) return false;
  
  // Find nearest point on route
  let minDistance = Infinity;
  for (const routePoint of routeCoordinates) {
    const distance = calculateDistance(currentPosition, routePoint) * 1000; // Convert to meters
    if (distance < minDistance) {
      minDistance = distance;
    }
  }
  
  return minDistance > maxDeviationMeters;
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (point1, point2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
  const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default {
  calculateRouteWithMapbox,
  geocodeAddressWithMapbox,
  reverseGeocodeWithMapbox,
  checkRouteDeviation,
};
