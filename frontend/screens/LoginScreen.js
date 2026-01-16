import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../config/api';

const LoginScreen = ({ route, navigation }) => {
  const role = route?.params?.role || 'police';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Attempting login:', { email: email.toLowerCase(), role });
      
      // Authenticate with backend
      const response = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          password: password,
          role: role
        })
      });

      console.log('📡 Login response status:', response.status);

      // Check if response is ok
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Failed to connect to server';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || `Server error (${response.status})`;
          console.log('❌ Login error response:', errorData);
        } catch (e) {
          console.log('❌ Could not parse error response:', e);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        Alert.alert('Login Failed', errorMessage);
        setLoading(false);
        return;
      }

      const data = await response.json();
      console.log('📦 Login response data:', { success: data.success, hasToken: !!data.token });

      if (!data.success) {
        console.log('❌ Login failed:', data.message);
        Alert.alert('Login Failed', data.message || 'Invalid credentials');
        setLoading(false);
        return;
      }

      // Store token and user data
      if (data.token) {
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('userRole', role);
        await AsyncStorage.setItem('userEmail', email.toLowerCase());
        await AsyncStorage.setItem('userName', data.user?.name || email.split('@')[0]);
        if (data.user?.id) {
          await AsyncStorage.setItem('userId', data.user.id.toString());
        }
      }

      // Navigate based on role and RESET navigation stack
      if (role === 'police') {
        // Police goes to Dashboard - Reset navigation to prevent going back
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'PoliceDashboard', 
            params: { 
              role, 
              userName: data.user?.name || email.split('@')[0],
              userEmail: email.toLowerCase(),
              userId: data.user?.id, // Pass userId from backend
              policeStation: {
                name: 'Traffic Police Station',
                location: { latitude: 16.5062, longitude: 80.6480 }
              }
            }
          }],
        });
      } else {
        // Ambulance goes to Map screen - Reset navigation to prevent going back
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'Map', 
            params: { 
              role, 
              userName: data.user?.name || email.split('@')[0],
              userId: data.user?.id
            }
          }],
        });
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      
      let errorMessage = 'Failed to connect to server. ';
      if (error.message.includes('Network request failed') || error.message.includes('fetch')) {
        errorMessage += `\n\nPlease check:\n1. Backend server is running\n2. API URL is correct: ${API_ENDPOINTS.LOGIN}\n3. Your device/emulator can reach the server`;
      } else {
        errorMessage += error.message;
      }
      
      Alert.alert('Connection Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const roleColor = role === 'ambulance' ? '#E74C3C' : '#2E86AB';
  const roleEmoji = role === 'ambulance' ? '🚑' : '🚔';
  const roleTitle = role === 'ambulance' ? 'Ambulance' : 'Police';

  return (
    <LinearGradient
      colors={['#F8F9FA', '#E9ECEF']}
      style={styles.container}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          <View style={styles.header}>
            <Text style={styles.emoji}>{roleEmoji}</Text>
            <Text style={styles.title}>{roleTitle} Login</Text>
            <Text style={styles.subtitle}>Enter your credentials</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: roleColor, opacity: loading ? 0.6 : 1 }]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Register', { role })}
            >
              <Text style={styles.linkText}>Don't have an account? Register</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7F8C8D',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#2C3E50',
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#2E86AB',
    fontSize: 14,
  },
});

export default LoginScreen;

