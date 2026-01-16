// MapView Wrapper for Expo Go compatibility
// This handles the case where react-native-maps might not be available in Expo Go
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

let MapView, Marker, Polyline, Circle, PROVIDER_GOOGLE;
let mapsAvailable = false;

try {
  const mapsModule = require('react-native-maps');
  MapView = mapsModule.default;
  Marker = mapsModule.Marker;
  Polyline = mapsModule.Polyline;
  Circle = mapsModule.Circle;
  PROVIDER_GOOGLE = mapsModule.PROVIDER_GOOGLE;
  mapsAvailable = true;
} catch (error) {
  console.warn('⚠️ react-native-maps not available - using fallback view');
  mapsAvailable = false;
}

// Fallback component when maps are not available
const MapFallback = ({ style, children, ...props }) => (
  <View style={[styles.fallbackContainer, style]}>
    <Text style={styles.fallbackText}>🗺️ Map View</Text>
    <Text style={styles.fallbackSubtext}>
      Maps require a custom development build.{'\n'}
      The app will work, but map features are limited.
    </Text>
    {children}
  </View>
);

// Export conditional components
export const ConditionalMapView = mapsAvailable ? MapView : MapFallback;
export const ConditionalMarker = mapsAvailable ? Marker : View;
export const ConditionalPolyline = mapsAvailable ? Polyline : View;
export const ConditionalCircle = mapsAvailable ? Circle : View;
export const MapsProvider = mapsAvailable ? PROVIDER_GOOGLE : null;

// Export availability flag
export const isMapsAvailable = mapsAvailable;

// Re-export if available, otherwise export fallbacks
export default mapsAvailable ? MapView : MapFallback;

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fallbackText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 10,
  },
  fallbackSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
