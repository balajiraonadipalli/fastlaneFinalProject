# Mapbox Navigation Setup Guide

This app now uses **Mapbox Directions API** for real-time navigation with turn-by-turn directions, automatic rerouting, and Google Maps-style navigation interface.

## Setup Instructions

### 1. Get Mapbox Access Token

1. Sign up for a free Mapbox account at: https://www.mapbox.com/
2. Go to: https://account.mapbox.com/access-tokens/
3. Create a new access token (or use the default public token)
4. Copy your access token

### 2. Configure Access Token

Open `frontend/config/mapbox.js` and replace `YOUR_MAPBOX_ACCESS_TOKEN_HERE` with your actual token:

```javascript
export const MAPBOX_ACCESS_TOKEN = 'pk.your_actual_token_here';
```

### 3. Free Tier Limits

- **50,000 free requests per month** for Directions API
- Perfect for development and small-scale production
- Upgrade for higher limits if needed

## Features Implemented

✅ **Mapbox Directions API Integration**
- Real-time route calculation
- Turn-by-turn navigation instructions
- Distance and duration estimates
- Automatic route recalculation on deviation

✅ **Google Maps-Style Navigation**
- Large arrow indicators for turns
- Speed display
- Distance to next turn
- Remaining distance and ETA
- Current street name

✅ **Auto-Rerouting**
- Detects when user deviates >50 meters from route
- Automatically recalculates route from current position
- Seamless route updates

✅ **Enhanced Arrow Icons**
- Slight right/left: ↗ ↖
- Turn right/left: → ←
- Sharp right/left: ↘ ↙ (red)
- Continue straight: ↑
- Destination: 📍 (green)

## How It Works

1. **Route Calculation**: Uses Mapbox Directions API to get optimal route with turn-by-turn instructions
2. **Navigation**: Displays Google Maps-style navigation overlay with arrows and instructions
3. **Real-time Tracking**: Monitors GPS position and updates navigation accordingly
4. **Auto-Rerouting**: Automatically recalculates route if user deviates from planned path

## Fallback System

If Mapbox API fails or token is not configured:
- Falls back to OSRM (Open Source Routing Machine) - free, no API key needed
- If OSRM also fails, uses straight-line route as final fallback

## Dependencies

- `@rnmapbox/maps` - Installed (used for future native Mapbox integration if needed)
- Mapbox Directions API - Called via fetch() (works with Expo)

## Notes

- The app uses Mapbox Directions API via HTTP requests (no native SDK required for Expo)
- This allows full compatibility with Expo managed workflow
- For native Mapbox SDK features, you would need to eject from Expo or use a development build
