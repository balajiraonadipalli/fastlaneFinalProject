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
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { API_ENDPOINTS } from '../config/api';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLES } from '../config/mapbox';

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

const PoliceDashboardScreen = ({ route, navigation }) => {
  const { role, userName, policeStation, userId, userEmail } = route?.params || {};
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [newAlertsCount, setNewAlertsCount] = useState(0);
  const [lastAlertCount, setLastAlertCount] = useState(0);
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

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 New Emergency Alert!',
          body: `${alertCount} new ambulance ${alertCount > 1 ? 'alerts' : 'alert'}!\n` +
                `Driver: ${alert.driverName || 'Unknown'}\n` +
                `Distance: ${alert.distance ? (typeof alert.distance === 'number' ? `${(alert.distance / 1000).toFixed(2)} km` : alert.distance) : 'Unknown'}`,
          data: { alertId: alert.id, type: 'emergency' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.HIGH || 'high',
        },
        trigger: null, // Show immediately
      });
      
      console.log('📱 Local notification sent');
    } catch (error) {
      // Expo Go has limitations with notifications - this is expected and normal
      console.log('ℹ️ Local notification not available (Expo Go limitation) - Alert.alert will be used');
      // Don't throw error - Alert.alert will be shown instead
    }
  };

  // Fetch alerts from backend
  const fetchAlerts = async (showNotification = true) => {
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
        const newAlerts = data.alerts || [];
        const previousAlerts = alertsRef.current || [];
        
        console.log(`📊 Alert comparison:`, {
          newAlerts: newAlerts.length,
          previousAlerts: previousAlerts.length,
          newAlertIds: newAlerts.map(a => a.id),
          previousAlertIds: previousAlerts.map(a => a.id)
        });
        
        // Detect new alerts by comparing IDs
        if (showNotification && previousAlerts.length >= 0) {
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
        
        setAlerts(newAlerts);
        alertsRef.current = newAlerts;
        setLastAlertCount(newAlerts.length);
        console.log(`✅ Fetched ${newAlerts.length} police alerts (previous: ${previousAlerts.length})`);
      } else {
        console.error('❌ Failed to fetch alerts:', data.message);
        setAlerts([]);
        alertsRef.current = [];
      }
    } catch (error) {
      console.error('❌ Error fetching alerts:', error);
      console.error('Error details:', error.message, error.stack);
      setAlerts([]);
      alertsRef.current = [];
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
      fetchAlerts(true); // Show notifications for new alerts
    }, 3000);

    return () => clearInterval(interval);
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
    fetchAlerts();
  };

  // Send response to alert
  const handleRespond = (alert, trafficStatus) => {
    Alert.alert(
      'Confirm Response',
      `Mark traffic as ${trafficStatus === 'clear' ? 'CLEAR' : 'BUSY'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const response = await fetch(API_ENDPOINTS.POLICE_RESPONSE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  alertId: alert.id,
                  trafficStatus: trafficStatus,
                  message: trafficStatus === 'clear' ? 'Route is clear for emergency vehicle' : 'Heavy traffic detected',
                  policeOfficer: userName || 'Police Officer'
                })
              });

              const data = await response.json();
              if (data.success) {
                Alert.alert('Success', 'Response sent to ambulance driver');
                fetchAlerts(); // Refresh alerts
              } else {
                Alert.alert('Error', data.message || 'Failed to send response');
              }
            } catch (error) {
              console.error('Error sending response:', error);
              Alert.alert('Error', 'Failed to send response. Please try again.');
            }
          }
        }
      ]
    );
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
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Home' }],
            });
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

  return (
    <LinearGradient
      colors={['#2E86AB', '#1A5F7A']}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerEmoji}>🚔</Text>
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
        >
          <Text style={styles.logoutText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>

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

              {/* Ambulance markers from alerts with scale animation */}
              {alerts.map((alert, index) => {
                if (!alert.location || !alert.location.latitude || !alert.location.longitude) {
                  return null;
                }
                return (
                  <Marker
                    key={alert.id}
                    coordinate={{
                      latitude: alert.location.latitude,
                      longitude: alert.location.longitude,
                    }}
                    title={`Ambulance: ${alert.driverName || 'Unknown'}`}
                    description={`Distance: ${alert.distance ? (typeof alert.distance === 'number' ? `${(alert.distance / 1000).toFixed(2)} km` : alert.distance) : 'Unknown'}`}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    <Animated.View
                      style={[
                        styles.ambulanceMarkerContainer,
                        {
                          transform: [{ scale: markerScaleAnim }],
                        },
                      ]}
                    >
                      <View style={styles.ambulanceMarkerPulse} />
                      <View style={[
                        styles.ambulanceMarker,
                        alert.status === 'pending' && styles.ambulanceMarkerPending,
                      ]}>
                        <View style={styles.ambulanceIconCircle}>
                          <Text style={styles.ambulanceMarkerEmoji}>🚑</Text>
                        </View>
                      </View>
                    </Animated.View>
                  </Marker>
                );
              })}

              {/* Route polylines from alerts with animated dash */}
              {alerts.map((alert) => {
                if (!alert.routeCoordinates || !Array.isArray(alert.routeCoordinates) || alert.routeCoordinates.length < 2) {
                  return null;
                }
                return (
                  <Polyline
                    key={`route-${alert.id}`}
                    coordinates={alert.routeCoordinates}
                    strokeColor={alert.status === 'pending' ? '#E74C3C' : '#27AE60'}
                    strokeWidth={5}
                    lineDashPattern={[10, 5]}
                    lineCap="round"
                    lineJoin="round"
                  />
                );
              })}
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
            <View key={alert.id} style={styles.alertCard}>
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
                {alert.startAddress && alert.endAddress && (
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeLabel}>Route:</Text>
                    <Text style={styles.routeText}>
                      {alert.startAddress} → {alert.endAddress}
                    </Text>
                  </View>
                )}

                {alert.distance && (
                  <View style={styles.distanceInfo}>
                    <Text style={styles.distanceLabel}>Distance:</Text>
                    <Text style={styles.distanceText}>
                      {typeof alert.distance === 'number' 
                        ? `${(alert.distance / 1000).toFixed(2)} km`
                        : alert.distance}
                    </Text>
                  </View>
                )}

                {alert.area && (
                  <View style={styles.areaInfo}>
                    <Text style={styles.areaLabel}>Area:</Text>
                    <Text style={styles.areaText}>{alert.area}</Text>
                  </View>
                )}

                {alert.trafficStatus && (
                  <View style={styles.trafficInfo}>
                    <Text style={styles.trafficLabel}>Traffic Status:</Text>
                    <Text style={[
                      styles.trafficText,
                      alert.trafficStatus === 'clear' ? styles.trafficClear :
                      styles.trafficBusy
                    ]}>
                      {alert.trafficStatus === 'clear' ? '✅ CLEAR' : '⚠️ BUSY'}
                    </Text>
                  </View>
                )}

                {alert.policeResponse && (
                  <View style={styles.responseInfo}>
                    <Text style={styles.responseLabel}>Your Response:</Text>
                    <Text style={styles.responseText}>{alert.policeResponse}</Text>
                  </View>
                )}
              </View>

              {alert.status === 'pending' && (
                <View style={styles.alertActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.clearButton, { marginRight: 5 }]}
                    onPress={() => handleRespond(alert, 'clear')}
                  >
                    <Text style={styles.actionButtonText}>✅ Route Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.busyButton, { marginLeft: 5 }]}
                    onPress={() => handleRespond(alert, 'busy')}
                  >
                    <Text style={styles.actionButtonText}>⚠️ Heavy Traffic</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerEmoji: {
    fontSize: 40,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E0E0E0',
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#E0E0E0',
    marginTop: 4,
  },
  newAlertBadge: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#E74C3C',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  newAlertBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: '#2E86AB',
  },
  mapContainer: {
    flex: 1,
    height: height - 250,
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
    fontSize: 16,
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
  ambulanceIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ambulanceMarkerEmoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  alertsContainer: {
    flex: 1,
  },
  alertsContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#E0E0E0',
    textAlign: 'center',
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  alertHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  alertDriver: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  alertTime: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  alertBody: {
    marginTop: 8,
  },
  routeInfo: {
    marginBottom: 8,
  },
  routeLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 2,
  },
  routeText: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  distanceInfo: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  distanceLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginRight: 8,
  },
  distanceText: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  areaInfo: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  areaLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginRight: 8,
  },
  areaText: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  trafficInfo: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  trafficLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginRight: 8,
  },
  trafficText: {
    fontSize: 14,
    fontWeight: '600',
  },
  trafficClear: {
    color: '#27AE60',
  },
  trafficBusy: {
    color: '#E74C3C',
  },
  responseInfo: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
  },
  responseLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 4,
  },
  responseText: {
    fontSize: 14,
    color: '#2C3E50',
  },
  alertActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#27AE60',
  },
  busyButton: {
    backgroundColor: '#E74C3C',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PoliceDashboardScreen;
