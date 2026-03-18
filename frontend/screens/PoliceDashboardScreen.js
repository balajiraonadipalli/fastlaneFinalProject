import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
  Animated,
  Easing,
  Vibration,
  Platform,
  TextInput,
  Modal,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline, Circle, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { API_ENDPOINTS } from '../config/api';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLES } from '../config/mapbox';
import { colors, gradients, spacing, borderRadius, typography, shadows } from '../constants/theme';

// Check if notifications are available and configure handler
let notificationsAvailable = false;

try {
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    notificationsAvailable = true;
    console.log('✅ Notifications configured');
  }
} catch (error) {
  console.log('ℹ️ Notifications not fully available (Expo Go limitation) - using Alert.alert as primary method');
  notificationsAvailable = false;
}

const { width, height } = Dimensions.get('window');
const isSmallDevice = width < 375;
const isTablet = width >= 768;

const PoliceDashboardScreen = ({ route, navigation }) => {
  const { role, userName, policeStation, userId, userEmail } = route?.params || {};
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [newAlertsCount, setNewAlertsCount] = useState(0);
  const [lastAlertCount, setLastAlertCount] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectMessage, setRejectMessage] = useState('');
  const [rejectingAlert, setRejectingAlert] = useState(null);
  const [alertsCleared, setAlertsCleared] = useState(false); // Flag to track if alerts were manually cleared
  const [showNetworkErrorModal, setShowNetworkErrorModal] = useState(false); // Network error modal state
  const alertsClearedRef = useRef(false); // Ref version for immediate access in polling
  const pollingIntervalRef = useRef(null); // Store polling interval so we can clear it
  const dismissedAlertIdsRef = useRef(new Set()); // Track dismissed alert IDs to prevent re-adding
  const locationSubscriptionRef = useRef(null);
  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const markerScaleAnim = useRef(new Animated.Value(1)).current;
  const mapOpacityAnim = useRef(new Animated.Value(0)).current;
  const toggleAnim = useRef(new Animated.Value(0)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const alertsRef = useRef([]);

  // Request notification permissions and set up listeners (only if available)
  useEffect(() => {
    const setupNotifications = async () => {
      if (!Notifications || !Notifications.getPermissionsAsync) {
        console.log('ℹ️ Notifications not available - using Alert.alert for all notifications');
        return;
      }

      try {
        const requestPermissions = async () => {
          try {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
              const { status } = await Notifications.requestPermissionsAsync();
              finalStatus = status;
            }

            if (finalStatus !== 'granted') {
              console.log('ℹ️ Notification permissions not granted - will use Alert.alert instead');
              return false;
            }

            console.log('✅ Notification permissions granted');
            return true;
          } catch (error) {
            console.log('ℹ️ Notification setup error (Expo Go limitation):', error.message);
            console.log('ℹ️ Will use Alert.alert as fallback for notifications');
            return false;
          }
        };

        const hasPermissions = await requestPermissions();

        if (hasPermissions && Notifications.addNotificationReceivedListener) {
          try {
            // Set up notification received listener
            const notificationReceivedListener = Notifications.addNotificationReceivedListener(notification => {
              console.log('📱 Notification received:', notification);
              // Vibrate when notification is received
              try {
                Vibration.vibrate([0, 200, 100, 200]);
              } catch (error) {
                console.warn('Vibration error:', error);
              }
            });

            // Set up notification response listener (when user taps notification)
            const notificationResponseListener = Notifications.addNotificationResponseReceivedListener(response => {
              console.log('👆 Notification tapped:', response);
              const data = response.notification.request.content.data;
              if (data && data.type === 'emergency') {
                // Switch to alerts view when notification is tapped
                setShowMap(false);
              }
            });

            return () => {
              try {
                if (notificationReceivedListener) {
                  Notifications.removeNotificationSubscription(notificationReceivedListener);
                }
                if (notificationResponseListener) {
                  Notifications.removeNotificationSubscription(notificationResponseListener);
                }
              } catch (error) {
                // Ignore cleanup errors
              }
            };
          } catch (error) {
            console.log('ℹ️ Could not set up notification listeners:', error.message);
          }
        }
      } catch (error) {
        console.log('ℹ️ Notification setup failed - using Alert.alert:', error.message);
      }
    };

    setupNotifications();
  }, []);

  // Send local notification (with fallback for Expo Go limitations)
  const sendLocalNotification = async (alert, alertCount) => {
    // Skip if notifications are not available (Expo Go limitation)
    if (!Notifications || !Notifications.scheduleNotificationAsync) {
      console.log('ℹ️ Notifications not available - Alert.alert will be used instead');
      return;
    }

    try {
      // Check if notifications are available
      if (Notifications.getPermissionsAsync) {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          console.log('ℹ️ Notifications not granted, Alert.alert will be used instead');
          return;
        }
      }

      // Get route information for notification
      // Only show route if both addresses are available and valid
      let routeInfo = 'Route information not available';
      if (alert.startAddress && alert.endAddress &&
        alert.startAddress.trim() !== '' && alert.endAddress.trim() !== '' &&
        alert.startAddress.toLowerCase() !== 'unknown' && alert.endAddress.toLowerCase() !== 'unknown') {
        // Truncate long addresses for notification
        const startAddr = alert.startAddress.length > 30
          ? alert.startAddress.substring(0, 30) + '...'
          : alert.startAddress;
        const endAddr = alert.endAddress.length > 30
          ? alert.endAddress.substring(0, 30) + '...'
          : alert.endAddress;
        routeInfo = `${startAddr} → ${endAddr}`;
      } else if (alert.startLocation && alert.endLocation) {
        // Fallback to coordinates if addresses not available
        routeInfo = `From: ${alert.startLocation.latitude?.toFixed(4)}, ${alert.startLocation.longitude?.toFixed(4)} → To: ${alert.endLocation.latitude?.toFixed(4)}, ${alert.endLocation.longitude?.toFixed(4)}`;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 New Emergency Alert!',
          body: `${alertCount} new ambulance ${alertCount > 1 ? 'alerts' : 'alert'}!\n` +
            `Driver: ${alert.driverName || 'Unknown'}\n` +
            `Distance: ${alert.distance ? (typeof alert.distance === 'number' ? `${(alert.distance / 1000).toFixed(2)} km` : alert.distance) : 'Unknown'}\n` +
            `Route: ${routeInfo}`,
          data: { alertId: alert.id, type: 'emergency' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.HIGH || 'high',
        },
        trigger: null, // Show immediately
      });

      console.log('📱 Local notification sent successfully');
    } catch (error) {
      // Log the actual error for debugging
      console.error('❌ Error sending local notification:', error);
      console.log('ℹ️ Will use Alert.alert as fallback');
      // Don't throw error - Alert.alert will be shown instead
    }
  };

  // Fetch alerts from backend
  const fetchAlerts = async (showNotification = true, forceFetch = false) => {
    // Don't fetch if alerts were manually cleared (unless forced) - use ref for immediate check
    if (alertsClearedRef.current && !forceFetch) {
      console.log('⏸️ Alerts were manually cleared. Skipping fetch. Ref value:', alertsClearedRef.current);
      console.log('⏸️ Use refresh to fetch again.');
      return; // Exit immediately, don't proceed
    }

    // Double-check at the very start (defensive programming)
    if (alertsClearedRef.current && !forceFetch) {
      console.log('⏸️ Double-check: Alerts cleared, aborting fetch');
      return;
    }

    try {
      setLoading(true);
      console.log(`🔄 Fetching alerts from: ${API_ENDPOINTS.POLICE_ALERTS}`);
      const response = await fetch(API_ENDPOINTS.POLICE_ALERTS);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📦 Backend response:`, { success: data.success, count: data.count, alertsLength: data.alerts?.length });

      if (data.success) {
        let newAlerts = data.alerts || [];
        const previousAlerts = alertsRef.current || [];

        // CRITICAL: Filter out dismissed alerts (even if backend has them)
        const dismissedIds = dismissedAlertIdsRef.current;
        if (dismissedIds.size > 0) {
          const beforeFilter = newAlerts.length;
          newAlerts = newAlerts.filter(alert => !dismissedIds.has(alert.id));
          const afterFilter = newAlerts.length;
          if (beforeFilter !== afterFilter) {
            console.log(`🚫 Filtered out ${beforeFilter - afterFilter} dismissed alerts. Remaining: ${afterFilter}`);
          }
        }

        // Sort alerts by timestamp (newest first) - ensures latest alerts appear at the top
        newAlerts.sort((a, b) => {
          const timeA = new Date(a.timestamp || a.createdAt || 0);
          const timeB = new Date(b.timestamp || b.createdAt || 0);
          return timeB - timeA; // Descending order (newest first)
        });

        console.log(`📊 Alert comparison:`, {
          newAlerts: newAlerts.length,
          previousAlerts: previousAlerts.length,
          dismissedCount: dismissedIds.size,
          newAlertIds: newAlerts.map(a => a.id),
          previousAlertIds: previousAlerts.map(a => a.id)
        });

        // Detect new alerts by comparing IDs
        // Only notify if we have previous alerts to compare against (prevents notifying on first load)
        if (showNotification && previousAlerts.length > 0) {
          const newAlertIds = newAlerts.map(a => a.id);
          const previousAlertIds = previousAlerts.map(a => a.id);
          const actuallyNewAlerts = newAlerts.filter(a => !previousAlertIds.includes(a.id));

          console.log(`🔍 New alerts detected: ${actuallyNewAlerts.length}`, actuallyNewAlerts.map(a => ({ id: a.id, driver: a.driverName })));

          if (actuallyNewAlerts.length > 0) {
            // Show notification for new alerts
            const newAlert = actuallyNewAlerts[0];
            const alertCount = actuallyNewAlerts.length;

            console.log(`🔔 Processing ${alertCount} new alert(s)`, actuallyNewAlerts.map(a => a.id));

            // Vibrate device
            try {
              if (Platform.OS === 'ios' || Platform.OS === 'android') {
                Vibration.vibrate([0, 200, 100, 200]);
                console.log('📳 Device vibrated');
              }
            } catch (vibError) {
              console.warn('Vibration error:', vibError);
            }

            // Send local notification (works even when app is in background)
            try {
              await sendLocalNotification(newAlert, alertCount);
              console.log('📱 Local notification sent');
            } catch (notifError) {
              console.error('Notification error:', notifError);
            }

            // Show in-app alert (only if app is in foreground)
            Alert.alert(
              '🚨 New Emergency Alert!',
              `${alertCount} new ambulance ${alertCount > 1 ? 'alerts' : 'alert'} received!\n\n` +
              `Driver: ${newAlert.driverName || 'Unknown'}\n` +
              `Distance: ${newAlert.distance ? (typeof newAlert.distance === 'number' ? `${(newAlert.distance / 1000).toFixed(2)} km` : newAlert.distance) : 'Unknown'}\n` +
              `Route: ${newAlert.startAddress || 'Unknown'} → ${newAlert.endAddress || 'Unknown'}`,
              [
                { text: 'View Alerts', onPress: () => setShowMap(false) },
                { text: 'OK', style: 'cancel' }
              ],
              { cancelable: true }
            );

            // Animate badge
            Animated.sequence([
              Animated.timing(badgeAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(badgeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start();

            setNewAlertsCount(alertCount);
            console.log(`✅ Notification sent for ${alertCount} new alert(s)`);
          } else {
            console.log('ℹ️ No new alerts detected');
          }
        }

        // CRITICAL: Check ref BEFORE updating state
        // Even with forceFetch, we need to respect if alerts were cleared
        // However, if forceFetch is true (user pulled to refresh), they want alerts back
        // So we only block if alerts are cleared AND it's not a forced refresh
        if (alertsClearedRef.current && !forceFetch) {
          console.log('⏸️ Alerts were cleared. Ref value:', alertsClearedRef.current);
          console.log('⏸️ NOT updating state with backend data. Backend has', newAlerts.length, 'alerts but they are ignored.');
          console.log('⏸️ forceFetch:', forceFetch, '- State update blocked');
          return; // Exit early, don't update anything
        }

        // If forceFetch is true, user explicitly refreshed - they want alerts back
        // So we allow the update and reset the cleared flag
        if (forceFetch && alertsClearedRef.current) {
          console.log('🔄 User pulled to refresh - allowing alerts to be fetched again');
          alertsClearedRef.current = false; // Reset since user explicitly wants alerts
          setAlertsCleared(false);
        }

        // Safe to update alerts
        console.log('✅ Updating alerts state. Ref cleared:', alertsClearedRef.current, 'forceFetch:', forceFetch);
        setAlerts(newAlerts);
        alertsRef.current = newAlerts;
        setLastAlertCount(newAlerts.length);
        console.log(`✅ Fetched ${newAlerts.length} police alerts (previous: ${previousAlerts.length})`);
      } else {
        console.error('❌ Failed to fetch alerts:', data.message);
        // Only clear alerts on error if they weren't manually cleared
        if (!alertsClearedRef.current) {
          setAlerts([]);
          alertsRef.current = [];
        }
      }
    } catch (error) {
      console.error('❌ Error fetching alerts:', error);
      console.error('Error details:', error.message, error.stack);

      // Check if it's a network error
      const isNetworkError = error.message?.includes('Network request failed') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('timeout') ||
        error.name === 'TypeError' && error.message?.includes('fetch');

      if (isNetworkError) {
        // Show network error modal
        setShowNetworkErrorModal(true);
      }

      // Only clear alerts on error if they weren't manually cleared
      if (!alertsClearedRef.current) {
        setAlerts([]);
        alertsRef.current = [];
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Update police location on backend
  const updatePoliceLocation = async (location) => {
    if (!userId && !userEmail) {
      console.log('⚠️ No userId or email available, skipping location update');
      return;
    }

    try {
      const requestBody = {
        location: {
          latitude: location.latitude,
          longitude: location.longitude
        }
      };

      // Use userId if available, otherwise use email
      if (userId) {
        requestBody.userId = userId;
      } else if (userEmail) {
        requestBody.email = userEmail;
      }

      const response = await fetch(API_ENDPOINTS.POLICE_UPDATE_LOCATION, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (data.success) {
        console.log(`📍 Police location updated: (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`);
      } else {
        console.error('❌ Failed to update police location:', data.message);
        console.error('Request body:', { userId, userEmail });
        // If user not found, try to create or update user location differently
        if (data.message && data.message.includes('not found')) {
          console.warn('⚠️ Police user not found in database. Make sure you are registered.');
        }
      }
    } catch (error) {
      console.error('❌ Error updating police location:', error);
      console.error('Request body:', { userId, userEmail });

      // Check if it's a network error
      const isNetworkError = error.message?.includes('Network request failed') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('timeout') ||
        error.name === 'TypeError' && error.message?.includes('fetch');

      if (isNetworkError) {
        // Show network error modal
        setShowNetworkErrorModal(true);
      }
    }
  };

  // Start location tracking for police
  useEffect(() => {
    const startLocationTracking = async () => {
      try {
        // Request permissions
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus !== 'granted') {
            console.log('⚠️ Location permission denied');
            return;
          }
        }

        // Get initial location
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (initialLocation) {
          const location = {
            latitude: initialLocation.coords.latitude,
            longitude: initialLocation.coords.longitude
          };
          setCurrentLocation(location);
          await updatePoliceLocation(location);

          // Center map on current location
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }, 1000);
          }
        }

        // Start watching position
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, // Update every 10 seconds
            distanceInterval: 50, // Or every 50 meters
          },
          async (newLocation) => {
            const location = {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude
            };
            setCurrentLocation(location);
            await updatePoliceLocation(location);

            // Update map if visible
            if (mapRef.current && showMap) {
              mapRef.current.animateToRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 1000);
            }
          }
        );

        console.log('✅ Police location tracking started');
      } catch (error) {
        console.error('Error starting location tracking:', error);
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscriptionRef.current) {
        try {
          if (typeof locationSubscriptionRef.current.remove === 'function') {
            locationSubscriptionRef.current.remove();
            console.log('✅ Police location subscription removed');
          }
        } catch (error) {
          console.error('Error removing location subscription:', error);
        }
      }
    };
  }, [userId, userEmail]);

  // Pulse animation for police marker
  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, []);

  // Marker scale animation when alerts change
  useEffect(() => {
    if (alerts.length > 0) {
      Animated.sequence([
        Animated.timing(markerScaleAnim, {
          toValue: 1.2,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(markerScaleAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [alerts.length]);

  // Map fade-in animation
  useEffect(() => {
    if (showMap) {
      Animated.timing(mapOpacityAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      mapOpacityAnim.setValue(0);
    }
  }, [showMap]);

  // Toggle button animation
  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: showMap ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [showMap]);

  // Initial fetch and set up polling
  useEffect(() => {
    // Initial fetch without notification
    fetchAlerts(false);

    // Poll for new alerts every 3 seconds (faster for better responsiveness)
    const interval = setInterval(() => {
      // CRITICAL: Check ref before calling fetchAlerts
      // If alerts were cleared, completely skip the fetch
      if (alertsClearedRef.current) {
        console.log('⏸️ Polling skipped - alerts were cleared. Ref:', alertsClearedRef.current);
        return; // Exit early, don't call fetchAlerts at all
      }

      // Only fetch if alerts haven't been cleared
      console.log('🔄 Polling: Fetching alerts (ref cleared:', alertsClearedRef.current, ')');
      fetchAlerts(true); // Show notifications for new alerts
    }, 3000);

    pollingIntervalRef.current = interval; // Store interval reference
    console.log('✅ Polling interval started. Interval ID stored in ref.');

    return () => {
      if (interval) clearInterval(interval);
      pollingIntervalRef.current = null;
    };
  }, []);

  // Reset new alerts count when user views alerts
  useEffect(() => {
    if (!showMap && newAlertsCount > 0) {
      // User switched to alerts view, reset count after a delay
      setTimeout(() => {
        setNewAlertsCount(0);
      }, 2000);
    }
  }, [showMap, newAlertsCount]);

  // Handle refresh
  const onRefresh = () => {
    setRefreshing(true);

    // Check if alerts were previously cleared
    const wasCleared = alertsClearedRef.current;

    // If user refreshes, they want to see alerts again
    // But we keep the dismissed list so old alerts don't come back
    if (wasCleared) {
      console.log('🔄 User pulled to refresh after clearing - resetting cleared flag but keeping dismissed list');
      console.log(`🚫 Will filter out ${dismissedAlertIdsRef.current.size} previously dismissed alerts`);
    }

    // Reset flags - user explicitly wants to refresh
    setAlertsCleared(false); // Reset state flag
    alertsClearedRef.current = false; // Reset ref flag - user wants to fetch again
    // NOTE: We do NOT clear dismissedAlertIdsRef - dismissed alerts stay dismissed

    // Restart polling if it was stopped
    if (!pollingIntervalRef.current) {
      const interval = setInterval(() => {
        // Check ref before calling fetchAlerts
        if (!alertsClearedRef.current) {
          fetchAlerts(true); // Show notifications for new alerts
        } else {
          console.log('⏸️ Polling skipped - alerts were cleared');
        }
      }, 3000);
      pollingIntervalRef.current = interval;
      console.log('🔄 Polling restarted');
    }

    // Force fetch on refresh - but check one more time before updating state
    fetchAlerts(true, true); // Force fetch on refresh
  };

  // Create dummy test alert at current location
  const createDummyAlert = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'Please wait for location to be available');
      return;
    }

    try {
      // Create a test route from current location to a nearby destination (2km away)
      const destinationOffset = 0.02; // ~2km
      const testStartLocation = {
        latitude: currentLocation.latitude - destinationOffset * 0.5,
        longitude: currentLocation.longitude - destinationOffset * 0.5
      };
      const testEndLocation = {
        latitude: currentLocation.latitude + destinationOffset * 0.5,
        longitude: currentLocation.longitude + destinationOffset * 0.5
      };

      // Create simple route coordinates (straight line for testing)
      const testRouteCoords = [];
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        testRouteCoords.push({
          latitude: testStartLocation.latitude + (testEndLocation.latitude - testStartLocation.latitude) * (i / steps),
          longitude: testStartLocation.longitude + (testEndLocation.longitude - testStartLocation.longitude) * (i / steps)
        });
      }

      const dummyAlertData = {
        policeId: userId || 'test-police-001',
        policeName: policeStation?.name || 'Test Police Station',
        area: 'Test Area',
        ambulanceRole: 'ambulance',
        driverName: 'Test Ambulance Driver',
        distance: 500, // 500 meters
        location: currentLocation, // Alert at police's current location
        route: 'Test Emergency Route',
        routeCoordinates: testRouteCoords,
        startLocation: testStartLocation,
        endLocation: testEndLocation,
        startAddress: 'Test Source Location',
        endAddress: 'Test Destination Location',
        timestamp: new Date().toISOString(),
        forAllPolice: true
      };

      console.log('🧪 Creating dummy alert:', dummyAlertData);

      // Send to backend
      const response = await fetch(API_ENDPOINTS.POLICE_ALERT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dummyAlertData)
      });

      const data = await response.json();
      if (data.success) {
        Alert.alert('Success', 'Dummy test alert created successfully!');
        // Refresh alerts to show the new one
        fetchAlerts(false);
      } else {
        Alert.alert('Error', data.message || 'Failed to create dummy alert');
      }
    } catch (error) {
      console.error('Error creating dummy alert:', error);
      Alert.alert('Error', 'Failed to create dummy alert. Please try again.');
    }
  };

  // Show alert route on map
  const handleShowOnMap = (alert) => {
    setSelectedAlert(alert);
    setShowMap(true);

    // Show ambulance route: Source (current location) → Destination
    // This helps police understand the route the ambulance is traveling
    if (mapRef.current) {
      // Collect all points to show: ambulance current location, source, destination
      const allPoints = [];

      // Add ambulance's current location (if available)
      if (alert.location && alert.location.latitude && alert.location.longitude) {
        allPoints.push(alert.location);
      }

      // Add source location (start point)
      if (alert.startLocation && alert.startLocation.latitude && alert.startLocation.longitude) {
        allPoints.push(alert.startLocation);
      }

      // Add destination location (end point)
      if (alert.endLocation && alert.endLocation.latitude && alert.endLocation.longitude) {
        allPoints.push(alert.endLocation);
      }

      if (allPoints.length > 0) {
        // Calculate bounds to show all points
        const lats = allPoints.map(p => p.latitude);
        const lngs = allPoints.map(p => p.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        // Calculate center and deltas with padding
        const midLat = (minLat + maxLat) / 2;
        const midLng = (minLng + maxLng) / 2;
        const latDelta = Math.max((maxLat - minLat) * 1.8, 0.02); // Add 80% padding
        const lngDelta = Math.max((maxLng - minLng) * 1.8, 0.02); // Add 80% padding

        // Animate to show the complete route
        mapRef.current.animateToRegion({
          latitude: midLat,
          longitude: midLng,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        }, 1000);

        console.log('🗺️ Showing ambulance route on map:', {
          ambulanceLocation: alert.location ? 'Yes' : 'No',
          source: alert.startLocation ? 'Yes' : 'No',
          destination: alert.endLocation ? 'Yes' : 'No',
          routePoints: alert.routeCoordinates?.length || 0,
          bounds: { minLat, maxLat, minLng, maxLng }
        });
      } else {
        // Fallback: Center on ambulance location if no route points available
        if (alert.location && alert.location.latitude && alert.location.longitude) {
          mapRef.current.animateToRegion({
            latitude: alert.location.latitude,
            longitude: alert.location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 1000);
        }
      }
    }
  };

  // Handle accept alert
  const handleAccept = async (alert) => {
    console.log('\n🚔 ===== POLICE DASHBOARD: ACCEPT ROUTE REQUESTED =====');
    console.log('📋 Alert Details:', {
      alertId: alert.id,
      driverName: alert.driverName,
      policeName: alert.policeName || policeStation,
      startAddress: alert.startAddress,
      endAddress: alert.endAddress,
      timestamp: alert.timestamp || alert.createdAt
    });

    Alert.alert(
      'Accept Route',
      'Confirm that this route is acceptable for the ambulance?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            console.log('❌ POLICE: User cancelled accept action');
            console.log('===== END POLICE ACCEPT REQUEST =====\n');
          }
        },
        {
          text: 'Accept',
          onPress: async () => {
            console.log('\n✅ POLICE: User confirmed ACCEPT action');
            console.log('📤 POLICE: Preparing to send acceptance to backend...');
            console.log('  - Alert ID:', alert.id);
            console.log('  - Traffic Status: accepted');
            console.log('  - Police Officer:', userName || 'Police Officer');
            console.log('  - Police Station:', alert.policeName || policeStation);
            console.log('  - Driver Name:', alert.driverName);

            try {
              const requestBody = {
                alertId: alert.id,
                trafficStatus: 'accepted',
                message: 'Route approved. You can proceed.',
                policeOfficer: userName || 'Police Officer'
              };

              console.log('📤 POLICE: Sending POST request to:', API_ENDPOINTS.POLICE_RESPONSE);
              console.log('📤 POLICE: Request body:', JSON.stringify(requestBody, null, 2));

              const response = await fetch(API_ENDPOINTS.POLICE_RESPONSE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
              });

              console.log('📥 POLICE: Received response from backend');
              console.log('  - Status:', response.status);
              console.log('  - Status Text:', response.statusText);

              const data = await response.json();
              console.log('📥 POLICE: Response data:', JSON.stringify(data, null, 2));

              if (data.success) {
                console.log('✅ POLICE: Backend confirmed success!');
                console.log('✅ POLICE: Alert updated in backend:', {
                  alertId: data.alert?.id,
                  status: data.alert?.status,
                  trafficStatus: data.alert?.trafficStatus,
                  policeResponse: data.alert?.policeResponse,
                  respondedAt: data.alert?.respondedAt
                });
                console.log('✅ POLICE: Ambulance should receive notification via:');
                console.log('  1. WebSocket (if connected)');
                console.log('  2. Polling (ambulance polls every 2 seconds)');
                console.log('===== POLICE ACCEPT COMPLETED SUCCESSFULLY =====\n');

                // Immediately update the local alert state with the response data
                if (data.alert) {
                  setAlerts(prevAlerts => {
                    const updatedAlerts = prevAlerts.map(a => {
                      if (a.id === data.alert.id || a.id === parseInt(data.alert.id)) {
                        return {
                          ...a,
                          status: data.alert.status || 'acknowledged',
                          trafficStatus: data.alert.trafficStatus || 'accepted',
                          policeResponse: data.alert.policeResponse || 'Route approved. You can proceed.',
                          policeOfficer: data.alert.policeOfficer || userName || 'Police Officer',
                          respondedAt: data.alert.respondedAt || new Date().toISOString(),
                          acknowledgedAt: data.alert.acknowledgedAt || data.alert.respondedAt || new Date().toISOString()
                        };
                      }
                      return a;
                    });
                    alertsRef.current = updatedAlerts;
                    return updatedAlerts;
                  });
                  console.log('✅ POLICE: Local alert state updated immediately with response');
                }

                Alert.alert('Success', 'Route accepted. Ambulance has been notified.');
                // Refresh alerts to ensure everything is in sync
                setTimeout(() => {
                  fetchAlerts(false);
                }, 500);
              } else {
                console.error('❌ POLICE: Backend returned error:', data.message);
                console.log('===== POLICE ACCEPT FAILED =====\n');
                Alert.alert('Error', data.message || 'Failed to send response');
              }
            } catch (error) {
              console.error('❌ POLICE: Error sending response:', error);
              console.error('  - Error message:', error.message);
              console.error('  - Error stack:', error.stack);
              console.log('===== POLICE ACCEPT ERROR =====\n');

              // Check if it's a network error
              const isNetworkError = error.message?.includes('Network request failed') ||
                error.message?.includes('Failed to fetch') ||
                error.message?.includes('NetworkError') ||
                error.message?.includes('timeout') ||
                error.name === 'TypeError' && error.message?.includes('fetch');

              if (isNetworkError) {
                setShowNetworkErrorModal(true);
              } else {
                Alert.alert('Error', 'Failed to send response. Please try again.');
              }
            }
          }
        }
      ]
    );
  };

  // Handle reject alert - show modal for message input
  const handleReject = (alert) => {
    setRejectingAlert(alert);
    setRejectMessage('Take another way, not this way');
    setShowRejectModal(true);
  };

  // Submit rejection with custom message
  const handleSubmitRejection = async () => {
    if (!rejectingAlert) return;

    if (!rejectMessage.trim()) {
      Alert.alert('Error', 'Please enter a rejection message');
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.POLICE_RESPONSE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId: rejectingAlert.id,
          trafficStatus: 'rejected',
          message: rejectMessage.trim(),
          policeOfficer: userName || 'Police Officer'
        })
      });

      const data = await response.json();
      if (data.success) {
        // Immediately update the local alert state with the response data
        if (data.alert) {
          setAlerts(prevAlerts => {
            const updatedAlerts = prevAlerts.map(a => {
              if (a.id === data.alert.id || a.id === parseInt(data.alert.id)) {
                return {
                  ...a,
                  status: data.alert.status || 'acknowledged',
                  trafficStatus: data.alert.trafficStatus || 'rejected',
                  policeResponse: data.alert.policeResponse || rejectMessage.trim(),
                  policeOfficer: data.alert.policeOfficer || userName || 'Police Officer',
                  respondedAt: data.alert.respondedAt || new Date().toISOString(),
                  acknowledgedAt: data.alert.acknowledgedAt || data.alert.respondedAt || new Date().toISOString()
                };
              }
              return a;
            });
            alertsRef.current = updatedAlerts;
            return updatedAlerts;
          });
          console.log('✅ POLICE: Local alert state updated immediately with rejection response');
        }

        Alert.alert('Success', 'Rejection message sent to ambulance driver');
        setShowRejectModal(false);
        setRejectMessage('');
        setRejectingAlert(null);
        // Refresh alerts to ensure everything is in sync
        setTimeout(() => {
          fetchAlerts(false);
        }, 500);
      } else {
        Alert.alert('Error', data.message || 'Failed to send response');
      }
    } catch (error) {
      console.error('Error sending rejection:', error);

      // Check if it's a network error
      const isNetworkError = error.message?.includes('Network request failed') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('timeout') ||
        error.name === 'TypeError' && error.message?.includes('fetch');

      if (isNetworkError) {
        setShowNetworkErrorModal(true);
      } else {
        Alert.alert('Error', 'Failed to send rejection. Please try again.');
      }
    }
  };

  // Handle logout
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop location tracking
              if (locationSubscriptionRef.current) {
                try {
                  if (typeof locationSubscriptionRef.current.remove === 'function') {
                    locationSubscriptionRef.current.remove();
                    locationSubscriptionRef.current = null;
                    console.log('✅ Police location subscription removed');
                  }
                } catch (error) {
                  console.error('Error removing location subscription:', error);
                }
              }

              // Clear all authentication data from AsyncStorage
              await AsyncStorage.multiRemove([
                'authToken',
                'userRole',
                'userName',
                'userEmail',
                'userId'
              ]);
              console.log('✅ Authentication data cleared from AsyncStorage');

              // Navigate to Home screen
              try {
                navigation.replace('Home');
              } catch (error) {
                try {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Home' }],
                  });
                } catch (resetError) {
                  navigation.navigate('Home');
                }
              }
            } catch (error) {
              console.error('Error during logout:', error);
              // Still try to navigate even if clearing storage fails
              try {
                navigation.replace('Home');
              } catch (navError) {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Home' }],
                });
              }
            }
          }
        }
      ]
    );
  };

  // Format time
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Calculate time ago
  const getTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  // Handle clear alerts
  const handleClearAlerts = () => {
    if (alerts.length === 0) {
      Alert.alert('No Alerts', 'There are no alerts to clear.');
      return;
    }

    Alert.alert(
      'Clear All Alerts',
      `Are you sure you want to clear all ${alerts.length} alert(s) from the backend? This will remove alerts for EVERYONE.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Call Backend to clear alerts
              console.log('🗑️ Requesting backend to clear all alerts...');
              const response = await fetch(API_ENDPOINTS.POLICE_ALERTS_CLEAR, {
                method: 'DELETE',
              });

              const data = await response.json();

              if (response.ok && data.success) {
                // 2. If backend success, clear local state
                console.log('✅ Backend confirmed alerts cleared:', data.message);

                // Update Refs
                const currentAlertIds = alerts.map(a => a.id).filter(id => id != null);
                currentAlertIds.forEach(id => {
                  dismissedAlertIdsRef.current.add(id);
                });

                alertsClearedRef.current = true;
                setAlertsCleared(true);

                // Stop polling (optional, but good for "cleared" state)
                // if (pollingIntervalRef.current) {
                //   clearInterval(pollingIntervalRef.current);
                //   pollingIntervalRef.current = null;
                // } 
                // actually, keeping polling might be better to see if new alerts come in, 
                // but for now let's stick to existing logic or maybe allow polling to continue 
                // so if NEW alerts come, they show up. 
                // The user said "clear all alerts... so it will update". 
                // If we stop polling, we won't see new ones. 
                // Let's NOT stop polling, but just clear the current list.

                // Clear local state
                setAlerts([]);
                alertsRef.current = [];
                setNewAlertsCount(0);
                setLastAlertCount(0);
                setSelectedAlert(null);

                Alert.alert('Success', 'All alerts have been cleared from backend and frontend.');
              } else {
                throw new Error(data.message || 'Failed to clear alerts on backend');
              }
            } catch (error) {
              console.error('❌ Error clearing alerts:', error);
              Alert.alert('Error', 'Failed to clear alerts from backend. Please check connection.');
            }
          }
        }
      ]
    );
  };

  return (
    <LinearGradient
      colors={['#1E3A5F', '#2E86AB', '#4A90E2']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Header */}
      <LinearGradient
        colors={['rgba(30, 58, 95, 0.95)', 'rgba(46, 134, 171, 0.9)', 'rgba(74, 144, 226, 0.85)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Top Row - Welcome Section */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerContent}>
            <View style={styles.headerEmojiContainer}>
              <Text style={styles.headerEmoji}>🚔</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Welcome, {userName || 'Officer'}</Text>
              <Text style={styles.headerSubtitle}>
                {policeStation?.name || 'Traffic Police Station'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['rgba(231, 76, 60, 0.8)', 'rgba(192, 57, 43, 0.9)']}
              style={styles.logoutButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.logoutText}>{isSmallDevice ? '🚪' : '🚪 Logout'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Bottom Row - Test Alert and Clear Alerts Buttons */}
        <View style={styles.headerBottomRow}>
          <TouchableOpacity
            style={styles.testAlertButton}
            onPress={createDummyAlert}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['rgba(155, 89, 182, 0.8)', 'rgba(142, 68, 173, 0.9)']}
              style={styles.testAlertButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.testAlertButtonText}>🧪 Create Test Alert</Text>
            </LinearGradient>
          </TouchableOpacity>

          {alerts.length > 0 && (
            <TouchableOpacity
              style={styles.clearAlertsButton}
              onPress={handleClearAlerts}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(149, 165, 166, 0.8)', 'rgba(127, 140, 141, 0.9)']}
                style={styles.clearAlertsButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.clearAlertsButtonText}>
                  {isSmallDevice ? '🗑️' : '🗑️ Clear Alerts'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <View style={styles.statItemContainer}>
            <Text style={styles.statNumber}>{alerts.length}</Text>
            {newAlertsCount > 0 && (
              <Animated.View
                style={[
                  styles.newAlertBadge,
                  {
                    transform: [{
                      scale: badgeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.2],
                      }),
                    }],
                    opacity: badgeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.7],
                    }),
                  },
                ]}
              >
                <Text style={styles.newAlertBadgeText}>{newAlertsCount}</Text>
              </Animated.View>
            )}
          </View>
          <Text style={styles.statLabel}>Active Alerts</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {alerts.filter(a => a.status === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {alerts.filter(a => a.status === 'responded').length}
          </Text>
          <Text style={styles.statLabel}>Responded</Text>
        </View>
      </View>

      {/* Toggle between Map and List */}
      <Animated.View
        style={[
          styles.toggleContainer,
          {
            transform: [{
              scale: toggleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.95, 1],
              }),
            }],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.toggleButton, !showMap && styles.toggleButtonActive]}
          onPress={() => setShowMap(false)}
          activeOpacity={0.7}
        >
          <Animated.Text
            style={[
              styles.toggleButtonText,
              !showMap && styles.toggleButtonTextActive,
              {
                transform: [{
                  scale: !showMap ? 1.05 : 1,
                }],
              },
            ]}
          >
            📋 Alerts
          </Animated.Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, showMap && styles.toggleButtonActive]}
          onPress={() => setShowMap(true)}
          activeOpacity={0.7}
        >
          <Animated.Text
            style={[
              styles.toggleButtonText,
              showMap && styles.toggleButtonTextActive,
              {
                transform: [{
                  scale: showMap ? 1.05 : 1,
                }],
              },
            ]}
          >
            🗺️ Map
          </Animated.Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Map View */}
      {showMap ? (
        <Animated.View
          style={[
            styles.mapContainer,
            {
              opacity: mapOpacityAnim,
              transform: [{
                scale: mapOpacityAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1],
                }),
              }],
            },
          ]}
        >
          {currentLocation ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              customMapStyle={[
                {
                  elementType: 'geometry',
                  stylers: [{ color: '#242f3e' }],
                },
                {
                  elementType: 'labels.text.stroke',
                  stylers: [{ color: '#242f3e' }],
                },
                {
                  elementType: 'labels.text.fill',
                  stylers: [{ color: '#746855' }],
                },
                {
                  featureType: 'road',
                  elementType: 'geometry',
                  stylers: [{ color: '#38414e' }],
                },
                {
                  featureType: 'road',
                  elementType: 'geometry.stroke',
                  stylers: [{ color: '#212a37' }],
                },
                {
                  featureType: 'road',
                  elementType: 'labels.text.fill',
                  stylers: [{ color: '#9ca5b3' }],
                },
                {
                  featureType: 'water',
                  elementType: 'geometry',
                  stylers: [{ color: '#17263c' }],
                },
              ]}
              initialRegion={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              showsUserLocation={true}
              showsMyLocationButton={true}
              showsTraffic={false}
              mapType="standard"
            >
              {/* Police officer marker with pulse animation */}
              <Marker
                coordinate={{
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude,
                }}
                title="Your Location"
                description={`${userName || 'Police Officer'}`}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <Animated.View
                  style={[
                    styles.policeMarkerContainer,
                    {
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <View style={styles.policeMarkerPulse} />
                  <View style={styles.policeMarker}>
                    <Text style={styles.policeMarkerEmoji}>🚔</Text>
                  </View>
                </Animated.View>
              </Marker>

              {/* Ambulance markers from alerts - Group by driverName to show only one circle per ambulance */}
              {/* Ambulance locations from alerts */}
              {/* Route Polylines - Draw these first so they are under markers */}
              {alerts.map((alert) => {
                if (selectedAlert?.id !== alert.id) return null; // Only show route for selected alert

                // 1. Draw Polyline if routeCoordinates exist
                if (alert.routeCoordinates && Array.isArray(alert.routeCoordinates) && alert.routeCoordinates.length >= 2) {
                  return (
                    <Polyline
                      key={`route-${alert.id}`}
                      coordinates={alert.routeCoordinates}
                      strokeColor="#E74C3C"
                      strokeWidth={6}
                      lineDashPattern={[15, 10]}
                      lineCap="round"
                      lineJoin="round"
                      zIndex={100}
                    />
                  );
                }
                // 2. Fallback: Straight line if only start/end exist
                if (alert.startLocation && alert.endLocation) {
                  return (
                    <Polyline
                      key={`route-straight-${alert.id}`}
                      coordinates={[alert.startLocation, alert.endLocation]}
                      strokeColor="#E74C3C"
                      strokeWidth={4}
                      lineDashPattern={[10, 5]}
                      zIndex={100}
                    />
                  );
                }
                return null;
              })}

              {/* Ambulance Markers & Radius */}
              {alerts.map((alert) => {
                if (!alert.location || !alert.location.latitude || !alert.location.longitude) return null;

                const roundedLat = Math.round(alert.location.latitude * 100000) / 100000;
                const roundedLng = Math.round(alert.location.longitude * 100000) / 100000;

                return (
                  <React.Fragment key={`ambulance-group-${alert.id}`}>
                    {/* Radius Circle */}
                    <Circle
                      center={{
                        latitude: roundedLat,
                        longitude: roundedLng,
                      }}
                      radius={1000} // 1 km radius
                      fillColor="rgba(231, 76, 60, 0.2)"
                      strokeColor="rgba(231, 76, 60, 0.5)"
                      strokeWidth={2}
                      zIndex={1}
                    />

                    {/* Ambulance Marker with Image */}
                    <Marker
                      key={`ambulance-${alert.id}-${alert.location.latitude}`}
                      coordinate={{
                        latitude: alert.location.latitude,
                        longitude: alert.location.longitude,
                      }}
                      title={`Ambulance: ${alert.driverName || 'Unknown'}`}
                      description={`Distance: ${(alert.distance ? (alert.distance / 1000).toFixed(2) : '0')} km`}
                      anchor={{ x: 0.5, y: 0.5 }}
                      zIndex={999}
                      tracksViewChanges={true}
                      onPress={() => handleShowOnMap(alert)} // Ensure selecting marker triggers selection
                    >
                      <Image
                        source={require('../assets/ambulancepng.png')}
                        style={{ width: 50, height: 50, resizeMode: 'contain' }}
                      />

                      <Callout tooltip>
                        <View style={styles.markerCallout}>
                          <Text style={styles.markerCalloutText}>{alert.driverName || 'Ambulance'}</Text>
                        </View>
                      </Callout>
                    </Marker>
                  </React.Fragment>
                );
              })}

              {/* Source and Destination markers for selected alert - Always show when alert is selected */}
              {
                selectedAlert && selectedAlert.startLocation && (
                  <Marker
                    coordinate={{
                      latitude: selectedAlert.startLocation.latitude,
                      longitude: selectedAlert.startLocation.longitude,
                    }}
                    title="📍 Source (Ambulance Starting Point)"
                    description={String(selectedAlert.startAddress || 'Ambulance Starting Location')}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                    zIndex={200}
                  >
                    <View style={styles.sourceMarker}>
                      <Text style={styles.sourceMarkerText}>📍</Text>
                    </View>
                  </Marker>
                )
              }

              {
                selectedAlert && selectedAlert.endLocation && (
                  <Marker
                    coordinate={{
                      latitude: selectedAlert.endLocation.latitude,
                      longitude: selectedAlert.endLocation.longitude,
                    }}
                    title="🎯 Destination (Ambulance Destination)"
                    description={String(selectedAlert.endAddress || 'Ambulance Destination')}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                    zIndex={200}
                  >
                    <View style={styles.destinationMarker}>
                      <Text style={styles.destinationMarkerText}>🎯</Text>
                    </View>
                  </Marker>
                )
              }
            </MapView>
          ) : (
            <Animated.View
              style={[
                styles.mapPlaceholder,
                {
                  opacity: mapOpacityAnim,
                },
              ]}
            >
              <Text style={styles.mapPlaceholderText}>📍 Getting your location...</Text>
            </Animated.View>
          )}
        </Animated.View>
      ) : (
        <ScrollView
          style={styles.alertsContainer}
          contentContainerStyle={styles.alertsContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loading && alerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Loading alerts...</Text>
            </View>
          ) : alerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyText}>No active alerts</Text>
              <Text style={styles.emptySubtext}>
                You will be notified when an ambulance enters your area
              </Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <View key={String(alert.id || alert.timestamp || Math.random())} style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <View style={styles.alertHeaderLeft}>
                    <Text style={styles.alertEmoji}>🚑</Text>
                    <View>
                      <Text style={styles.alertDriver}>
                        Driver: {alert.driverName || 'Unknown'}
                      </Text>
                      <Text style={styles.alertTime}>
                        {formatTime(alert.timestamp)} • {getTimeAgo(alert.timestamp)}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    alert.status === 'pending' ? styles.statusPending :
                      alert.status === 'responded' ? styles.statusResponded :
                        styles.statusCleared
                  ]}>
                    <Text style={styles.statusText}>
                      {alert.status === 'pending' ? 'PENDING' :
                        alert.status === 'responded' ? 'RESPONDED' : 'CLEARED'}
                    </Text>
                  </View>
                </View>

                <View style={styles.alertBody}>
                  {/* Show route addresses if available, otherwise show coordinates */}
                  {(() => {
                    console.log(`DEBUG: Rendering alert ${alert.id} - Start: '${alert.startAddress}' End: '${alert.endAddress}'`);
                    const hasValidAddresses = alert.startAddress && alert.endAddress &&
                      alert.startAddress.trim() !== '' && alert.endAddress.trim() !== '' &&
                      alert.startAddress.toLowerCase() !== 'unknown' && alert.endAddress.toLowerCase() !== 'unknown';

                    if (hasValidAddresses) {
                      return (
                        <View style={styles.routeInfo}>
                          <Text style={styles.routeLabel}>Route:</Text>
                          <Text style={styles.routeText}>
                            {alert.startAddress} → {alert.endAddress}
                          </Text>
                        </View>
                      );
                    } else if (alert.startLocation || alert.endLocation) {
                      return (
                        <View style={styles.routeInfo}>
                          <Text style={styles.routeLabel}>Route (Coordinates):</Text>
                          {alert.startLocation && (
                            <Text style={styles.routeText}>
                              📍 From: {alert.startLocation.latitude.toFixed(6)}, {alert.startLocation.longitude.toFixed(6)}
                            </Text>
                          )}
                          {alert.endLocation && (
                            <Text style={styles.routeText}>
                              🎯 To: {alert.endLocation.latitude.toFixed(6)}, {alert.endLocation.longitude.toFixed(6)}
                            </Text>
                          )}
                        </View>
                      );
                    } else {
                      return (
                        <View style={styles.routeInfo}>
                          <Text style={styles.routeLabel}>Route:</Text>
                          <Text style={styles.routeText}>Location information not available</Text>
                        </View>
                      );
                    }
                  })()}

                  {/* Show additional coordinates if addresses are available (for reference) */}
                  {(() => {
                    const hasValidAddresses = alert.startAddress && alert.endAddress &&
                      alert.startAddress.trim() !== '' && alert.endAddress.trim() !== '' &&
                      alert.startAddress.toLowerCase() !== 'unknown' && alert.endAddress.toLowerCase() !== 'unknown';
                    const hasLocations = alert.startLocation || alert.endLocation;

                    if (hasValidAddresses && hasLocations) {
                      return (
                        <View style={styles.coordinatesInfo}>
                          <Text style={styles.coordinatesLabel}>Coordinates:</Text>
                          {alert.startLocation && (
                            <Text style={styles.coordinatesText}>
                              📍 Source: {alert.startLocation.latitude.toFixed(6)}, {alert.startLocation.longitude.toFixed(6)}
                            </Text>
                          )}
                          {alert.endLocation && (
                            <Text style={styles.coordinatesText}>
                              🎯 Destination: {alert.endLocation.latitude.toFixed(6)}, {alert.endLocation.longitude.toFixed(6)}
                            </Text>
                          )}
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {alert.distance ? (
                    <View style={styles.distanceInfo}>
                      <Text style={styles.distanceLabel}>Distance:</Text>
                      <Text style={styles.distanceText}>
                        {typeof alert.distance === 'number'
                          ? `${(alert.distance / 1000).toFixed(2)} km`
                          : String(alert.distance || 'Unknown')}
                      </Text>
                    </View>
                  ) : null}

                  {alert.area ? (
                    <View style={styles.areaInfo}>
                      <Text style={styles.areaLabel}>Area:</Text>
                      <Text style={styles.areaText}>{String(alert.area || 'Unknown')}</Text>
                    </View>
                  ) : null}

                  {alert.trafficStatus ? (
                    <View style={styles.trafficInfo}>
                      <Text style={styles.trafficLabel}>Traffic Status:</Text>
                      <Text style={[
                        styles.trafficText,
                        alert.trafficStatus === 'clear' || alert.trafficStatus === 'accepted' ? styles.trafficClear :
                          alert.trafficStatus === 'rejected' ? styles.trafficBusy :
                            styles.trafficBusy
                      ]}>
                        {alert.trafficStatus === 'clear' ? '✅ CLEAR' :
                          alert.trafficStatus === 'accepted' ? '✅ ACCEPTED' :
                            alert.trafficStatus === 'rejected' ? '❌ REJECTED' :
                              '⚠️ BUSY'}
                      </Text>
                    </View>
                  ) : null}

                  {alert.policeResponse ? (
                    <View style={styles.responseInfo}>
                      <Text style={styles.responseLabel}>Your Response:</Text>
                      <Text style={styles.responseText}>{String(alert.policeResponse || '')}</Text>
                    </View>
                  ) : null}
                </View>

                {alert.status === 'pending' ? (
                  <View style={styles.alertActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.showMapButton]}
                      onPress={() => handleShowOnMap(alert)}
                    >
                      <Text style={styles.actionButtonText}>🗺️ Show on Map</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {alert.status === 'pending' && selectedAlert?.id === alert.id ? (
                  <View style={styles.alertActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.acceptButton, { marginRight: 5 }]}
                      onPress={() => handleAccept(alert)}
                    >
                      <Text style={styles.actionButtonText}>✅ Accept Route</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton, { marginLeft: 5 }]}
                      onPress={() => handleReject(alert)}
                    >
                      <Text style={styles.actionButtonText}>❌ Reject Route</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {alert.status === 'pending' && selectedAlert?.id !== alert.id ? (
                  <View style={styles.alertActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.acceptButton, { marginRight: 5 }]}
                      onPress={() => handleAccept(alert)}
                    >
                      <Text style={styles.actionButtonText}>✅ Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton, { marginLeft: 5 }]}
                      onPress={() => handleReject(alert)}
                    >
                      <Text style={styles.actionButtonText}>❌ Reject</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Rejection Message Modal */}
      <Modal
        visible={showRejectModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowRejectModal(false);
          setRejectMessage('');
          setRejectingAlert(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Route</Text>
            <Text style={styles.modalSubtitle}>
              Enter a message to send to the ambulance driver:
            </Text>
            <TextInput
              style={styles.messageInput}
              placeholder="e.g., Take another way, not this way"
              value={rejectMessage}
              onChangeText={setRejectMessage}
              multiline
              numberOfLines={4}
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectMessage('');
                  setRejectingAlert(null);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmitButton]}
                onPress={handleSubmitRejection}
              >
                <Text style={[styles.modalButtonText, styles.modalSubmitButtonText]}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Network Error Modal */}
      <Modal
        visible={showNetworkErrorModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNetworkErrorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.networkErrorModalContent}>
            <View style={styles.networkErrorIconContainer}>
              <Text style={styles.networkErrorIcon}>📡</Text>
            </View>
            <Text style={styles.networkErrorTitle}>Network Issue</Text>
            <Text style={styles.networkErrorMessage}>
              There is a network issue. Please check your internet connection and try again.
            </Text>
            <Text style={styles.networkErrorSubtext}>
              Make sure you are connected to Wi-Fi or mobile data.
            </Text>
            <TouchableOpacity
              style={styles.networkErrorButton}
              onPress={() => {
                setShowNetworkErrorModal(false);
                // Retry fetching alerts
                fetchAlerts(false, true);
              }}
            >
              <Text style={styles.networkErrorButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.networkErrorButton, styles.networkErrorButtonSecondary]}
              onPress={() => setShowNetworkErrorModal(false)}
            >
              <Text style={[styles.networkErrorButtonText, styles.networkErrorButtonTextSecondary]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: isSmallDevice ? spacing.md : spacing.lg,
    paddingBottom: spacing.md,
    ...shadows.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  headerEmojiContainer: {
    width: isSmallDevice ? 50 : isTablet ? 70 : 60,
    height: isSmallDevice ? 50 : isTablet ? 70 : 60,
    borderRadius: isSmallDevice ? 25 : isTablet ? 35 : 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    ...shadows.md,
  },
  headerEmoji: {
    fontSize: isSmallDevice ? 28 : isTablet ? 40 : 32,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: isSmallDevice ? 18 : isTablet ? 28 : 22,
    fontWeight: 'bold',
    color: colors.white,
    ...typography.h3,
  },
  headerSubtitle: {
    fontSize: isSmallDevice ? 12 : 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  headerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: spacing.sm,
  },
  testAlertButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
    alignSelf: 'flex-start',
  },
  testAlertButtonGradient: {
    paddingHorizontal: isSmallDevice ? spacing.md : spacing.lg,
    paddingVertical: isSmallDevice ? spacing.xs + 2 : spacing.sm,
  },
  testAlertButtonText: {
    color: colors.white,
    fontSize: isSmallDevice ? 12 : 14,
    fontWeight: '600',
  },
  clearAlertsButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
    alignSelf: 'flex-start',
  },
  clearAlertsButtonGradient: {
    paddingHorizontal: isSmallDevice ? spacing.md : spacing.lg,
    paddingVertical: isSmallDevice ? spacing.xs + 2 : spacing.sm,
  },
  clearAlertsButtonText: {
    color: colors.white,
    fontSize: isSmallDevice ? 12 : 14,
    fontWeight: '600',
  },
  logoutButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
    minWidth: isSmallDevice ? 50 : 80,
  },
  logoutButtonGradient: {
    paddingHorizontal: isSmallDevice ? spacing.sm : spacing.md,
    paddingVertical: isSmallDevice ? spacing.xs + 2 : spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.white,
    fontSize: isSmallDevice ? 14 : 14,
    fontWeight: '700',
  },
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: isSmallDevice ? spacing.md : spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: isSmallDevice ? 20 : isTablet ? 32 : 24,
    fontWeight: 'bold',
    color: colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statLabel: {
    fontSize: isSmallDevice ? 10 : 12,
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 4,
    fontWeight: '600',
  },
  newAlertBadge: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...shadows.lg,
  },
  newAlertBadgeText: {
    color: colors.white,
    fontSize: isSmallDevice ? 10 : 12,
    fontWeight: 'bold',
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: isSmallDevice ? spacing.md : spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleButtonText: {
    color: colors.white,
    fontSize: isSmallDevice ? 12 : 14,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: '#2E86AB',
  },
  mapContainer: {
    flex: 1,
    height: height - (isSmallDevice ? 240 : isTablet ? 280 : 250),
  },
  map: {
    flex: 1,
    width: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E9ECEF',
  },
  mapPlaceholderText: {
    fontSize: isSmallDevice ? 14 : 16,
    color: '#7F8C8D',
  },
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
    backgroundColor: '#2E86AB',
    opacity: 0.4,
  },
  policeMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2E86AB',
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
  policeMarkerEmoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  ambulanceMarkerContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  ambulanceMarkerPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E74C3C',
    opacity: 0.4,
  },
  ambulanceMarkerPulseSelected: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B6B',
    opacity: 0.5,
  },
  ambulanceMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
    zIndex: 1,
  },
  ambulanceMarkerPending: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FFD93D',
    borderWidth: 5,
  },
  ambulanceMarkerSelected: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 6,
    borderColor: '#FFD93D',
    backgroundColor: '#FF6B6B',
    ...shadows.lg,
  },
  ambulanceIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Add white background to make emoji pop
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E74C3C', // Red border for ambulance
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  ambulanceMarkerEmoji: {
    fontSize: 32,
    textAlign: 'center',
  },
  alertsContainer: {
    flex: 1,
  },
  alertsContent: {
    padding: isSmallDevice ? spacing.md : spacing.lg,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: isSmallDevice ? 56 : isTablet ? 80 : 64,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: isSmallDevice ? 16 : isTablet ? 22 : 18,
    fontWeight: '600',
    color: colors.white,
    marginBottom: spacing.sm,
    ...typography.h4,
  },
  emptySubtext: {
    fontSize: isSmallDevice ? 12 : 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: isSmallDevice ? spacing.md : spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  alertHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertEmoji: {
    fontSize: isSmallDevice ? 28 : isTablet ? 36 : 32,
    marginRight: spacing.md,
  },
  alertDriver: {
    fontSize: isSmallDevice ? 14 : isTablet ? 18 : 16,
    fontWeight: '600',
    color: colors.textPrimary,
    ...typography.h4,
  },
  alertTime: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusPending: {
    backgroundColor: '#F39C12',
  },
  statusResponded: {
    backgroundColor: '#27AE60',
  },
  statusCleared: {
    backgroundColor: '#95A5A6',
  },
  statusText: {
    fontSize: isSmallDevice ? 9 : 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  alertBody: {
    marginTop: spacing.sm,
  },
  routeInfo: {
    marginBottom: spacing.sm,
  },
  routeLabel: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  routeText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  distanceInfo: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  distanceLabel: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  distanceText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  areaInfo: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  areaLabel: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  areaText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  trafficInfo: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  trafficLabel: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  trafficText: {
    fontSize: isSmallDevice ? 13 : 14,
    fontWeight: '600',
  },
  trafficClear: {
    color: '#27AE60',
  },
  trafficBusy: {
    color: '#E74C3C',
  },
  responseInfo: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#F8F9FA',
    borderRadius: borderRadius.md,
  },
  responseLabel: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  responseText: {
    fontSize: isSmallDevice ? 13 : 14,
    color: colors.textPrimary,
  },
  alertActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  showMapButton: {
    backgroundColor: '#3498DB',
  },
  acceptButton: {
    backgroundColor: '#27AE60',
  },
  rejectButton: {
    backgroundColor: '#E74C3C',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: isSmallDevice ? 12 : 14,
    fontWeight: '600',
  },
  sourceMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3498DB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...shadows.md,
  },
  sourceMarkerText: {
    fontSize: 20,
  },
  destinationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E74C3C',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...shadows.md,
  },
  destinationMarkerText: {
    fontSize: 20,
  },
  coordinatesInfo: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#F8F9FA',
    borderRadius: borderRadius.md,
  },
  coordinatesLabel: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  coordinatesText: {
    fontSize: isSmallDevice ? 11 : 12,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
    ...shadows.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  markerCallout: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E74C3C',
    elevation: 5,
    marginBottom: 5,
  },
  markerCalloutText: {
    fontWeight: 'bold',
    color: '#E74C3C',
    fontSize: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#95A5A6',
  },
  modalSubmitButton: {
    backgroundColor: '#E74C3C',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitButtonText: {
    fontWeight: '700',
  },
  networkErrorModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...shadows.lg,
  },
  networkErrorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF3CD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  networkErrorIcon: {
    fontSize: 40,
  },
  networkErrorTitle: {
    fontSize: isSmallDevice ? 18 : 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  networkErrorMessage: {
    fontSize: isSmallDevice ? 14 : 16,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  networkErrorSubtext: {
    fontSize: isSmallDevice ? 12 : 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  networkErrorButton: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: '#2E86AB',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  networkErrorButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2E86AB',
  },
  networkErrorButtonText: {
    color: '#FFFFFF',
    fontSize: isSmallDevice ? 14 : 16,
    fontWeight: '600',
  },
  networkErrorButtonTextSecondary: {
    color: '#2E86AB',
  },
});

export default PoliceDashboardScreen;
