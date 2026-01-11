// Mapbox Configuration
// Get your access token from: https://account.mapbox.com/access-tokens/
// Sign up for a free account at: https://www.mapbox.com/

// IMPORTANT: Replace this with your actual Mapbox access token
// Get your access token from: https://account.mapbox.com/access-tokens/
// Sign up for a free account at: https://www.mapbox.com/
// Free tier includes: 50,000 free requests per month for Directions API
export const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYWthc2hiYWx1IiwiYSI6ImNtazg1b3FvZTA4YmQzZXF3MDVmZmJqeXYifQ.GD4T3sJZLcm2Z656E6wJvA';

// Mapbox API endpoints
export const MAPBOX_API = {
  DIRECTIONS_API: 'https://api.mapbox.com/directions/v5/mapbox/driving',
  GEOCODING_API: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
  MATRIX_API: 'https://api.mapbox.com/directions-matrix/v1/mapbox/driving',
};

// Mapbox style URLs
export const MAPBOX_STYLES = {
  STREET: 'mapbox://styles/mapbox/streets-v12',
  SATELLITE: 'mapbox://styles/mapbox/satellite-v9',
  NAVIGATION: 'mapbox://styles/mapbox/navigation-day-v1',
  DARK: 'mapbox://styles/mapbox/dark-v11',
};

export default {
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_API,
  MAPBOX_STYLES,
};
