// API Configuration
// -------------------------------------------------
// PRODUCTION: Set your deployed backend URL here
// LOCAL DEV:  Use your PC's IP (run 'ipconfig' to find it)
// -------------------------------------------------

const IS_PRODUCTION = true; // 🔁 Set to false for local development

const PRODUCTION_URL = 'https://your-app-name.onrender.com'; // ✅ Replace with your Render URL
const LOCAL_URL = 'http://192.168.31.169:5000';              // ✅ Replace with your PC's IP for local dev

const API_BASE_URL = IS_PRODUCTION ? PRODUCTION_URL : LOCAL_URL;

// Quick reference:
// Android Emulator local: http://10.0.2.2:5000
// iOS Simulator local:    http://localhost:5000
// Physical device local:  http://<your-pc-ip>:5000

export const API_ENDPOINTS = {
  BASE_URL: API_BASE_URL,
  POLICE_ALERTS: `${API_BASE_URL}/api/police-alerts`,
  POLICE_ALERTS_CLEAR: `${API_BASE_URL}/api/police-alerts`, // DELETE method to clear all
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






