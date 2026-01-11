// API Configuration
// Change this to your computer's IP address when testing on device/emulator
// Find your IP: Run 'ipconfig' on Windows or 'ifconfig' on Mac/Linux

// For Expo Go on same network, use your computer's IP
const API_BASE_URL = 'http://10.199.199.6:5000';

// For Android emulator, use: http://10.0.2.2:5000
// For iOS simulator, use: http://localhost:5000

export const API_ENDPOINTS = {
  BASE_URL: API_BASE_URL,
  POLICE_ALERTS: `${API_BASE_URL}/api/police-alerts`,
  POLICE_ALERT: `${API_BASE_URL}/api/police-alert`,
  POLICE_RESPONSE: `${API_BASE_URL}/api/police-response`,
  POLICE_LOCATIONS: `${API_BASE_URL}/api/police/locations`,
  POLICE_UPDATE_LOCATION: `${API_BASE_URL}/api/police/location`,
  TOLL_ALERT: `${API_BASE_URL}/api/toll-alert`,
  TOLL_ALERTS: `${API_BASE_URL}/api/toll-alerts`,
  TRAFFIC_LIGHTS_REALTIME: `${API_BASE_URL}/api/traffic-lights/realtime`,
  REGISTER: `${API_BASE_URL}/api/register`,
  LOGIN: `${API_BASE_URL}/api/login`,
  USERS: `${API_BASE_URL}/api/users`,
};

export default API_BASE_URL;






