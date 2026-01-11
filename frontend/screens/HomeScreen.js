import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HomeScreen = ({ navigation }) => {
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    checkAuthToken();
  }, []);

  const checkAuthToken = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const role = await AsyncStorage.getItem('userRole');
      const userName = await AsyncStorage.getItem('userName');
      const userEmail = await AsyncStorage.getItem('userEmail');
      const userId = await AsyncStorage.getItem('userId');

      if (token && role) {
        // Token exists, redirect to appropriate screen based on role
        if (role === 'police') {
          navigation.reset({
            index: 0,
            routes: [{
              name: 'PoliceDashboard',
              params: {
                role,
                userName: userName || 'Officer',
                userEmail: userEmail || '',
                userId: userId || '',
                policeStation: {
                  name: 'Traffic Police Station',
                  location: { latitude: 16.5062, longitude: 80.6480 }
                }
              }
            }],
          });
          return;
        } else if (role === 'ambulance') {
          navigation.reset({
            index: 0,
            routes: [{
              name: 'Map',
              params: {
                role,
                userName: userName || 'Driver',
                userId: userId || ''
              }
            }],
          });
          return;
        }
      }
    } catch (error) {
      console.error('Error checking auth token:', error);
    } finally {
      setCheckingToken(false);
    }
  };

  if (checkingToken) {
    return (
      <LinearGradient
        colors={['#F8F9FA', '#E9ECEF']}
        style={styles.container}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2E86AB" />
          <Text style={styles.loadingText}>Checking authentication...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#F8F9FA', '#E9ECEF']}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>🚨</Text>
          <Text style={styles.title}>FastLane</Text>
          <Text style={styles.subtitle}>Emergency Response System</Text>
        </View>

        <View style={styles.roleSection}>
          <Text style={styles.sectionTitle}>Select Your Role</Text>
          
          <TouchableOpacity
            style={[styles.roleCard, { backgroundColor: '#2E86AB' }]}
            onPress={() => navigation.navigate('Login', { role: 'police' })}
            activeOpacity={0.8}
          >
            <Text style={styles.roleEmoji}>🚔</Text>
            <Text style={styles.roleTitle}>Police Officer</Text>
            <Text style={styles.roleDescription}>Law enforcement response</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, { backgroundColor: '#E74C3C' }]}
            onPress={() => navigation.navigate('Login', { role: 'ambulance' })}
            activeOpacity={0.8}
          >
            <Text style={styles.roleEmoji}>🚑</Text>
            <Text style={styles.roleTitle}>Ambulance Driver</Text>
            <Text style={styles.roleDescription}>Medical emergency response</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7F8C8D',
  },
  roleSection: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 20,
    textAlign: 'center',
  },
  roleCard: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  roleEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  roleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#7F8C8D',
  },
});

export default HomeScreen;

