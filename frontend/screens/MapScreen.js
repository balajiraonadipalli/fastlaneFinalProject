import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions, TextInput, Modal, ScrollView, Animated, Image, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ScreenCapture from 'expo-screen-capture';
import { API_ENDPOINTS } from '../config/api';
import { calculateRouteWithMapbox, geocodeAddressWithMapbox, reverseGeocodeWithMapbox, checkRouteDeviation } from '../services/mapboxNavigation';
import { fetchTrafficLights, updateTrafficLightStatus } from '../services/trafficLightService';

const { width, height } = Dimensions.get('window');

const MapScreen = ({ route, navigation }) => {
  const { role, userName } = route?.params || { role: 'ambulance', userName: 'Driver' };
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null); // Current ambulance position for marker
  const [previousPosition, setPreviousPosition] = useState(null); // Previous position for smooth animation
  const markerRotation = useRef(new Animated.Value(0)).current; // Rotation animation value for heading
  const lastMarkerCoords = useRef(null); // Track last rendered coordinates to prevent unnecessary re-renders
  const actualGPSSpeedRef = useRef(0); // Track actual GPS speed separately from route animation
  const lastGPSPositionRef = useRef(null); // Track last GPS position to detect real movement
  const [errorMsg, setErrorMsg] = useState(null);
  const [startLocation, setStartLocation] = useState(null);
  const [endLocation, setEndLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [nearbyTolls, setNearbyTolls] = useState([]);
  const [tollAlerts, setTollAlerts] = useState([]);
  const [nearbyPolice, setNearbyPolice] = useState([]);
  const [trafficLights, setTrafficLights] = useState([]);
  const [trafficLightAlerts, setTrafficLightAlerts] = useState([]);
  const [policeAlerts, setPoliceAlerts] = useState([]);
  const [policeResponses, setPoliceResponses] = useState([]);
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [routeStartTime, setRouteStartTime] = useState(null);
  const [routeProgressIndex, setRouteProgressIndex] = useState(0); // Current position index on route
  const [routeProgress, setRouteProgress] = useState(0); // Progress along route (0-1)
  const routeAnimationRef = useRef(null); // Ref for route animation interval
  const navigationSpeedRef = useRef(50); // Speed in km/h for navigation simulation
  const [isLoadingLocation, setIsLoadingLocation] = useState(true); // Loading state for location
  const [isLoadingMap, setIsLoadingMap] = useState(true); // Loading state for map
  const [isCreatingRoute, setIsCreatingRoute] = useState(false); // Loading state for route creation
  const [isFetchingCurrentLocation, setIsFetchingCurrentLocation] = useState(false); // Loading state for current location button
  const [navigationInstructions, setNavigationInstructions] = useState([]); // Turn-by-turn directions
  const [nextTurn, setNextTurn] = useState(null); // Next turn instruction
  const [distanceToNextTurn, setDistanceToNextTurn] = useState(null); // Distance to next turn in meters
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false); // Collapsible panel state
  const panelSlideAnim = useRef(new Animated.Value(0)).current; // Animation value for panel slide
  const [currentStreet, setCurrentStreet] = useState(''); // Current street name
  const [remainingDistance, setRemainingDistance] = useState(null); // Remaining distance
  const [remainingTime, setRemainingTime] = useState(null); // Remaining time
  const [emergencies, setEmergencies] = useState([
    {
      id: 1,
      latitude: 12.9716,
      longitude: 77.5946,
      title: 'Emergency Call',
      description: 'Medical emergency reported',
      status: 'pending',
    },
  ]);


  // Toll gates data - Andhra Pradesh only
  const [tollGates] = useState([
    // Vijayawada - Hyderabad (NH-65)
    { id: 1, name: 'Chillakallu Toll Plaza', latitude: 16.5193, longitude: 80.6305, highway: 'NH-65', city: 'Guntur' },
    { id: 2, name: 'Pantangi Toll Plaza', latitude: 16.2903, longitude: 80.8765, highway: 'NH-65', city: 'Guntur' },
    { id: 3, name: 'Nalgonda Toll Plaza', latitude: 17.0555, longitude: 79.2675, highway: 'NH-65', city: 'Nalgonda' },
    
    // Vijayawada - Chennai (NH-16)
    { id: 4, name: 'Rajahmundry Toll', latitude: 17.0005, longitude: 81.7779, highway: 'NH-16', city: 'Rajahmundry' },
    { id: 5, name: 'Tuni Toll Plaza', latitude: 17.3560, longitude: 82.5480, highway: 'NH-16', city: 'Tuni' },
    { id: 6, name: 'Chodavaram Toll', latitude: 17.8276, longitude: 82.9394, highway: 'NH-16', city: 'Visakhapatnam' },
    
    // Visakhapatnam Area
    { id: 7, name: 'Simhachalam Toll', latitude: 17.7833, longitude: 83.2167, highway: 'NH-16', city: 'Visakhapatnam' },
    { id: 8, name: 'Pedagantyada Toll', latitude: 17.7833, longitude: 83.2000, highway: 'NH-16', city: 'Visakhapatnam' },
    
    // Tirupati - Chennai (NH-71)
    { id: 9, name: 'Renigunta Toll Plaza', latitude: 13.6500, longitude: 79.5167, highway: 'NH-71', city: 'Tirupati' },
    { id: 10, name: 'Gudur Toll Plaza', latitude: 14.1485, longitude: 79.8508, highway: 'NH-16', city: 'Gudur' },
    
    // Anantapur - Bangalore (NH-44)
    { id: 11, name: 'Gooty Toll Plaza', latitude: 15.1200, longitude: 77.6300, highway: 'NH-44', city: 'Anantapur' },
    { id: 12, name: 'Anantapur Toll', latitude: 14.6819, longitude: 77.6006, highway: 'NH-44', city: 'Anantapur' },
    
    // Kurnool - Bangalore (NH-44)
    { id: 13, name: 'Adoni Toll Plaza', latitude: 15.6277, longitude: 77.2750, highway: 'NH-44', city: 'Kurnool' },
    { id: 14, name: 'Kurnool Toll', latitude: 15.8281, longitude: 78.0373, highway: 'NH-44', city: 'Kurnool' },
    
    // Guntur Area
    { id: 15, name: 'Guntur Bypass Toll', latitude: 16.3067, longitude: 80.4365, highway: 'NH-16', city: 'Guntur' },
    
    // Nellore - Chennai (NH-16)
    { id: 16, name: 'Nellore Toll Plaza', latitude: 14.4426, longitude: 79.9865, highway: 'NH-16', city: 'Nellore' },
    { id: 17, name: 'Kavali Toll Plaza', latitude: 14.9139, longitude: 79.9944, highway: 'NH-16', city: 'Nellore' },
    
    // Inner Ring Road Vijayawada
    { id: 18, name: 'Vijayawada IRR Toll', latitude: 16.5062, longitude: 80.6480, highway: 'IRR', city: 'Vijayawada' },
  ]);


  // Set default region immediately for faster map loading
  useEffect(() => {
    // Set a default region (India center) so map can render immediately
    const defaultRegion = {
      latitude: 20.5937,
      longitude: 78.9629,
      latitudeDelta: 5.0,
      longitudeDelta: 5.0,
    };
    setLocation(defaultRegion);
    setIsLoadingLocation(false); // Allow map to render immediately
    setIsLoadingMap(false); // Allow map to render immediately
  }, []);

  // Fetch accurate location in background (non-blocking)
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          // Don't show alert immediately, let map load first
          return;
        }

        // Use Balanced accuracy for faster initial load
        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          maximumAge: 10000, // Accept cached location up to 10 seconds old
        });
        const currentCoords = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setLocation(currentCoords);
        setStartLocation(currentCoords);
        
        // Animate map to user location smoothly
        if (mapRef.current) {
          mapRef.current.animateToRegion(currentCoords, 1000);
        }
        
        // Set initial position for ambulance marker (location tracking useEffect will update this in real-time)
        if (role === 'ambulance') {
          const initialPos = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            speed: currentLocation.coords.speed || 0,
            heading: currentLocation.coords.heading || 0,
          };
          setCurrentPosition(initialPos);
          // Initialize rotation value
          if (initialPos.heading) {
            markerRotation.setValue(initialPos.heading);
          }
          console.log('📍 Initial ambulance position set from location fetch:', initialPos);
        }
        
        // Optionally get high accuracy location in background for better precision
        setTimeout(async () => {
          try {
            const highAccuracyLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            const highAccuracyCoords = {
              latitude: highAccuracyLocation.coords.latitude,
              longitude: highAccuracyLocation.coords.longitude,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            };
            setLocation(highAccuracyCoords);
            setStartLocation(highAccuracyCoords);
            if (mapRef.current) {
              mapRef.current.animateToRegion(highAccuracyCoords, 500);
            }
            if (role === 'ambulance' && currentPosition) {
              setCurrentPosition({
                ...currentPosition,
                latitude: highAccuracyLocation.coords.latitude,
                longitude: highAccuracyLocation.coords.longitude,
              });
            }
          } catch (e) {
            console.log('High accuracy location update failed, using balanced accuracy');
          }
        }, 2000);
      } catch (error) {
        console.error('Error fetching location:', error);
        setErrorMsg('Failed to get location');
      }
    })();
  }, []);

  // Allow screenshots of the map screen
  useEffect(() => {
    const enableScreenshots = async () => {
      try {
        await ScreenCapture.allowScreenCaptureAsync();
        console.log('✅ Screenshots enabled for MapScreen');
      } catch (error) {
        console.error('Error enabling screenshots:', error);
      }
    };
    
    enableScreenshots();
    
    // Cleanup: Allow screenshots to remain enabled when component unmounts
    // (No need to disable, as we want screenshots to always be allowed)
  }, []);

  // Real-time traffic light status updates - Cycle through red -> green -> yellow -> red
  useEffect(() => {
    if (trafficLights.length === 0) return;
    
    // Update traffic light statuses every second for real-time cycling
    const updateInterval = setInterval(() => {
      setTrafficLights(prevLights => {
        return prevLights.map(light => {
          if (!light) return light;
          
          // Get timing configuration (default if not provided)
          const timing = light.timing || { red: 30, yellow: 5, green: 25 };
          let { status, timeRemaining } = light;
          
          // Decrease time remaining
          const newTimeRemaining = Math.max(0, (timeRemaining || 0) - 1);
          
          // Cycle through states: red -> green -> yellow -> red
          if (newTimeRemaining <= 0) {
            if (status === 'red') {
              // Red -> Green
              status = 'green';
              timeRemaining = timing.green;
            } else if (status === 'green') {
              // Green -> Yellow
              status = 'yellow';
              timeRemaining = timing.yellow;
            } else if (status === 'yellow') {
              // Yellow -> Red
              status = 'red';
              timeRemaining = timing.red;
            } else {
              // Unknown status, default to red
              status = 'red';
              timeRemaining = timing.red;
            }
          } else {
            timeRemaining = newTimeRemaining;
          }
          
          // Return updated light
          return {
            ...light,
            status,
            timeRemaining,
            isRealTime: true, // Mark all as real-time since they're cycling
          };
        });
      });
    }, 1000); // Update every 1 second for smooth real-time changes
    
    return () => clearInterval(updateInterval);
  }, [trafficLights.length]);

  // Track last traffic lights count to log only when it changes
  const lastTrafficLightsCountRef = useRef(0);
  
  // Memoize traffic light markers for performance - with red marker background
  const trafficLightMarkers = useMemo(() => {
    if (trafficLights.length === 0) {
      if (lastTrafficLightsCountRef.current > 0) {
        console.log('⚠️ No traffic lights to render');
        lastTrafficLightsCountRef.current = 0;
      }
      return null;
    }
    
    // Only log when count changes, not on every update
    if (lastTrafficLightsCountRef.current !== trafficLights.length) {
      console.log(`🗺️ Rendering ${trafficLights.length} traffic light markers`);
      lastTrafficLightsCountRef.current = trafficLights.length;
    }
    
    return trafficLights.map((light, index) => {
      if (!light || !light.latitude || !light.longitude) {
        return null;
      }
      
      return (
        <Marker
          key={`traffic-${light.id || `tl-${index}`}`}
          coordinate={{
            latitude: light.latitude,
            longitude: light.longitude,
          }}
          title={`🚦 ${light.name || 'Traffic Signal'}`}
          description={`${light.junctionType || 'Junction'} - ${(light.status || 'unknown').toUpperCase()} (${light.timeRemaining || 0}s)`}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={2001}
        >
          <View style={styles.trafficLightMarker}>
            <Text style={styles.trafficLightEmoji}>🚦</Text>
          </View>
        </Marker>
      );
    });
  }, [trafficLights]);

  // Monitor location for ambulance route tracking and alerts - Start immediately for ambulance users
  useEffect(() => {
    if (role !== 'ambulance') return;

    let locationSubscription = null;

    const startLocationTracking = async () => {
      try {
        // Request permissions if not already granted
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          status = (await Location.requestForegroundPermissionsAsync()).status;
        }

        if (status === 'granted') {
          // Get initial location immediately
          try {
            const initialLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            const initialPos = {
              latitude: initialLocation.coords.latitude,
              longitude: initialLocation.coords.longitude,
              speed: initialLocation.coords.speed || 0,
              heading: initialLocation.coords.heading || 0,
            };
            setCurrentPosition(initialPos);
            if (initialPos.heading) {
              markerRotation.setValue(initialPos.heading);
            }
            console.log('📍 Initial ambulance position set:', initialPos);
          } catch (err) {
            console.warn('Could not get initial location:', err);
          }

          // Start watching position for real-time updates
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 3000, // Update every 3 seconds
              distanceInterval: 25, // Or every 25 meters
            },
            (newLocation) => {
              const currentPos = {
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
                speed: newLocation.coords.speed || 0,
                heading: newLocation.coords.heading || 0,
              };

              // Calculate distance from previous position (if available)
              let distanceMeters = 0;
              if (currentPosition && currentPosition.latitude && currentPosition.longitude) {
                const R = 6371e3; // Earth's radius in meters
                const φ1 = currentPosition.latitude * Math.PI / 180;
                const φ2 = currentPos.latitude * Math.PI / 180;
                const Δφ = (currentPos.latitude - currentPosition.latitude) * Math.PI / 180;
                const Δλ = (currentPos.longitude - currentPosition.longitude) * Math.PI / 180;
                const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                          Math.cos(φ1) * Math.cos(φ2) *
                          Math.sin(Δλ/2) * Math.sin(Δλ/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                distanceMeters = R * c;
              }

              // Minimum distance threshold: 5 meters (to filter GPS drift when stationary)
              // If speed is very low (< 1 m/s ≈ 3.6 km/h), increase threshold to 10 meters
              const minDistanceThreshold = (currentPos.speed < 1) ? 10 : 5;
              
              // Round coordinates to 5 decimal places (approximately 1m precision)
              const roundedLat = Math.round(currentPos.latitude * 100000) / 100000;
              const roundedLng = Math.round(currentPos.longitude * 100000) / 100000;
              
              // Only update if position has changed significantly (more than threshold)
              const shouldUpdate = !currentPosition || distanceMeters >= minDistanceThreshold;
              
              // Animate rotation if heading is available (update even if position hasn't changed)
              if (currentPos.heading !== undefined && currentPos.heading !== null) {
                Animated.timing(markerRotation, {
                  toValue: currentPos.heading,
                  duration: 500,
                  useNativeDriver: false, // Set to false to work with tracksViewChanges={false}
                }).start();
              }

              // Only update state and run checks if position has actually changed significantly
              if (shouldUpdate) {
                // Update previous position before setting new one (for smooth animation)
                setPreviousPosition(currentPosition);
                
                // Update current position with rounded coordinates
                const roundedPos = {
                  ...currentPos,
                  latitude: roundedLat,
                  longitude: roundedLng,
                };
                // Track actual GPS speed and position separately from route animation
                actualGPSSpeedRef.current = currentPos.speed || 0;
                lastGPSPositionRef.current = roundedPos;
                
                setCurrentPosition(roundedPos);
                console.log(`📍 Ambulance position updated: ${distanceMeters.toFixed(1)}m movement`, roundedPos);
                
                // Center map on current location (only when position changes significantly)
                if (mapRef.current && distanceMeters >= minDistanceThreshold) {
                  mapRef.current.animateToRegion({
                    latitude: roundedLat,
                    longitude: roundedLng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }, 1000);
                }
                
                // Update ambulance location for tracking
                updateAmbulanceLocation(roundedPos);
                
                // Check toll gates within 1km
                checkNearbyTolls(roundedPos);
                
                // Check for nearby police within 2km
                checkNearbyPolice(roundedPos);
                
              }
            }
          );
          console.log('✅ Location tracking started for ambulance');
        }
      } catch (error) {
        console.error('Error starting location tracking:', error);
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscription) {
        // watchPositionAsync returns a subscription object with remove() method
        try {
          if (typeof locationSubscription.remove === 'function') {
            locationSubscription.remove();
            console.log('✅ Location subscription removed');
          }
        } catch (error) {
          console.error('Error removing location subscription:', error);
        }
      }
    };
  }, [role]); // Only depend on role, start tracking immediately when role is ambulance

  // Debug: Log ambulance marker state (only when coordinates actually change)
  useEffect(() => {
    if (role === 'ambulance') {
      const coord = currentPosition || location;
      if (!coord || !coord.latitude || !coord.longitude) return;
      
      // Round coordinates to compare
      const roundedLat = Math.round(coord.latitude * 1000000) / 1000000;
      const roundedLng = Math.round(coord.longitude * 1000000) / 1000000;
      const coordKey = `${roundedLat},${roundedLng}`;
      
      // Only log when coordinates actually change
      if (lastMarkerCoords.current !== coordKey) {
        console.log('🚑 Ambulance Marker State:', {
          hasCurrentPosition: !!currentPosition,
          hasLocation: !!location,
          coordinates: { lat: roundedLat, lng: roundedLng }
        });
      }
      
      // If we have location but no currentPosition, set it
      if (location && !currentPosition && role === 'ambulance') {
        const pos = {
          latitude: location.latitude,
          longitude: location.longitude,
          speed: 0,
          heading: 0,
        };
        setCurrentPosition(pos);
        
        // Center map on ambulance location
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 1000);
        }
      }
    }
  }, [role, currentPosition?.latitude, currentPosition?.longitude, location?.latitude, location?.longitude]);

  // Calculate bearing (heading) between two points
  const calculateBearing = useCallback((point1, point2) => {
    const lat1 = point1.latitude * Math.PI / 180;
    const lat2 = point2.latitude * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
  }, []);

  // Interpolate between two route points
  const interpolateRoutePoint = useCallback((point1, point2, fraction) => {
    return {
      latitude: point1.latitude + (point2.latitude - point1.latitude) * fraction,
      longitude: point1.longitude + (point2.longitude - point1.longitude) * fraction,
    };
  }, []);

  // Calculate turn direction and angle between two segments
  const calculateTurnDirection = useCallback((point1, point2, point3) => {
    const bearing1 = calculateBearing(point1, point2);
    const bearing2 = calculateBearing(point2, point3);
    let turnAngle = bearing2 - bearing1;
    
    // Normalize angle to -180 to 180
    if (turnAngle > 180) turnAngle -= 360;
    if (turnAngle < -180) turnAngle += 360;
    
    return turnAngle;
  }, [calculateBearing]);

  // Generate navigation instructions from route with enhanced arrow icons
  const generateNavigationInstructions = useCallback((route) => {
    if (route.length < 3) return [];
    
    const instructions = [];
    let cumulativeDistance = 0;
    
    for (let i = 0; i < route.length - 2; i++) {
      const prev = route[i];
      const current = route[i + 1];
      const next = route[i + 2];
      
      const segmentDistance = calculateDistance(current, next) * 1000; // meters
      const turnAngle = calculateTurnDirection(prev, current, next);
      
      // Only create instruction for significant turns (>15 degrees)
      if (Math.abs(turnAngle) > 15) {
        let instruction = '';
        let icon = '→';
        let iconColor = '#4285F4'; // Google Maps blue
        
        // Enhanced arrow icons - Google Maps style
        if (turnAngle > 15 && turnAngle <= 45) {
          instruction = 'Slight right';
          icon = '↗'; // Better Unicode arrow
        } else if (turnAngle > 45 && turnAngle <= 135) {
          instruction = 'Turn right';
          icon = '→'; // Right arrow
        } else if (turnAngle > 135) {
          instruction = 'Sharp right';
          icon = '↘'; // Sharp right arrow
          iconColor = '#EA4335'; // Red for sharp turns
        } else if (turnAngle < -15 && turnAngle >= -45) {
          instruction = 'Slight left';
          icon = '↖'; // Slight left arrow
        } else if (turnAngle < -45 && turnAngle >= -135) {
          instruction = 'Turn left';
          icon = '←'; // Left arrow
        } else if (turnAngle < -135) {
          instruction = 'Sharp left';
          icon = '↙'; // Sharp left arrow
          iconColor = '#EA4335'; // Red for sharp turns
        }
        
        instructions.push({
          index: i + 1,
          instruction,
          icon,
          iconColor,
          distance: cumulativeDistance,
          point: current,
          angle: turnAngle,
        });
      }
      
      cumulativeDistance += segmentDistance;
    }
    
    // Add final destination instruction
    if (route.length > 0) {
      instructions.push({
        index: route.length - 1,
        instruction: 'Arrive at destination',
        icon: '📍',
        iconColor: '#34A853', // Green for destination
        distance: cumulativeDistance,
        point: route[route.length - 1],
        angle: 0,
      });
    }
    
    return instructions;
  }, [calculateDistance, calculateTurnDirection]);

  // Update navigation UI (next turn, distance, etc.)
  const updateNavigationUI = useCallback((currentIndex, route, currentPos) => {
    // Regenerate instructions if needed (they might not be ready yet)
    if (navigationInstructions.length === 0 && route.length > 2) {
      const instructions = generateNavigationInstructions(route);
      setNavigationInstructions(instructions);
    }
    
    // Find next turn instruction
    const instructions = navigationInstructions.length > 0 
      ? navigationInstructions 
      : generateNavigationInstructions(route);
    
    const nextInstruction = instructions.find(inst => inst.index > currentIndex);
    if (nextInstruction) {
      setNextTurn(nextInstruction);
      // Calculate distance to next turn
      let distToTurn = 0;
      for (let i = currentIndex; i < nextInstruction.index && i < route.length - 1; i++) {
        distToTurn += calculateDistance(route[i], route[i + 1]) * 1000;
      }
      setDistanceToNextTurn(Math.round(distToTurn));
    } else {
      setNextTurn(null);
      setDistanceToNextTurn(null);
    }
    
    // Calculate remaining distance and time
    let remainingDist = 0;
    for (let i = currentIndex; i < route.length - 1; i++) {
      remainingDist += calculateDistance(route[i], route[i + 1]);
    }
    setRemainingDistance(remainingDist);
    
    // Use actual speed if available, otherwise use navigation speed
    const speedKmh = currentPos?.speed ? currentPos.speed * 3.6 : navigationSpeedRef.current;
    const remainingTimeMin = speedKmh > 0 ? Math.ceil((remainingDist / speedKmh) * 60) : 0;
    setRemainingTime(remainingTimeMin);
    
    // Update current street (simplified for now)
    setCurrentStreet('On route');
  }, [navigationInstructions, calculateDistance, generateNavigationInstructions]);

  // Update navigation instructions when route changes
  useEffect(() => {
    if (routeCoordinates.length > 0 && isRouteActive) {
      const instructions = generateNavigationInstructions(routeCoordinates);
      setNavigationInstructions(instructions);
      console.log(`📋 Generated ${instructions.length} navigation instructions`);
    }
  }, [routeCoordinates, isRouteActive, generateNavigationInstructions]);

  // Real-time navigation along route (Google Maps style) - Only when actually moving
  useEffect(() => {
    if (!isRouteActive || routeCoordinates.length === 0 || role !== 'ambulance') {
      // Stop animation if route is not active
      if (routeAnimationRef.current) {
        clearInterval(routeAnimationRef.current);
        routeAnimationRef.current = null;
      }
      return;
    }

    console.log('🚗 Starting optimized real-time route navigation...');
    
    // Clear any existing animation
    if (routeAnimationRef.current) {
      clearInterval(routeAnimationRef.current);
    }

    // Use refs to avoid unnecessary re-renders
    const stateRef = {
      currentIndex: routeProgressIndex,
      segmentProgress: routeProgress,
      lastMapUpdate: 0,
      lastCheckUpdate: 0,
      lastHeading: 0,
      lastGPSPosition: null, // Track last actual GPS position from location tracking
      lastGPSSpeed: 0, // Track last GPS speed
      stationaryCount: 0, // Count how many times we've been stationary
      startTime: Date.now(), // Track when route animation started
    };

    const updateInterval = 250; // Reduced frequency: 250ms (was 100ms) for better performance
    const mapUpdateInterval = 500; // Update map camera every 500ms
    const checkUpdateInterval = 2000; // Check nearby items every 2 seconds
    const headingThreshold = 5; // Only update rotation if heading changes by 5+ degrees
    const minSpeedKmh = 3; // Minimum speed to consider moving (3 km/h ≈ walking speed)
    const stationaryThreshold = 5; // Number of consecutive stationary checks before pausing
    const initialGracePeriod = 5000; // Allow route animation to run for 5 seconds initially before checking GPS

    routeAnimationRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceStart = now - stateRef.startTime;
      
      // Check if user is actually moving using REAL GPS speed (not route animation speed)
      const actualGPSSpeed = actualGPSSpeedRef.current * 3.6; // Convert m/s to km/h
      const isActuallyMoving = actualGPSSpeed >= minSpeedKmh;
      
      // Also check if GPS position has actually changed (additional check)
      // But only check this after initial grace period to allow route animation to start
      const gpsPositionChanged = lastGPSPositionRef.current && currentPosition ? 
        (Math.abs(lastGPSPositionRef.current.latitude - currentPosition.latitude) > 0.00001 ||
         Math.abs(lastGPSPositionRef.current.longitude - currentPosition.longitude) > 0.00001) : true; // Default to true during grace period
      
      // During initial grace period, allow route animation to run regardless of GPS
      const isInGracePeriod = timeSinceStart < initialGracePeriod;
      
      // If not moving and not in grace period, increment stationary count and pause route animation
      if (!isInGracePeriod && !isActuallyMoving && !gpsPositionChanged) {
        stateRef.stationaryCount++;
        // If stationary for too long, pause the route animation updates completely
        if (stateRef.stationaryCount >= stationaryThreshold) {
          // Don't update route position at all - let GPS location tracking be the source of truth
          // Only run expensive checks, don't update route progress
          if (now - stateRef.lastCheckUpdate >= checkUpdateInterval) {
            stateRef.lastCheckUpdate = now;
            if (typeof checkNearbyTolls === 'function' && currentPosition) {
              checkNearbyTolls(currentPosition);
            }
            if (typeof checkNearbyPolice === 'function' && currentPosition) {
              checkNearbyPolice(currentPosition);
            }
          }
          return; // Exit early, don't update route position - GPS will handle position updates
        }
      } else {
        // Reset stationary count when moving or in grace period
        stateRef.stationaryCount = 0;
      }
      
      // After grace period, if not actually moving, don't simulate movement at all
      if (!isInGracePeriod && !isActuallyMoving) {
        // Don't update route position - let GPS handle it
        return;
      }
      
      // Use actual GPS speed if available and moving, otherwise use 0 when stationary
      // Only use navigation speed during grace period if GPS speed is not available
      let speedKmh = 0;
      if (isActuallyMoving && actualGPSSpeed > 0) {
        speedKmh = actualGPSSpeed; // Use actual GPS speed when moving
      } else if (isInGracePeriod && actualGPSSpeed === 0) {
        // During grace period, if no GPS speed yet, use navigation speed temporarily
        speedKmh = navigationSpeedRef.current;
      } else {
        // When stationary (not in grace period), use 0
        speedKmh = 0;
      }
      const speedMs = speedKmh / 3.6; // Convert to m/s

      if (stateRef.currentIndex >= routeCoordinates.length - 1) {
        // Reached destination
        clearInterval(routeAnimationRef.current);
        routeAnimationRef.current = null;
        console.log('✅ Reached destination!');
        Alert.alert('🎉 Destination Reached', 'You have arrived at your destination!');
        return;
      }

      const currentPoint = routeCoordinates[stateRef.currentIndex];
      const nextPoint = routeCoordinates[stateRef.currentIndex + 1];
      
      // Calculate distance to next point
      const segmentDistance = calculateDistance(currentPoint, nextPoint) * 1000; // Convert to meters
      
      // Skip if segment is too short (avoid division by zero or very small numbers)
      if (segmentDistance < 1) {
        stateRef.currentIndex++;
        stateRef.segmentProgress = 0;
        return;
      }
      
      // Calculate how much to move (distance covered in updateInterval ms)
      const distanceToMove = (speedMs * updateInterval) / 1000; // meters
      const progressIncrement = distanceToMove / segmentDistance;
      
      // Update segment progress
      stateRef.segmentProgress += progressIncrement;
      
      // If we've completed this segment, move to next
      if (stateRef.segmentProgress >= 1.0) {
        stateRef.segmentProgress = stateRef.segmentProgress - 1.0;
        stateRef.currentIndex++;
        
        // Check if we've reached the end
        if (stateRef.currentIndex >= routeCoordinates.length - 1) {
          // Set position to final destination
          const finalPos = {
            latitude: routeCoordinates[routeCoordinates.length - 1].latitude,
            longitude: routeCoordinates[routeCoordinates.length - 1].longitude,
            speed: 0,
            heading: stateRef.currentIndex > 0 
              ? calculateBearing(routeCoordinates[stateRef.currentIndex - 1], routeCoordinates[stateRef.currentIndex])
              : 0,
          };
          setCurrentPosition(finalPos);
          setRouteProgressIndex(routeCoordinates.length - 1);
          setRouteProgress(1.0);
          clearInterval(routeAnimationRef.current);
          routeAnimationRef.current = null;
          console.log('✅ Reached destination!');
          return;
        }
      }
      
      // Interpolate position between current and next point
      const currentSegmentPoint = interpolateRoutePoint(
        routeCoordinates[stateRef.currentIndex],
        routeCoordinates[stateRef.currentIndex + 1],
        stateRef.segmentProgress
      );
      
      // Calculate heading based on direction of travel
      let heading = 0;
      if (stateRef.currentIndex < routeCoordinates.length - 1) {
        heading = calculateBearing(
          routeCoordinates[stateRef.currentIndex],
          routeCoordinates[stateRef.currentIndex + 1]
        );
      } else if (stateRef.currentIndex > 0) {
        heading = calculateBearing(
          routeCoordinates[stateRef.currentIndex - 1],
          routeCoordinates[stateRef.currentIndex]
        );
      }
      
      // Update position (batch state updates)
      const newPosition = {
        latitude: currentSegmentPoint.latitude,
        longitude: currentSegmentPoint.longitude,
        speed: speedMs,
        heading: heading,
      };
      
      // Only update state if position changed significantly (reduce re-renders and coordinate fluctuations)
      // Check distance from last position - only update if moved at least 3 meters
      const lastPos = currentPosition;
      if (lastPos && lastPos.latitude && lastPos.longitude) {
        const distanceMoved = calculateDistance(
          { latitude: lastPos.latitude, longitude: lastPos.longitude },
          { latitude: newPosition.latitude, longitude: newPosition.longitude }
        ) * 1000; // Convert to meters
        
        // Only update if moved at least 3 meters (reduces coordinate fluctuations)
        if (distanceMoved < 3) {
          return; // Skip this update - position hasn't changed enough
        }
      }
      
      // Only update state if position changed significantly (reduce re-renders)
      // Calculate actual distance in meters for more accurate threshold
      let distanceMeters = 0;
      if (currentPosition && currentPosition.latitude && currentPosition.longitude) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = currentPosition.latitude * Math.PI / 180;
        const φ2 = newPosition.latitude * Math.PI / 180;
        const Δφ = (newPosition.latitude - currentPosition.latitude) * Math.PI / 180;
        const Δλ = (newPosition.longitude - currentPosition.longitude) * Math.PI / 180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distanceMeters = R * c;
      }
      // Minimum 5 meters movement for route animation updates (reduces coordinate fluctuations)
      const shouldUpdatePosition = !currentPosition || distanceMeters >= 5;
      
      // IMPORTANT: Only update position from route animation if:
      // 1. During grace period (first 5 seconds), OR
      // 2. Actually moving according to GPS (after grace period)
      // This prevents route animation from updating position when stationary
      const shouldUpdateFromRoute = isInGracePeriod || (isActuallyMoving && actualGPSSpeed >= minSpeedKmh);
      
      if (shouldUpdatePosition && shouldUpdateFromRoute) {
        setCurrentPosition(newPosition);
        setRouteProgressIndex(stateRef.currentIndex);
        setRouteProgress(stateRef.segmentProgress);
        
        // Update navigation UI
        updateNavigationUI(stateRef.currentIndex, routeCoordinates, newPosition);
      } else if (!shouldUpdateFromRoute && !isInGracePeriod) {
        // If not moving and not in grace period, don't update position at all
        // GPS location tracking will handle position updates with proper thresholds
        return;
      }
      
      // Only update rotation if heading changed significantly (reduce animations)
      const headingDiff = Math.abs(heading - stateRef.lastHeading);
      if (headingDiff > headingThreshold || headingDiff > 350) { // Handle wrap-around
        stateRef.lastHeading = heading;
        Animated.timing(markerRotation, {
          toValue: heading,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
      
      // Throttle map camera updates (every 500ms instead of every update)
      if (now - stateRef.lastMapUpdate >= mapUpdateInterval) {
        stateRef.lastMapUpdate = now;
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: currentSegmentPoint.latitude,
            longitude: currentSegmentPoint.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 300);
        }
      }
      
      // Throttle expensive checks (every 2 seconds instead of every update)
      if (now - stateRef.lastCheckUpdate >= checkUpdateInterval) {
        stateRef.lastCheckUpdate = now;
        
        // Mapbox: Check for route deviation and auto-reroute if needed
        if (shouldUpdateFromRoute && currentPosition && routeCoordinates.length > 0 && endLocation) {
          const hasDeviated = checkRouteDeviation(newPosition, routeCoordinates, 50); // 50 meters deviation threshold
          if (hasDeviated) {
            console.log('⚠️ Route deviation detected (>50m), recalculating route with Mapbox...');
            // Reroute from current position to destination using Mapbox
            calculateRouteWithMapbox(newPosition, endLocation)
              .then((rerouteData) => {
                setRouteCoordinates(rerouteData.coordinates);
                setDistance(rerouteData.distance.toFixed(2));
                setDuration(rerouteData.duration);
                if (rerouteData.instructions) {
                  setNavigationInstructions(rerouteData.instructions);
                }
                // Reset route progress
                stateRef.currentIndex = 0;
                stateRef.segmentProgress = 0;
                setRouteProgressIndex(0);
                setRouteProgress(0);
                console.log('✅ Route recalculated successfully');
              })
              .catch((error) => {
                console.error('Rerouting failed:', error);
              });
          }
        }
        
        // Update ambulance location for tracking (if function exists)
        if (typeof updateAmbulanceLocation === 'function') {
          updateAmbulanceLocation(newPosition);
        }
        
        // Check for nearby tolls, police, and traffic lights (if functions exist)
        if (typeof checkNearbyTolls === 'function') {
          checkNearbyTolls(newPosition);
        }
        if (typeof checkNearbyPolice === 'function') {
          checkNearbyPolice(newPosition);
        }
      }
      
    }, updateInterval);

    return () => {
      if (routeAnimationRef.current) {
        clearInterval(routeAnimationRef.current);
        routeAnimationRef.current = null;
      }
    };
  }, [isRouteActive, routeCoordinates.length, role, calculateBearing, interpolateRoutePoint, markerRotation]);

  // Poll for police responses every 3 seconds (when ambulance has active alerts)
  useEffect(() => {
    if (role !== 'ambulance') {
      console.log('⚠️ Not ambulance role, skipping response polling');
      return;
    }

    if (policeAlerts.length === 0) {
      console.log('⚠️ No police alerts sent yet, skipping response polling');
      return;
    }

    console.log(`🔄 Starting police response polling (${policeAlerts.length} alerts)`);
    console.log('📝 Current police alerts:', policeAlerts.map(a => ({ 
      id: a.policeId, 
      name: a.policeName,
      status: a.status 
    })));

    const fetchPoliceResponses = async () => {
      try {
        console.log(`\n🔍 === POLLING CHECK === (${new Date().toLocaleTimeString()})`);
        console.log(`📍 Fetching from: ${API_ENDPOINTS.POLICE_ALERTS}`);
        console.log(`📝 Looking for responses to ${policeAlerts.length} alerts:`, 
          policeAlerts.map(a => `${a.policeName} (ID: ${a.policeId})`).join(', ')
        );
        
        const response = await fetch(API_ENDPOINTS.POLICE_ALERTS);
        
        if (!response.ok) {
          console.error(`❌ HTTP Error: ${response.status}`);
          return;
        }
        
        const data = await response.json();
        console.log(`📦 Received ${data.alerts?.length || 0} total alerts from backend`);
        
        if (data.success && data.alerts) {
          // Log all alert statuses
          data.alerts.forEach(alert => {
            console.log(`  📋 Alert #${alert.id}: ${alert.policeName} - Status: ${alert.status} - Police ID: ${alert.policeId}`);
          });
          
          // Check if any of our alerts have been responded to
          const respondedAlerts = data.alerts.filter(alert => {
            const isResponded = alert.status === 'responded';
            const matchingAlert = policeAlerts.find(pa => pa.policeId === alert.policeId);
            const isOurs = !!matchingAlert;
            
            console.log(`  🔍 Checking alert ${alert.id} (${alert.policeName}):`, {
              isResponded,
              isOurs,
              policeId: alert.policeId,
              ourAlerts: policeAlerts.map(a => a.policeId)
            });
            
            if (isResponded && isOurs) {
              console.log(`  ✅ MATCH! This is our responded alert: ${alert.policeName}`);
            }
            
            return isResponded && isOurs;
          });

          if (respondedAlerts.length > 0) {
            console.log(`\n🎉 === FOUND ${respondedAlerts.length} RESPONSE(S)! ===`);
            
            respondedAlerts.forEach(alert => {
              console.log(`\n📨 Processing response from ${alert.policeName}:`, {
                id: alert.id,
                policeId: alert.policeId,
                status: alert.status,
                trafficStatus: alert.trafficStatus,
                officer: alert.policeOfficer,
                message: alert.policeResponse
              });
              
              // Check if we haven't already processed this response
              const alreadyProcessed = policeResponses.some(pr => 
                pr.policeId === alert.policeId && 
                pr.respondedAt === alert.respondedAt
              );

              if (!alreadyProcessed) {
                console.log(`🆕 NEW RESPONSE - Processing now...`);
                handlePoliceResponse(alert);
              } else {
                console.log(`⏭️ ALREADY PROCESSED - Skipping...`);
              }
            });
          } else {
            console.log(`⏳ No responses yet. Still waiting...`);
          }
          console.log(`=== END POLLING CHECK ===\n`);
        } else {
          console.log(`⚠️ Invalid response structure:`, data);
        }
      } catch (error) {
        console.error('❌ Error fetching police responses:', error);
        console.error('Error details:', error.message);
      }
    };

    // Initial fetch
    fetchPoliceResponses();

    // Poll every 3 seconds
    const pollInterval = setInterval(fetchPoliceResponses, 3000);

    return () => {
      console.log('🛑 Stopping police response polling');
      clearInterval(pollInterval);
    };
  }, [role, policeAlerts, policeResponses]);

  // Calculate distance between two points (Haversine)
  const calculateDistance = (point1, point2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  };

  // Check for toll gates within 1km radius
  const checkNearbyTolls = (currentPos) => {
    const nearby = tollGates.filter(toll => {
      const distance = calculateDistance(currentPos, {
        latitude: toll.latitude,
        longitude: toll.longitude
      });
      return distance <= 1; // Within 1km
    });

    // Alert toll operators if new tolls are nearby
    nearby.forEach(toll => {
      if (!nearbyTolls.find(t => t.id === toll.id)) {
        sendTollAlert(toll, currentPos);
      }
    });

    setNearbyTolls(nearby);
  };

  // Update ambulance location for real-time tracking
  const updateAmbulanceLocation = async (currentPos) => {
    try {
      // Send location to backend via WebSocket (when implemented)
      console.log(`📍 Ambulance Location Update:`, {
        latitude: currentPos.latitude,
        longitude: currentPos.longitude,
        speed: currentPos.speed,
        heading: currentPos.heading,
        timestamp: new Date().toISOString()
      });

      // Update route progress if active
      if (isRouteActive && routeCoordinates.length > 0) {
        updateRouteProgress(currentPos);
      }
    } catch (error) {
      console.error('Error updating ambulance location:', error);
    }
  };

  // Check for nearby police users within 2km radius (based on current locations from backend)
  const checkNearbyPolice = async (ambulanceLocation) => {
    try {
      // Fetch current police locations from backend with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      let response;
      try {
        response = await fetch(API_ENDPOINTS.POLICE_LOCATIONS, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('⚠️ Police location request timed out');
        } else {
          console.warn('⚠️ Police location service unavailable:', fetchError.message);
        }
        setNearbyPolice([]);
        return;
      }
      
      if (!response || !response.ok) {
        // Backend not available or error response
        setNearbyPolice([]);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.police && Array.isArray(data.police)) {
        // Get police users with their current locations
        const policeUsers = data.police
          .filter(police => police.location && police.location.latitude && police.location.longitude)
          .map(police => ({
            id: police.id,
            name: police.name || 'Police Officer',
            badgeNumber: police.badgeNumber,
            latitude: police.location.latitude,
            longitude: police.location.longitude,
            location: police.location,
            lastUpdate: police.lastUpdate
          }));

        // Calculate distances and filter nearby police (within 2km)
        const nearby = policeUsers
          .map(police => {
            const distance = calculateDistance(ambulanceLocation, {
              latitude: police.latitude,
              longitude: police.longitude
            });
            return { ...police, distance };
          })
          .filter(police => police.distance <= 2) // 2km radius
          .sort((a, b) => a.distance - b.distance);

        if (nearby.length > 0) {
          console.log(`✅ ${nearby.length} police user(s) within 2km range!`);
          console.log(`📊 Current alerts count before checking: ${policeAlerts.length}`);
          nearby.forEach(police => {
            console.log(`🚔 ${police.name} is ${(police.distance * 1000).toFixed(0)}m away`);
            
            // Send alert to police if not already sent (1 minute cooldown)
            const alertExists = policeAlerts.some(alert => 
              alert.policeId === police.id && 
              Date.now() - new Date(alert.timestamp).getTime() < 60000 // 1 minute cooldown
            );

            if (!alertExists) {
              console.log(`📤 Sending alert to ${police.name}...`);
              sendPoliceAlert(police, ambulanceLocation, police.distance);
            } else {
              console.log(`⏳ Alert already sent to ${police.name} (cooldown active)`);
            }
          });
        } else {
          console.log(`❌ No police users within 2km range`);
          console.log(`📊 Current alerts count: ${policeAlerts.length}`);
        }

        setNearbyPolice(nearby);
      } else {
        console.log('⚠️ No police users with locations found');
        setNearbyPolice([]);
      }
    } catch (error) {
      // Silently handle network errors - backend might not be running
      if (error.name === 'AbortError') {
        // Already handled in fetch catch block
      } else if (error.message?.includes('Network request failed')) {
        // Silently handle - backend may not be running, don't spam console
        setNearbyPolice([]);
      } else {
        console.warn('⚠️ Error checking nearby police:', error.message);
        setNearbyPolice([]);
      }
    }
  };

  // Send alert to ALL police users (not just police station)
  const sendPoliceAlert = async (police, ambulanceLocation, distance) => {
    try {
      const distanceKm = distance;
      const distanceMeters = Math.round(distanceKm * 1000);

      const alertData = {
        policeId: police.id, // Which police was nearby (for reference)
        policeName: police.name, // Which police was nearby (for reference)
        ambulanceRole: role,
        driverName: userName,
        distance: distanceMeters,
        location: ambulanceLocation,
        route: routeCoordinates.length > 0 ? 'Active Emergency Route' : 'No Route',
        routeCoordinates: routeCoordinates.length > 0 ? routeCoordinates : null, // Send actual route
        startLocation: startLocation,
        endLocation: endLocation,
        startAddress: startAddress || 'Current Location',
        endAddress: endAddress || 'Destination',
        timestamp: new Date().toISOString(),
        forAllPolice: true // This alert goes to ALL logged-in police users (not just the nearby one)
      };

      console.log('🚔 Alert Sent to Police User:', alertData);
      console.log(`📡 Broadcasting to ${police.name}`);
      console.log('🗺️ Route Data:', {
        hasRouteCoordinates: !!alertData.routeCoordinates,
        routePoints: alertData.routeCoordinates?.length || 0,
        startLocation: alertData.startLocation,
        endLocation: alertData.endLocation,
        startAddress: alertData.startAddress,
        endAddress: alertData.endAddress
      });

      // Add to police alerts
      const newAlert = {
        ...alertData,
        time: new Date().toLocaleTimeString(),
        status: 'pending' // Waiting for ANY police user response
      };
      setPoliceAlerts(prev => {
        const updated = [...prev, newAlert];
        console.log(`📊 Total alerts count: ${updated.length}`);
        console.log(`📋 Alert added: ${newAlert.policeName} at ${newAlert.time}`);
        return updated;
      });

      // Send to backend API - will be visible to ALL police users
      console.log(`📤 Sending police alert to: ${API_ENDPOINTS.POLICE_ALERT}`);
      await fetch(API_ENDPOINTS.POLICE_ALERT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      }).catch(err => console.log('Backend not connected:', err.message));

      // Show confirmation to ambulance driver
      console.log('✅ Alert broadcast to all police users successfully');

    } catch (error) {
      console.error('Error sending police alert:', error);
    }
  };

  // Handle police response received
  const handlePoliceResponse = (alert) => {
    try {
      console.log('\n🎯 === HANDLING POLICE RESPONSE ===');
      console.log('🚔 Full alert data:', alert);
      console.log('📊 Response details:', {
        officer: alert.policeOfficer,
        station: alert.policeName,
        status: alert.trafficStatus,
        message: alert.policeResponse,
        respondedAt: alert.respondedAt
      });

      // Add to responses list
      const response = {
        policeId: alert.policeId,
        policeName: alert.policeName,
        area: alert.area,
        policeOfficer: alert.policeOfficer,
        trafficStatus: alert.trafficStatus,
        message: alert.policeResponse,
        respondedAt: alert.respondedAt,
        time: new Date(alert.respondedAt).toLocaleTimeString()
      };

      console.log('💾 Adding response to state:', response);
      setPoliceResponses(prev => {
        const updated = [...prev, response];
        console.log(`✅ Responses updated: ${prev.length} → ${updated.length}`);
        return updated;
      });

      // Update the corresponding alert status
      console.log('🔄 Updating alert status...');
      setPoliceAlerts(prev => {
        const updated = prev.map(pa => 
          pa.policeId === alert.policeId 
            ? { ...pa, status: alert.trafficStatus, response: alert.policeResponse }
            : pa
        );
        console.log('✅ Alerts updated:', updated.map(a => ({ 
          name: a.policeName, 
          status: a.status 
        })));
        return updated;
      });

      // Show notification to ambulance driver
      const statusEmoji = alert.trafficStatus === 'clear' ? '✅' : '⚠️';
      const statusText = alert.trafficStatus === 'clear' ? 'CLEAR' : 'HEAVY TRAFFIC';
      
      console.log('🔔 Showing alert popup to driver...');

      Alert.alert(
        `${statusEmoji} Police Response - ${alert.policeName}`,
        `Officer: ${alert.policeOfficer || 'On Duty'}\n\n` +
        `Traffic Status: ${statusText}\n\n` +
        `Message: ${alert.policeResponse}\n\n` +
        `Area: ${alert.area}`,
        [
          { 
            text: 'Got It', 
            style: 'default',
            onPress: () => console.log('✅ User acknowledged response')
          },
          alert.trafficStatus !== 'clear' && {
            text: 'Find Alternate Route',
            onPress: () => {
              console.log('🗺️ User wants alternate route');
              findAlternateRoute();
            }
          }
        ].filter(Boolean)
      );

      console.log(`✅ Police response processed and displayed to driver`);
      console.log('=== END HANDLING RESPONSE ===\n');

    } catch (error) {
      console.error('❌ Error handling police response:', error);
      console.error('Stack:', error.stack);
    }
  };

  // Update route progress and check for deviations
  const updateRouteProgress = (currentPos) => {
    // Find closest point on route
    let minDistance = Infinity;
    let closestIndex = 0;

    routeCoordinates.forEach((point, index) => {
      const distance = calculateDistance(currentPos, point);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });

    // If too far from route (>500m), suggest recalculation
    if (minDistance > 0.5) {
      Alert.alert(
        '⚠️ Route Deviation',
        'You have deviated from the planned route. Would you like to recalculate?',
        [
          { text: 'Continue', style: 'cancel' },
          { text: 'Recalculate', onPress: () => calculateRoute() }
        ]
      );
    }
  };

  // Send alert to toll gate operator
  const sendTollAlert = async (toll, ambulanceLocation) => {
    try {
      // Calculate exact distance
      const distanceKm = calculateDistance(ambulanceLocation, {
        latitude: toll.latitude,
        longitude: toll.longitude
      });
      const distanceMeters = Math.round(distanceKm * 1000);

      // Send alert to backend (you'll implement this)
      const alertData = {
        tollId: toll.id,
        tollName: toll.name,
        highway: toll.highway,
        ambulanceRole: role,
        driverName: userName,
        distance: distanceMeters,
        estimatedArrival: Math.ceil((distanceKm / 60) * 60), // minutes
        timestamp: new Date().toISOString()
      };

      // TODO: Send to backend API
      console.log('🚨 Toll Alert Sent:', alertData);

      // For now, simulate backend response with traffic status
      const trafficStatus = Math.random() > 0.5 ? 'clear' : 'congested';
      
      // Show alert to ambulance driver
      Alert.alert(
        `🚨 Approaching ${toll.name}`,
        `Distance: ${distanceMeters}m\nHighway: ${toll.highway}\n\n` +
        `Traffic Status: ${trafficStatus === 'clear' ? '✅ CLEAR - Free passage' : '⚠️ CONGESTED - Consider alternate route'}\n\n` +
        `Toll operator has been notified of emergency vehicle approach.`,
        [
          { text: 'OK', style: 'default' },
          trafficStatus === 'congested' && {
            text: 'Find Alternate Route',
            onPress: () => findAlternateRoute()
          }
        ].filter(Boolean)
      );

      // Add to toll alerts
      setTollAlerts(prev => [...prev, {
        ...alertData,
        trafficStatus,
        time: new Date().toLocaleTimeString()
      }]);

      // Send to backend API
      console.log(`📤 Sending toll alert to: ${API_ENDPOINTS.TOLL_ALERT}`);
      await fetch(API_ENDPOINTS.TOLL_ALERT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      }).catch(err => console.log('Backend not connected:', err.message));

    } catch (error) {
      console.error('Error sending toll alert:', error);
    }
  };

  // Find alternate route
  const findAlternateRoute = () => {
    Alert.alert(
      'Alternate Route',
      'Would you like to recalculate route avoiding congested tolls?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Recalculate', onPress: () => {
          // Trigger route recalculation
          if (startLocation && endLocation) {
            handleCreateRoute();
          }
        }}
      ]
    );
  };

  // Geocode address to coordinates and verify with reverse geocoding (optimized with timeout)
  const geocodeAddress = async (address) => {
    try {
      const geocoded = await Location.geocodeAsync(address);
      if (geocoded && geocoded.length > 0) {
        const coords = {
          latitude: geocoded[0].latitude,
          longitude: geocoded[0].longitude,
        };
        
        // Reverse geocode with timeout (non-blocking, max 1.5 seconds)
        const reverseGeocodePromise = Location.reverseGeocodeAsync(coords);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 1500)
        );
        
        try {
          const reverseGeocoded = await Promise.race([reverseGeocodePromise, timeoutPromise]);
          if (reverseGeocoded && reverseGeocoded.length > 0) {
            const addr = reverseGeocoded[0];
            // Build a readable address string
            const addressParts = [
              addr.street,
              addr.district || addr.subregion,
              addr.city || addr.region,
              addr.country
            ].filter(Boolean);
            const actualAddress = addressParts.join(', ') || address;
            
            console.log(`📍 Geocoded "${address}" to:`, {
              coords,
              actualAddress,
              fullDetails: addr
            });
            
            return {
              ...coords,
              actualAddress: actualAddress,
              fullAddress: addr
            };
          }
        } catch (reverseError) {
          // Timeout or error - use original address, don't block
          console.warn('Reverse geocoding skipped (timeout or error), using original address');
        }
        
        return {
          ...coords,
          actualAddress: address,
          fullAddress: null
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  // Calculate route between two points using Mapbox Directions API (with OSRM fallback)
  const calculateRoute = async (start, end) => {
    try {
      // Try Mapbox Directions API first (better navigation features, turn-by-turn instructions)
      try {
        const routeData = await calculateRouteWithMapbox(start, end);
        
        // Set distance and duration from Mapbox response
        setDistance(routeData.distance.toFixed(2));
        setDuration(routeData.duration);
        
        // Store Mapbox instructions for navigation
        if (routeData.instructions && routeData.instructions.length > 0) {
          setNavigationInstructions(routeData.instructions);
          console.log(`✅ Mapbox route: ${routeData.distance.toFixed(2)}km, ${routeData.duration}min, ${routeData.instructions.length} instructions`);
        }
        
        return routeData.coordinates;
      } catch (mapboxError) {
        console.warn('Mapbox route calculation failed, falling back to OSRM:', mapboxError.message);
        // Fallback to OSRM if Mapbox fails
        throw mapboxError;
      }
    } catch (error) {
      // Fallback to OSRM (Open Source Routing Machine)
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          
          // Convert coordinates to latitude/longitude format
          const coordinates = route.geometry.coordinates.map(coord => ({
            latitude: coord[1],
            longitude: coord[0]
          }));
          
          // Get distance and duration from API
          const distanceKm = (route.distance / 1000).toFixed(2);
          const durationMin = Math.ceil(route.duration / 60);
          
          setDistance(distanceKm);
          setDuration(durationMin);
          
          console.log(`✅ OSRM route calculated: ${distanceKm}km, ${durationMin}min, ${coordinates.length} points`);
          
          return coordinates;
        } else {
          // Fallback to straight line if routing fails
          console.warn('OSRM routing failed, using straight line');
          return fallbackStraightLine(start, end);
        }
      } catch (osrmError) {
        console.error('OSRM fallback also failed:', osrmError);
        // Final fallback to straight line
        return fallbackStraightLine(start, end);
      }
    }
  };

  // Generate traffic lights along route coordinates
  const generateTrafficLightsFromRouteCoordinates = (routeCoordinates) => {
    if (!routeCoordinates || routeCoordinates.length < 2) {
      return [];
    }

    const trafficLights = [];
    const interval = Math.max(8, Math.floor(routeCoordinates.length / 12)); // Generate ~12 lights along route
    
    // Generate traffic lights at regular intervals along the route
    for (let i = interval; i < routeCoordinates.length - interval; i += interval) {
      const point = routeCoordinates[i];
      
      // Random status for variety
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
        junctionType: 'four-way',
        roads: ['Route'],
        city: 'On Route',
        source: 'route-generated',
        isRealTime: false
      });
    }
    
    console.log(`✅ Generated ${trafficLights.length} traffic lights along route`);
    return trafficLights;
  };

  // Fallback straight line route
  const fallbackStraightLine = (start, end) => {
    const steps = 50;
    const route = [];
    
    for (let i = 0; i <= steps; i++) {
      const lat = start.latitude + (end.latitude - start.latitude) * (i / steps);
      const lng = start.longitude + (end.longitude - start.longitude) * (i / steps);
      route.push({ latitude: lat, longitude: lng });
    }
    
    // Calculate distance (Haversine formula)
    const R = 6371;
    const dLat = (end.latitude - start.latitude) * Math.PI / 180;
    const dLon = (end.longitude - start.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(start.latitude * Math.PI / 180) * Math.cos(end.latitude * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distanceKm = R * c;
    
    setDistance(distanceKm.toFixed(2));
    setDuration(Math.ceil(distanceKm / 50 * 60));
    
    return route;
  };

  // Handle route creation
  const handleCreateRoute = async () => {
    if (!startAddress.trim() || !endAddress.trim()) {
      Alert.alert('Error', 'Please enter both start and end locations');
      return;
    }

    setIsCreatingRoute(true); // Set loading state to true at the start
    try {
      // If user clicked "Use Current Location", startLocation is already set
      let startCoords;
      let actualStartAddress = startAddress;
      if (startAddress === 'Current Location' && startLocation) {
        startCoords = startLocation;
        actualStartAddress = 'Current Location'; // Set immediately, update in background
        
        // Reverse geocode current location in background (non-blocking with timeout)
        const reverseGeocodePromise = Location.reverseGeocodeAsync({
          latitude: startLocation.latitude,
          longitude: startLocation.longitude
        });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 1500)
        );
        
        Promise.race([reverseGeocodePromise, timeoutPromise])
          .then((reverseGeocoded) => {
            if (reverseGeocoded && reverseGeocoded.length > 0) {
              const addr = reverseGeocoded[0];
              const addressParts = [
                addr.street,
                addr.district || addr.subregion,
                addr.city || addr.region,
                addr.country
              ].filter(Boolean);
              const fullAddress = addressParts.join(', ') || 'Current Location';
              // Update address in background (non-blocking)
              setStartAddress(fullAddress);
            }
          })
          .catch((error) => {
            console.warn('Reverse geocoding skipped (timeout or error), using "Current Location"');
          });
        
        console.log('✅ Using current location as start:', startCoords);
      } else {
        const geocodedResult = await geocodeAddress(startAddress);
        if (!geocodedResult) {
          Alert.alert('Error', 'Could not find start address. Please try again with a more specific address.');
          setIsCreatingRoute(false);
          return;
        }
        startCoords = {
          latitude: geocodedResult.latitude,
          longitude: geocodedResult.longitude
        };
        actualStartAddress = geocodedResult.actualAddress || startAddress;
        
        // Show confirmation if the found address differs significantly
        if (geocodedResult.actualAddress && 
            geocodedResult.actualAddress.toLowerCase() !== startAddress.toLowerCase() &&
            !startAddress.toLowerCase().includes(geocodedResult.actualAddress.toLowerCase().split(',')[0].toLowerCase()) &&
            !geocodedResult.actualAddress.toLowerCase().includes(startAddress.toLowerCase().split(',')[0].toLowerCase())) {
          const confirmed = await new Promise((resolve) => {
            Alert.alert(
              '📍 Location Found',
              `You entered: "${startAddress}"\n\nFound location: "${geocodedResult.actualAddress}"\n\nIs this the correct location?`,
              [
                { text: 'No, Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Yes, Continue', onPress: () => resolve(true) }
              ]
            );
          });
          if (!confirmed) {
            setIsCreatingRoute(false);
            return;
          }
        }
      }

      const endGeocodedResult = await geocodeAddress(endAddress);
      if (!endGeocodedResult) {
        Alert.alert('Error', 'Could not find destination address. Please try again with a more specific address.');
        setIsCreatingRoute(false);
        return;
      }
      const endCoords = {
        latitude: endGeocodedResult.latitude,
        longitude: endGeocodedResult.longitude
      };
      const actualEndAddress = endGeocodedResult.actualAddress || endAddress;
      
      // Show confirmation if the found address differs significantly
      if (endGeocodedResult.actualAddress && 
          endGeocodedResult.actualAddress.toLowerCase() !== endAddress.toLowerCase() &&
          !endAddress.toLowerCase().includes(endGeocodedResult.actualAddress.toLowerCase().split(',')[0].toLowerCase()) &&
          !endGeocodedResult.actualAddress.toLowerCase().includes(endAddress.toLowerCase().split(',')[0].toLowerCase())) {
        const confirmed = await new Promise((resolve) => {
          Alert.alert(
            '📍 Destination Found',
            `You entered: "${endAddress}"\n\nFound location: "${endGeocodedResult.actualAddress}"\n\nIs this the correct destination?`,
            [
              { text: 'No, Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Yes, Continue', onPress: () => resolve(true) }
            ]
          );
        });
        if (!confirmed) {
          setIsCreatingRoute(false);
          return;
        }
      }

      setStartLocation(startCoords);
      setEndLocation(endCoords);
      // Update addresses to the actual geocoded addresses
      setStartAddress(actualStartAddress);
      setEndAddress(actualEndAddress);

      const route = await calculateRoute(startCoords, endCoords);
      setRouteCoordinates(route);
      
      // Fetch traffic lights along the route (pass route coordinates for better generation)
      try {
        console.log('🔍 Fetching traffic lights along route...');
        const lights = await fetchTrafficLights(startCoords, endCoords, 1, route);
        if (lights.length > 0) {
          setTrafficLights(lights);
          console.log(`✅ Loaded ${lights.length} traffic lights along route`);
          console.log('🚦 Traffic lights data:', lights.map(l => ({ name: l.name, lat: l.latitude, lng: l.longitude, status: l.status })));
        } else {
          console.log('No traffic lights found, generating from route...');
          // Fallback: Generate traffic lights from route if none found
          if (route && route.length > 10) {
            const generatedLights = generateTrafficLightsFromRouteCoordinates(route);
            if (generatedLights.length > 0) {
              setTrafficLights(generatedLights);
              console.log(`✅ Generated ${generatedLights.length} traffic lights along route`);
              console.log('🚦 Generated traffic lights:', generatedLights.map(l => ({ name: l.name, lat: l.latitude, lng: l.longitude, status: l.status })));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching traffic lights:', error);
        // Fallback: Generate traffic lights from route if API fails
        if (route && route.length > 10) {
          const generatedLights = generateTrafficLightsFromRouteCoordinates(route);
          if (generatedLights.length > 0) {
            setTrafficLights(generatedLights);
            console.log(`✅ Generated ${generatedLights.length} traffic lights as fallback`);
            console.log('🚦 Fallback traffic lights:', generatedLights.map(l => ({ name: l.name, lat: l.latitude, lng: l.longitude })));
          }
        }
      }
      
      setIsRouteActive(true);
      setRouteStartTime(new Date());
      setRouteProgressIndex(0);
      setRouteProgress(0);

      // Initialize ambulance position at route start
      if (route.length > 0 && role === 'ambulance') {
        const initialPos = {
          latitude: route[0].latitude,
          longitude: route[0].longitude,
          speed: navigationSpeedRef.current / 3.6, // Convert km/h to m/s
          heading: 0,
        };
        setCurrentPosition(initialPos);
        // Center map on start position
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: route[0].latitude,
            longitude: route[0].longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 500);
        }
      }

      // Fit map to show entire route
      if (mapRef.current && route.length > 0) {
        mapRef.current.fitToCoordinates([startCoords, endCoords], {
          edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
          animated: true,
        });
      }

      setShowRouteModal(false);
      setIsCreatingRoute(false);
      Alert.alert(
        '🚑 Route Started!', 
        `Emergency route is now active!\n\nDistance: ${distance} km\nETA: ${duration} min\n\nPolice will be notified when you enter their area.`,
        [{ text: 'Start Journey', style: 'default' }]
      );
    } catch (error) {
      console.error('Error creating route:', error);
      setIsCreatingRoute(false);
      Alert.alert('Error', 'Failed to create route. Please try again.');
    }
  };

  // Use current location as start
  const useCurrentLocation = async () => {
    setIsFetchingCurrentLocation(true);
    try {
      console.log('📍 Fetching current location...');
      
      // Get fresh current location (use Balanced for faster response)
      let currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 5000, // Accept cached location up to 5 seconds old
      });
      
      const currentCoords = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
      
      console.log('✅ Current location fetched:', currentCoords);
      
      setStartLocation(currentCoords);
      setStartAddress('Current Location');
      
      Alert.alert('✅ Success', 'Current location set as start point');
    } catch (error) {
      console.error('Error getting current location:', error);
      
      // Fallback to existing location state
      if (location) {
        setStartLocation(location);
        setStartAddress('Current Location');
        Alert.alert('✅ Success', 'Using last known location as start point');
      } else {
        Alert.alert('Error', 'Could not get current location. Please enable GPS.');
      }
    } finally {
      setIsFetchingCurrentLocation(false);
    }
  };

  // Clear route
  const clearRoute = () => {
    // Stop route animation
    if (routeAnimationRef.current) {
      clearInterval(routeAnimationRef.current);
      routeAnimationRef.current = null;
    }
    setRouteCoordinates([]);
    setStartLocation(location);
    setEndLocation(null);
    setStartAddress('');
    setEndAddress('');
    setDistance(null);
    setDuration(null);
    setIsRouteActive(false);
    setRouteStartTime(null);
    setRouteProgressIndex(0);
    setRouteProgress(0);
    setPoliceAlerts([]); // Clear police alerts when route ends
  };

  const handleEmergencyPress = (emergency) => {
    Alert.alert(
      'Accept Emergency',
      `Do you want to respond to this ${emergency.title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => {
            Alert.alert('Success', 'You are now responding to this emergency');
            // TODO: Connect to backend to update emergency status
          },
        },
      ]
    );
  };

  const roleColor = role === 'ambulance' ? '#E74C3C' : '#2E86AB';
  const roleEmoji = role === 'ambulance' ? '🚑' : '🚔';

  // Get rounded coordinates for marker - memoized to prevent unnecessary recalculations
  const markerCoords = useMemo(() => {
    if (role !== 'ambulance') {
      return null;
    }
    
    const coord = currentPosition || location;
    if (!coord || !coord.latitude || !coord.longitude) {
      console.log('⚠️ No valid coordinates for ambulance marker:', { 
        hasCurrentPosition: !!currentPosition,
        hasLocation: !!location,
        currentPosition,
        location 
      });
      return null;
    }
    
    // Round coordinates to 5 decimal places (approximately 1m precision) - reduces sensitivity to small changes
    const roundedLat = Math.round(coord.latitude * 100000) / 100000;
    const roundedLng = Math.round(coord.longitude * 100000) / 100000;
    const coordKey = `${roundedLat},${roundedLng}`;
    
    // Only log when coordinates actually change
    if (lastMarkerCoords.current !== coordKey) {
      lastMarkerCoords.current = coordKey;
      console.log('🚑✅ Ambulance marker coordinates UPDATED:', { 
        lat: roundedLat, 
        lng: roundedLng,
        coordKey,
        isRouteActive,
        hasRotation: !!markerRotation
      });
    }
    
    return { roundedLat, roundedLng, coordKey };
  }, [role, currentPosition?.latitude, currentPosition?.longitude, location?.latitude, location?.longitude, isRouteActive]);

  if (isLoadingLocation || !location) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingAnimationContainer}>
          <ActivityIndicator size="large" color={roleColor} />
          <View style={styles.loadingPulse} />
        </View>
        <Text style={styles.loadingText}>Loading map...</Text>
        <Text style={styles.loadingSubtext}>Getting your location</Text>
        <View style={styles.loadingProgressBar}>
          <Animated.View 
            style={[
              styles.loadingProgressFill,
              { backgroundColor: roleColor }
            ]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: roleColor }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerEmoji}>{roleEmoji}</Text>
          <View>
            <Text style={styles.headerTitle}>Welcome, {userName}</Text>
            <Text style={styles.headerSubtitle}>
              {role === 'ambulance' ? 'Medical Response' : 'Law Enforcement'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Logout', 
                  onPress: () => {
                    // Reset navigation to Home screen and clear all history
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Home' }],
                    });
                  }
                },
              ]
            );
          }}
        >
          <Text style={styles.logoutText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <Animated.View
        style={[
          styles.mapContainer,
          {
            height: panelSlideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [height * 0.6, height * 0.95], // Expand from 60% to 95% when collapsed
            }),
          },
        ]}
      >
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
        initialRegion={location || {
          latitude: 20.5937,
          longitude: 78.9629,
          latitudeDelta: 5.0,
          longitudeDelta: 5.0,
        }}
        region={currentPosition ? {
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : location}
        showsUserLocation={false} // Always hide default blue dot - we use custom markers
        showsMyLocationButton={true}
        showsCompass={true}
        showsTraffic={false}
        loadingEnabled={true}
        loadingIndicatorColor="#2E86AB"
        onMapReady={() => {
          setIsLoadingMap(false);
          console.log('✅ Map loaded and ready');
          if (role === 'ambulance' && markerCoords) {
            console.log('🚑 Ambulance marker should be visible at:', markerCoords);
          }
        }}
      >
        {/* AMBULANCE MARKER - Always visible when coordinates are available */}
        {role === 'ambulance' && markerCoords && (
          <>
            <Marker
              key={`ambulance-marker-${markerCoords.coordKey}`}
              coordinate={{
                latitude: markerCoords.roundedLat,
                longitude: markerCoords.roundedLng,
              }}
              title="🚑 Ambulance"
              description={isRouteActive 
                ? `${userName} - ${currentPosition?.speed ? `Speed: ${(currentPosition.speed * 3.6).toFixed(0)} km/h - ` : ''}On Route`
                : `${userName} - Standing By`}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={false}
              tracksViewChanges={false}
              zIndex={2000}
            >
             
            </Marker>
            
            {/* DEBUG: Simple test marker to ensure visibility */}
            <Marker
              key={`ambulance-test-${markerCoords.coordKey}`}
              coordinate={{
                latitude: markerCoords.roundedLat,
                longitude: markerCoords.roundedLng,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={2001}
            >
              <View style={styles.ambulanceTestMarker}>
                <Text style={styles.ambulanceTestText}>🚑</Text>
              </View>
            </Marker>
          </>
        )}

        {/* Current Location Marker - Blue dot showing device location (only show if not ambulance) */}
        {location && role !== 'ambulance' && (
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            title="📍 Current Location"
            description="Your current device location"
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={500}
          >
            <View style={styles.currentLocationMarker}>
              <View style={styles.currentLocationPulse} />
              <View style={styles.currentLocationDot} />
            </View>
          </Marker>
        )}

        {/* Route polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={roleColor}
            strokeWidth={4}
          />
        )}

        {/* Start location marker - Hide for ambulance users (they have custom marker) */}
        {startLocation && role !== 'ambulance' && (
          <Marker
            coordinate={startLocation}
            title="Start Location"
            description={startAddress || "Starting point"}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.startMarkerContainer}>
              <View style={styles.startMarker}>
                <Text style={styles.startMarkerEmoji}>📍</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* End location marker */}
        {endLocation && (
          <Marker
            coordinate={endLocation}
            title="Destination"
            description={endAddress || "Emergency location"}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.endMarkerContainer}>
              <View style={styles.endMarker}>
                <Text style={styles.endMarkerEmoji}>🎯</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* Emergency markers */}
        {emergencies.map((emergency) => (
          <Marker
            key={emergency.id}
            coordinate={{
              latitude: emergency.latitude,
              longitude: emergency.longitude,
            }}
            title={emergency.title}
            description={emergency.description}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onPress={() => handleEmergencyPress(emergency)}
          >
            <View style={styles.emergencyMarkerContainer}>
              <View style={styles.emergencyMarkerPulse} />
              <View style={styles.emergencyMarker}>
                <Text style={styles.emergencyMarkerEmoji}>🚨</Text>
              </View>
            </View>
          </Marker>
        ))}

          {/* Police user markers (current locations from backend) */}
          {nearbyPolice.map((police) => (
            <Marker
              key={`police-${police.id}`}
              coordinate={{
                latitude: police.latitude,
                longitude: police.longitude,
              }}
              title={`🚔 ${police.name}`}
              description={`${(police.distance * 1000).toFixed(0)}m away`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.policeMarkerContainer}>
                <View style={styles.policeMarkerPulse} />
                <View style={styles.policeMarker}>
                  <View style={styles.policeIconCircle}>
                    <Text style={styles.policeMarkerEmoji}>🚔</Text>
                  </View>
                </View>
              </View>
            </Marker>
          ))}

          {/* Toll gate markers */}
          {tollGates.map((toll) => (
            <Marker
              key={`toll-${toll.id}`}
              coordinate={{
                latitude: toll.latitude,
                longitude: toll.longitude,
              }}
              title={`💰 ${toll.name}`}
              description={`${toll.highway} - ${toll.city}`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.tollMarkerContainer}>
                <View style={styles.tollMarkerPulse} />
                <View style={styles.tollMarker}>
                  <View style={styles.tollIconCircle}>
                    <Text style={styles.tollMarkerEmoji}>💰</Text>
                  </View>
                </View>
              </View>
            </Marker>
          ))}

          {/* Traffic Light markers - Real-time with color changes */}
          {trafficLightMarkers}

        </MapView>
      </Animated.View>

      {/* Google Maps Style Navigation Overlay */}
      {isRouteActive && routeCoordinates.length > 0 && (
        <View style={styles.navigationOverlay}>
          <View style={styles.navigationCard}>
            {/* Speed Display - Only show if speed > 0 (actually moving) */}
            {currentPosition?.speed !== undefined && currentPosition?.speed !== null && currentPosition.speed > 0 && (
              <View style={styles.speedContainer}>
                <Text style={styles.speedValue}>
                  {Math.round(currentPosition.speed * 3.6)}
                </Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>
            )}
            
            {/* Next Turn Instruction - Google Maps Style */}
            {nextTurn && (
              <View style={styles.nextTurnContainer}>
                <View style={[styles.turnIconContainer, { backgroundColor: nextTurn.iconColor || '#4285F4' }]}>
                  <Text style={styles.turnIcon}>{nextTurn.icon}</Text>
                </View>
                <View style={styles.turnInfo}>
                  <Text style={styles.turnInstruction}>{nextTurn.instruction}</Text>
                  {distanceToNextTurn !== null && (
                    <Text style={styles.turnDistance}>
                      {distanceToNextTurn > 1000 
                        ? `${(distanceToNextTurn / 1000).toFixed(1)} km`
                        : `${distanceToNextTurn} m`}
                    </Text>
                  )}
                </View>
              </View>
            )}
            
            {/* Continue straight indicator when no turn */}
            {!nextTurn && isRouteActive && (
              <View style={styles.nextTurnContainer}>
                <View style={[styles.turnIconContainer, { backgroundColor: '#4285F4' }]}>
                  <Text style={styles.turnIcon}>↑</Text>
                </View>
                <View style={styles.turnInfo}>
                  <Text style={styles.turnInstruction}>Continue straight</Text>
                  {remainingDistance !== null && (
                    <Text style={styles.turnDistance}>
                      {remainingDistance > 1 
                        ? `${remainingDistance.toFixed(1)} km to destination`
                        : `${(remainingDistance * 1000).toFixed(0)} m to destination`}
                    </Text>
                  )}
                </View>
              </View>
            )}
            
            {/* Current Street and Progress */}
            <View style={styles.navigationFooter}>
              <Text style={styles.currentStreet} numberOfLines={1}>
                {currentStreet || 'On route'}
              </Text>
              <View style={styles.progressInfo}>
                {remainingDistance !== null && remainingTime !== null && (
                  <Text style={styles.progressText}>
                    {typeof remainingDistance === 'number' ? remainingDistance.toFixed(1) : remainingDistance} km • {remainingTime} min
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Route Info Banner with Start Button (when not in active navigation) - Also collapsible */}
      {routeCoordinates.length > 0 && !isRouteActive && (
        <Animated.View
          style={[
            styles.routeInfoBanner,
            {
              transform: [{
                translateY: panelSlideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height * 0.85],
                }),
              }],
              opacity: panelSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.3],
              }),
            },
          ]}
        >
          <View style={styles.routeInfoContainer}>
            <View style={styles.routeInfo}>
              <Text style={styles.routeInfoLabel}>Distance</Text>
              <Text style={styles.routeInfoValue}>{distance} km</Text>
            </View>
            <View style={styles.routeInfo}>
              <Text style={styles.routeInfoLabel}>ETA</Text>
              <Text style={styles.routeInfoValue}>{duration} min</Text>
            </View>
          </View>
          <View style={styles.routeActionButtons}>
            <TouchableOpacity
              style={styles.startJourneyButton}
              onPress={() => {
                setIsRouteActive(true);
                setRouteStartTime(new Date());
                setRouteProgressIndex(0);
                setRouteProgress(0);
                
                // Initialize ambulance position at route start
                if (routeCoordinates.length > 0 && role === 'ambulance') {
                  const initialPos = {
                    latitude: routeCoordinates[0].latitude,
                    longitude: routeCoordinates[0].longitude,
                    speed: navigationSpeedRef.current / 3.6,
                    heading: 0,
                  };
                  setCurrentPosition(initialPos);
                  
                  // Center map on start position
                  if (mapRef.current) {
                    mapRef.current.animateToRegion({
                      latitude: routeCoordinates[0].latitude,
                      longitude: routeCoordinates[0].longitude,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }, 1000);
                  }
                }
                
                Alert.alert('🚑 Journey Started!', 'Navigation is now active. Follow the route instructions.');
              }}
            >
              <Text style={styles.startJourneyButtonText}>▶ Start</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clearRouteButton}
              onPress={clearRoute}
            >
              <Text style={styles.clearRouteText}>✕</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Collapsible Panel Toggle Button - Fixed position, always visible */}
      <Animated.View
        style={[
          styles.collapseButton,
          {
            bottom: panelSlideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [height * 0.4, 50], // Move up when panel is collapsed
            }),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.collapseButtonTouchable}
          onPress={() => {
            const newCollapsed = !isPanelCollapsed;
            setIsPanelCollapsed(newCollapsed);
            
            // Animate panel slide
            // Note: useNativeDriver: false for height/maxHeight animations
            Animated.timing(panelSlideAnim, {
              toValue: newCollapsed ? 1 : 0,
              duration: 300,
              useNativeDriver: false, // Required for height/maxHeight animations
            }).start();
          }}
        >
          <Animated.View
            style={{
              transform: [{
                rotate: panelSlideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '180deg'],
                }),
              }],
            }}
          >
            <Text style={styles.collapseButtonIcon}>▼</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom panel - Collapsible */}
      <Animated.View
        style={[
          styles.bottomPanel,
          {
            transform: [{
              translateY: panelSlideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, height * 0.85], // Slide down by 85% of screen height
              }),
            }],
            opacity: panelSlideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.3], // Fade out slightly when collapsed
            }),
          },
        ]}
      >
          {/* Police Responses Section */}
          {role === 'ambulance' && policeResponses.length > 0 && (
            <View style={styles.policeResponsesSection}>
              <Text style={styles.policeResponsesTitle}>📢 Police Responses ({policeResponses.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {policeResponses.slice(-5).reverse().map((response, index) => (
                  <View key={index} style={[
                    styles.policeResponseCard,
                    { backgroundColor: response.trafficStatus === 'clear' ? '#27AE60' : '#E74C3C' }
                  ]}>
                    <Text style={styles.policeResponseIcon}>
                      {response.trafficStatus === 'clear' ? '✅' : '⚠️'}
                    </Text>
                    <Text style={styles.policeResponseName}>{response.policeName}</Text>
                    <Text style={styles.policeResponseStatus}>
                      {response.trafficStatus === 'clear' ? 'ROUTE CLEAR' : 'HEAVY TRAFFIC'}
                    </Text>
                    <Text style={styles.policeResponseOfficer}>
                      Officer: {response.policeOfficer || 'On Duty'}
                    </Text>
                    <Text style={styles.policeResponseTime}>{response.time}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Police Alerts Section */}
          {role === 'ambulance' && policeAlerts.length > 0 && (
            <View style={styles.policeAlertsSection}>
              <Text style={styles.policeAlertsTitle}>🚔 Police Alerts Sent</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {policeAlerts.slice(-3).reverse().map((alert, index) => (
                  <View key={index} style={[
                    styles.policeAlertCard,
                    { backgroundColor: alert.status === 'clear' ? '#27AE60' : alert.status === 'busy' ? '#E74C3C' : '#FFA500' }
                  ]}>
                    <Text style={styles.policeAlertName}>{alert.policeName}</Text>
                    <Text style={styles.policeAlertStatus}>
                      {alert.status === 'clear' ? '✅ CLEAR' : alert.status === 'busy' ? '⚠️ BUSY' : '⏳ PENDING'}
                    </Text>
                    <Text style={styles.policeAlertTime}>{alert.time}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Toll Alerts Section */}
          {role === 'ambulance' && tollAlerts.length > 0 && (
            <View style={styles.tollAlertsSection}>
              <Text style={styles.tollAlertsTitle}>🚨 Recent Toll Alerts</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {tollAlerts.slice(-3).reverse().map((alert, index) => (
                  <View key={index} style={[
                    styles.tollAlertCard,
                    { backgroundColor: alert.trafficStatus === 'clear' ? '#27AE60' : '#E74C3C' }
                  ]}>
                    <Text style={styles.tollAlertName}>{alert.tollName}</Text>
                    <Text style={styles.tollAlertStatus}>
                      {alert.trafficStatus === 'clear' ? '✅ CLEAR' : '⚠️ CONGESTED'}
                    </Text>
                    <Text style={styles.tollAlertTime}>{alert.time}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}


        {/* Route Status */}
        {isRouteActive && (
          <View style={styles.routeStatusContainer}>
            <View style={styles.routeStatusCard}>
              <Text style={styles.routeStatusTitle}>🚑 Emergency Route Active</Text>
              <Text style={styles.routeStatusInfo}>
                Distance: {distance} km | ETA: {duration} min
              </Text>
              <Text style={styles.routeStatusTime}>
                Started: {routeStartTime ? routeStartTime.toLocaleTimeString() : 'Unknown'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{policeAlerts.length}</Text>
            <Text style={styles.statLabel}>Alerts Sent</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{policeResponses.length}</Text>
            <Text style={styles.statLabel}>Responses</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{tollAlerts.length}</Text>
            <Text style={styles.statLabel}>Toll Alerts</Text>
          </View>
          <View style={styles.statCard}>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createRouteButton, { backgroundColor: roleColor }]}
          onPress={() => setShowRouteModal(true)}
        >
          <Text style={styles.createRouteButtonText}>🗺️ Create Route</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statusButton, { backgroundColor: roleColor }]}
          onPress={async () => {
            console.log('\n📊 === AMBULANCE STATUS ===');
            console.log('Alerts sent:', policeAlerts.length);
            console.log('Responses received:', policeResponses.length);
            console.log('Route active:', isRouteActive);
            console.log('Route points:', routeCoordinates.length);
            
            // Check backend
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              
              let response;
              try {
                response = await fetch(API_ENDPOINTS.POLICE_ALERTS, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);
              } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                  console.log('⚠️ Backend check timed out');
                } else {
                  console.log('⚠️ Backend unavailable - service may not be running');
                }
                return;
              }
              
              if (response && response.ok) {
                const data = await response.json();
                console.log('\nBackend has:', data.alerts?.length || 0, 'alerts');
                data.alerts?.forEach(alert => {
                  console.log(`  - ${alert.policeName}: ${alert.status}`);
                });
              } else {
                console.log('⚠️ Backend returned error response');
              }
            } catch (e) {
              // Silently handle - backend may not be running
              if (!e.message?.includes('Network request failed')) {
                console.warn('⚠️ Backend check error:', e.message);
              }
            }
            
            console.log('=== END STATUS ===\n');
            
            Alert.alert(
              '📊 Ambulance Status',
              `Alerts Sent: ${policeAlerts.length}\n` +
              `Responses: ${policeResponses.length}\n` +
              `Route Active: ${isRouteActive ? 'Yes' : 'No'}\n` +
              `Route Points: ${routeCoordinates.length}\n\n` +
              `Check console for backend status.`,
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.statusButtonText}>📊 Status</Text>
        </TouchableOpacity>

        {/* Manual Check for Responses Button */}
        {role === 'ambulance' && policeAlerts.length > 0 && (
          <TouchableOpacity
            style={[styles.checkResponseButton, { backgroundColor: '#27AE60' }]}
            onPress={async () => {
              console.log('\n🔄 === MANUAL RESPONSE CHECK ===');
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                let response;
                try {
                  response = await fetch(API_ENDPOINTS.POLICE_ALERTS, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                  });
                  clearTimeout(timeoutId);
                } catch (fetchError) {
                  clearTimeout(timeoutId);
                  Alert.alert(
                    '⚠️ Service Unavailable',
                    'Backend service is not available. Please ensure the server is running.',
                    [{ text: 'OK' }]
                  );
                  return;
                }
                
                if (!response || !response.ok) {
                  Alert.alert('⚠️ Error', 'Failed to fetch alerts from backend');
                  return;
                }
                
                const data = await response.json();
                console.log('📦 Backend response:', data);
                
                if (data.success && data.alerts) {
                  console.log(`Found ${data.alerts.length} alerts in backend`);
                  data.alerts.forEach(alert => {
                    console.log(`  - ${alert.policeName}: status=${alert.status}, trafficStatus=${alert.trafficStatus}`);
                  });
                  
                  const responded = data.alerts.filter(a => a.status === 'responded');
                  Alert.alert(
                    'Manual Check Complete',
                    `Total alerts: ${data.alerts.length}\n` +
                    `Responded: ${responded.length}\n\n` +
                    `${responded.length > 0 ? '✅ Responses found! Processing...' : '⏳ No responses yet'}`,
                    [{ text: 'OK' }]
                  );
                  
                  // Process any responses
                  responded.forEach(alert => {
                    const alreadyProcessed = policeResponses.some(pr => 
                      pr.policeId === alert.policeId && pr.respondedAt === alert.respondedAt
                    );
                    if (!alreadyProcessed) {
                      handlePoliceResponse(alert);
                    }
                  });
                }
              } catch (error) {
                // Handle network errors gracefully
                if (error.message?.includes('Network request failed')) {
                  Alert.alert(
                    '⚠️ Service Unavailable',
                    'Backend service is not available. Please ensure the server is running.',
                    [{ text: 'OK' }]
                  );
                } else {
                  console.warn('⚠️ Error checking responses:', error.message);
                  Alert.alert('⚠️ Error', error.message || 'Failed to check responses');
                }
              }
            }}
          >
            <Text style={styles.checkResponseButtonText}>🔍 Check for Responses Now</Text>
          </TouchableOpacity>
        )}

        {/* Test Police Alert Button - For Testing */}
        {role === 'ambulance' && (
          <TouchableOpacity
            style={[styles.testAlertButton, { backgroundColor: '#9B59B6' }]}
            onPress={() => {
              console.log('🧪 TEST MODE: Setting up test scenario...');
              
              // Check if route exists
              if (routeCoordinates.length === 0) {
                console.log('⚠️ No route exists. Creating test route...');
                
                // Create a test route from Vizianagaram to Visakhapatnam
                const testStart = { latitude: 18.1167, longitude: 83.4167 }; // Vizianagaram
                const testEnd = { latitude: 17.6868, longitude: 83.2185 }; // Visakhapatnam
                
                // Create simple route coordinates (straight line for testing)
                const testRouteCoords = [];
                const steps = 20;
                for (let i = 0; i <= steps; i++) {
                  testRouteCoords.push({
                    latitude: testStart.latitude + (testEnd.latitude - testStart.latitude) * (i / steps),
                    longitude: testStart.longitude + (testEnd.longitude - testStart.longitude) * (i / steps)
                  });
                }
                
                setStartLocation(testStart);
                setEndLocation(testEnd);
                setStartAddress('Vizianagaram, Andhra Pradesh');
                setEndAddress('Visakhapatnam, Andhra Pradesh');
                setRouteCoordinates(testRouteCoords);
                setIsRouteActive(true);
                setRouteStartTime(new Date());
                setDistance('45.2');
                setDuration('55');
                
                console.log('✅ Test route created:', {
                  start: 'Vizianagaram',
                  end: 'Visakhapatnam',
                  points: testRouteCoords.length
                });
              }
              
              // Use test location near Vizianagaram Central Junction
              const testLocation = {
                latitude: 18.1167,
                longitude: 83.4167
              };
              
              console.log('🧪 TEST MODE: Triggering police alert check...');
              checkNearbyPolice(testLocation);
              
              Alert.alert(
                '🧪 Test Alert with Route',
                `${routeCoordinates.length > 0 ? '✅ Route exists!' : '✅ Test route created!'}\n\n` +
                `Route: ${startAddress || 'Vizianagaram'} → ${endAddress || 'Visakhapatnam'}\n` +
                `Points: ${routeCoordinates.length || 20}\n\n` +
                `Police alerts triggered.`,
                [{ text: 'OK' }]
              );
            }}
          >
            <Text style={styles.testAlertButtonText}>🧪 Test Route</Text>
          </TouchableOpacity>
        )}

      </Animated.View>

      {/* Route Creation Modal */}
      <Modal
        visible={showRouteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRouteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Route</Text>
              <TouchableOpacity onPress={() => setShowRouteModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Start Location</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter start address"
                  value={startAddress}
                  onChangeText={setStartAddress}
                  placeholderTextColor="#7F8C8D"
                />
                <TouchableOpacity
                  style={[styles.currentLocationButton, isFetchingCurrentLocation && styles.buttonDisabled]}
                  onPress={useCurrentLocation}
                  disabled={isFetchingCurrentLocation}
                >
                  {isFetchingCurrentLocation ? (
                    <View style={styles.buttonLoadingRow}>
                      <ActivityIndicator size="small" color="#FFFFFF" style={styles.buttonSpinner} />
                      <Text style={styles.currentLocationText}>Loading...</Text>
                    </View>
                  ) : (
                    <Text style={styles.currentLocationText}>📍 Current</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Destination</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter destination address"
                value={endAddress}
                onChangeText={setEndAddress}
                placeholderTextColor="#7F8C8D"
              />

              <Text style={styles.exampleText}>
                Example: "123 Main St, Bangalore" or "MG Road, Bangalore"
              </Text>

              <TouchableOpacity
                style={[styles.calculateButton, { backgroundColor: roleColor, opacity: isCreatingRoute ? 0.6 : 1 }]}
                onPress={handleCreateRoute}
                disabled={isCreatingRoute}
              >
                {isCreatingRoute ? (
                  <View style={styles.buttonLoadingContainer}>
                    <ActivityIndicator size="small" color="#FFFFFF" style={styles.buttonSpinner} />
                    <Text style={styles.calculateButtonText}>Calculating Route...</Text>
                  </View>
                ) : (
                  <Text style={styles.calculateButtonText}>Calculate Route</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingAnimationContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingPulse: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    opacity: 0.6,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingProgressBar: {
    width: 200,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 10,
  },
  loadingProgressFill: {
    height: '100%',
    width: '70%',
    borderRadius: 2,
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248, 249, 250, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#2C3E50',
    fontWeight: '600',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerEmoji: {
    fontSize: 36,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  logoutButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  mapContainer: {
    width: width,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    width: width,
    height: '100%',
  },
  collapseButton: {
    position: 'absolute',
    right: 20,
    width: 70,
    height: 70,
    zIndex: 2000, // Higher than bottom panel to stay above
  },
  collapseButtonTouchable: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 15,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  collapseButtonIcon: {
    fontSize: 36,
    color: '#2C3E50',
    fontWeight: 'bold',
  },
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000, // Lower than collapse button
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2E86AB',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    textAlign: 'center',
  },
  createRouteButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  createRouteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  navigationOverlay: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  navigationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  speedContainer: {
    position: 'absolute',
    top: -30,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#4285F4',
  },
  speedValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4285F4',
    marginRight: 4,
  },
  speedUnit: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '600',
  },
  nextTurnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  turnIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  turnIcon: {
    fontSize: 42,
    color: '#FFFFFF',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 42,
  },
  turnInfo: {
    flex: 1,
  },
  turnInstruction: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 6,
  },
  turnDistance: {
    fontSize: 18,
    color: '#4285F4',
    fontWeight: '700',
  },
  navigationFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentStreet: {
    fontSize: 15,
    color: '#7F8C8D',
    flex: 1,
    marginRight: 12,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 15,
    color: '#2C3E50',
    fontWeight: '700',
  },
  routeInfoBanner: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  routeInfoContainer: {
    flexDirection: 'row',
    gap: 24,
    flex: 1,
  },
  routeInfo: {
    alignItems: 'flex-start',
  },
  routeInfoLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 4,
    fontWeight: '500',
  },
  routeInfoValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  routeActionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  startJourneyButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  startJourneyButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  clearRouteButton: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearRouteText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: height * 0.7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  modalClose: {
    fontSize: 24,
    color: '#7F8C8D',
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
    marginTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F8F9FA',
    color: '#2C3E50',
  },
  currentLocationButton: {
    backgroundColor: '#27AE60',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  currentLocationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  exampleText: {
    fontSize: 12,
    color: '#7F8C8D',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 20,
  },
  calculateButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  calculateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  policeAlertsSection: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  policeAlertsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  policeAlertCard: {
    padding: 12,
    borderRadius: 8,
    marginRight: 10,
    minWidth: 140,
  },
  policeAlertName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  policeAlertStatus: {
    fontSize: 10,
    color: 'white',
    marginBottom: 2,
  },
  policeAlertTime: {
    fontSize: 9,
    color: 'white',
    opacity: 0.8,
  },
  routeStatusContainer: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  routeStatusCard: {
    backgroundColor: '#E8F5E8',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#27AE60',
  },
  routeStatusTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#27AE60',
    marginBottom: 4,
  },
  routeStatusInfo: {
    fontSize: 12,
    color: '#333',
    marginBottom: 2,
  },
  routeStatusTime: {
    fontSize: 10,
    color: '#666',
  },
  tollAlertsSection: {
    marginBottom: 16,
  },
  tollAlertsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  tollAlertCard: {
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 120,
  },
  tollAlertName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  tollAlertStatus: {
    color: '#FFFFFF',
    fontSize: 11,
    marginBottom: 2,
  },
  tollAlertTime: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.9,
  },
  testAlertButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  testAlertButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  checkResponseButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  checkResponseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  policeResponsesSection: {
    backgroundColor: '#E8F8F5',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#27AE60',
  },
  policeResponsesTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#27AE60',
    marginBottom: 10,
  },
  policeResponseCard: {
    padding: 14,
    borderRadius: 10,
    marginRight: 12,
    minWidth: 160,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  policeResponseIcon: {
    fontSize: 28,
    marginBottom: 6,
    textAlign: 'center',
  },
  policeResponseName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 6,
  },
  policeResponseStatus: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  policeResponseOfficer: {
    fontSize: 10,
    color: 'white',
    opacity: 0.9,
    marginBottom: 4,
  },
  policeResponseTime: {
    fontSize: 9,
    color: 'white',
    opacity: 0.8,
  },
  trafficLightMarker: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E74C3C', // Red background - make sure it's visible
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 15,
  },
  trafficLightEmoji: {
    fontSize: 32,
    textAlign: 'center',
  },
  trafficLightCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginVertical: 1,
  },
  emergencyIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#E74C3C',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyText: {
    fontSize: 10,
    color: 'white',
  },
  ambulanceMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 150,
    height: 150,
    backgroundColor: 'transparent',
  },
  // Google Maps Style Navigation Arrow
  navigationArrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    position: 'relative',
  },
  navigationArrowOuterRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#87CEEB', // Light blue (sky blue)
    opacity: 0.3,
  },
  navigationArrowBackground: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  navigationArrow: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#4285F4', // Google Maps blue
    marginBottom: -2,
  },
  arrowStem: {
    width: 4,
    height: 12,
    backgroundColor: '#4285F4', // Google Maps blue
    borderRadius: 2,
  },
  ambulanceMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    position: 'relative',
  },
  ambulanceIconContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambulanceIconPulse: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E74C3C',
    opacity: 0.3,
  },
  ambulanceIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#E74C3C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 1,
  },
  ambulanceMarkerWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambulanceTestText:{
    fontSize: 20,
    
  },
  trafficLightTestMarker: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 15,
    position: 'relative',
  },
  trafficLightTestText: {
    fontSize: 60,
    textAlign: 'center',
  },
  trafficLightTimer: {
    position: 'absolute',
    bottom: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trafficLightTimerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  ambulancePulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E74C3C',
    opacity: 0.4,
    borderWidth: 3,
    borderColor: 'rgba(231, 76, 60, 0.6)',
  },
  ambulanceMainMarker: {
    width: 100,
    height: 100,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#E74C3C',
    shadowColor: '#E74C3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 2,
    position: 'relative',
  },
  ambulanceIconContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ambulanceIconImage: {
    width: 55,
    height: 55,
    position: 'absolute',
    zIndex: 3,
  },
  ambulanceEmojiFallback: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 2,
  },
  ambulanceEmojiText: {
    fontSize: 40,
    textAlign: 'center',
  },
  ambulanceDirectionArrow: {
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#E74C3C',
    zIndex: 4,
  },
  
  ambulanceBody: {
    width: 200,
    height: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 3,
    borderColor: '#E74C3C',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 15,
  },
  ambulanceFront: {
    width: 18,
    height: 30,
    backgroundColor: '#E74C3C',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  ambulanceMainBody: {
    flex: 1,
    height: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambulanceCross: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  crossVertical: {
    position: 'absolute',
    width: 4,
    height: 18,
    backgroundColor: '#E74C3C',
    borderRadius: 2,
  },
  crossHorizontal: {
    position: 'absolute',
    width: 18,
    height: 4,
    backgroundColor: '#E74C3C',
    borderRadius: 2,
  },
  ambulanceBack: {
    width: 12,
    height: 30,
    backgroundColor: '#F8F9FA',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    borderLeftWidth: 1,
    borderLeftColor: '#E0E0E0',
  },
  ambulanceDirectionIndicator: {
    position: 'absolute',
    top: -10,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#E74C3C',
    zIndex: 10,
  },
  currentLocationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  currentLocationDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2196F3',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 501,
  },
  currentLocationPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(33, 150, 243, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(33, 150, 243, 0.5)',
    zIndex: 500,
  },
  // Police marker styles
  policeMarkerContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  policeMarkerPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2196F3',
    opacity: 0.4,
  },
  policeMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 1,
  },
  policeIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  policeMarkerEmoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  // Toll marker styles
  tollMarkerContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tollMarkerPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFA500',
    opacity: 0.4,
  },
  tollMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFA500',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 1,
  },
  tollIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tollMarkerEmoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  // Traffic light marker styles
  trafficLightMarkerContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  trafficLightMarkerPulse: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.5,
    borderWidth: 2,
  },
  // Duplicate removed - using trafficLightMarker at line 3560
  trafficLightIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  trafficLightMarkerEmoji: {
    fontSize: 45,
    textAlign: 'center',
  },
  realTimeIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#27AE60',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  realTimeText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  // Start/End marker styles
  startMarkerContainer: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  startMarker: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#27AE60',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  startMarkerEmoji: {
    fontSize: 24,
    textAlign: 'center',
  },
  endMarkerContainer: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  endMarker: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#E74C3C',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  endMarkerEmoji: {
    fontSize: 24,
    textAlign: 'center',
  },
  // Emergency marker styles
  emergencyMarkerContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  emergencyMarkerPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6B6B',
    opacity: 0.4,
  },
  emergencyMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 1,
  },
  emergencyMarkerEmoji: {
    fontSize: 28,
    textAlign: 'center',
  },
});

export default MapScreen;

