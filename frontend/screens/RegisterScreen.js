import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../config/api';

const RegisterScreen = ({ route, navigation }) => {
  const role = route?.params?.role || 'police';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim() || !idNumber.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    // Validate role-specific ID
    if (role === 'police' && !idNumber.trim()) {
      Alert.alert('Error', 'Badge Number is required for police registration');
      return;
    }
    if (role === 'ambulance' && !idNumber.trim()) {
      Alert.alert('Error', 'Medical License Number is required for ambulance registration');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Attempting registration:', { email: email.toLowerCase(), role, hasIdNumber: !!idNumber });
      
      // Prepare registration data
      const registrationData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: password,
        role: role
      };

      // Add role-specific ID
      if (role === 'police') {
        registrationData.badgeNumber = idNumber.trim();
      } else if (role === 'ambulance') {
        registrationData.licenseNumber = idNumber.trim();
      }

      // Call backend API to register
      const response = await fetch(API_ENDPOINTS.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      console.log('📡 Registration response status:', response.status);

      // Check if response is ok
      if (!response.ok) {
        let errorMessage = 'Failed to connect to server';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || `Server error (${response.status})`;
          console.log('❌ Registration error response:', errorData);
        } catch (e) {
          console.log('❌ Could not parse error response:', e);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        Alert.alert('Registration Failed', errorMessage);
        setLoading(false);
        return;
      }

      const data = await response.json();
      console.log('📦 Registration response data:', { success: data.success, hasUser: !!data.user });

      if (!data.success) {
        console.log('❌ Registration failed:', data.message);
        Alert.alert('Registration Failed', data.message || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      // Registration successful - store auth data
      if (data.user) {
        // Generate a simple token (or use the one from backend if provided)
        const token = data.token || `token_${data.user.id}_${Date.now()}`;
        
        await AsyncStorage.setItem('authToken', token);
        await AsyncStorage.setItem('userRole', role);
        await AsyncStorage.setItem('userEmail', email.toLowerCase());
        await AsyncStorage.setItem('userName', data.user.name || name);
        if (data.user.id) {
          await AsyncStorage.setItem('userId', data.user.id.toString());
        }
        
        console.log('✅ Registration successful, auth data stored');
      }

      // Navigate based on role
      if (role === 'police') {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'PoliceDashboard', 
            params: { 
              role, 
              userName: data.user?.name || name,
              userEmail: email.toLowerCase(),
              userId: data.user?.id,
              policeStation: {
                name: 'Traffic Police Station',
                location: { latitude: 16.5062, longitude: 80.6480 }
              }
            }
          }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'Map', 
            params: { 
              role, 
              userName: data.user?.name || name,
              userId: data.user?.id
            }
          }],
        });
      }
    } catch (error) {
      console.error('❌ Registration error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        name: error.name
      });
      
      let errorMessage = 'Failed to connect to server. ';
      if (error.message.includes('Network request failed') || error.message.includes('fetch')) {
        errorMessage += `\n\nPlease check:\n1. Backend server is running\n2. API URL is correct: ${API_ENDPOINTS.REGISTER}\n3. Your device/emulator can reach the server`;
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
  const idLabel = role === 'ambulance' ? 'Medical License' : 'Badge Number';

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
            <Text style={styles.title}>{roleTitle} Registration</Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

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
              <Text style={styles.label}>{idLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={`Enter your ${idLabel.toLowerCase()}`}
                value={idNumber}
                onChangeText={setIdNumber}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Create a password (min 6 characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: roleColor, opacity: loading ? 0.6 : 1 }]}
              onPress={handleRegister}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Register</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.linkText}>Already have an account? Login</Text>
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
    padding: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
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
    marginBottom: 16,
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

export default RegisterScreen;

