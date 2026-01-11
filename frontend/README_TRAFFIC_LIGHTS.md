# Real-Time Traffic Lights Integration Guide

This document explains how to integrate real-time traffic light data into the application.

## Data Sources Available

### 1. **Backend API (Recommended)**
Create a backend endpoint that connects to real-time traffic light APIs:
- **Endpoint**: `/api/traffic-lights/realtime`
- **Method**: GET
- **Parameters**: 
  - `startLat`, `startLng`, `endLat`, `endLng` (route coordinates)
  - `bufferKm` (buffer distance in km)

**Response Format:**
```json
{
  "success": true,
  "lights": [
    {
      "id": "tl-001",
      "name": "Main Street & Oak Avenue",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "status": "green",
      "timeRemaining": 15,
      "timing": { "red": 30, "yellow": 5, "green": 25 },
      "junctionType": "four-way",
      "roads": ["Main Street", "Oak Avenue"],
      "city": "Bangalore",
      "isRealTime": true
    }
  ]
}
```

### 2. **Mapbox Traffic API**
The service automatically uses Mapbox Directions API to infer traffic light locations from route intersections. This works out of the box with your existing Mapbox token.

### 3. **Open Traffic Lights API (Antwerp, Belgium)**
For areas with Open Data traffic light APIs:
- **URL**: `https://data.antwerpen.be/api/traffic-lights`
- **Format**: RDF/SPAT data
- **License**: Open Data

### 4. **Google Maps TrafficLayer**
If using Google Maps, you can enable traffic layer:
```javascript
<MapView
  showsTraffic={true}  // Shows traffic conditions
  // Note: This shows traffic flow, not individual traffic lights
/>
```

### 5. **HERE Platform Data Extension API**
Commercial service that provides traffic light locations:
- Requires API key
- Provides detailed traffic light data
- Paid service

## Implementation

### Backend Setup

Create a backend endpoint that aggregates data from multiple sources:

```javascript
// backend/routes/trafficLightsRoutes.js
app.get('/api/traffic-lights/realtime', async (req, res) => {
  const { startLat, startLng, endLat, endLng, bufferKm } = req.query;
  
  try {
    // Option 1: Connect to your city's traffic management system
    const cityLights = await fetchCityTrafficLightsAPI(startLat, startLng, endLat, endLng);
    
    // Option 2: Use Open Data APIs (e.g., Antwerp)
    const openDataLights = await fetchOpenTrafficLightsAPI(bounds);
    
    // Option 3: Use commercial APIs (HERE, TomTom, etc.)
    const commercialLights = await fetchCommercialTrafficLightsAPI(bounds);
    
    // Merge and return
    const allLights = [...cityLights, ...openDataLights, ...commercialLights];
    
    res.json({
      success: true,
      lights: allLights
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Frontend Usage

The traffic lights are automatically fetched when you create a route:

```javascript
// Automatically called in handleCreateRoute
const lights = await fetchTrafficLights(startCoords, endCoords, 1);
setTrafficLights(lights);
```

### Real-Time Updates

Traffic light status updates automatically every 5 seconds for lights marked as `isRealTime: true`.

## Data Source Priority

1. **Backend API** (if available) - Most reliable, can aggregate multiple sources
2. **Mapbox** - Automatic fallback, uses route intersections
3. **Open Data APIs** - For supported cities (Antwerp, etc.)

## Status Values

- `green` - Traffic light is green (proceed)
- `yellow` - Traffic light is yellow (caution)
- `red` - Traffic light is red (stop)

## Real-Time Data Sources by Region

### Europe
- **Antwerp, Belgium**: Open Traffic Lights API (RDF/SPAT)
- **Amsterdam, Netherlands**: Open Data portals
- **London, UK**: TfL API (Transport for London)

### North America
- **New York, USA**: NYC Open Data
- **Los Angeles, USA**: LA Open Data
- **Toronto, Canada**: Open Data Portal

### Asia
- **Singapore**: LTA DataMall
- **Tokyo, Japan**: Open Data initiatives
- **India**: Various city-specific APIs (check local government portals)

## Integration Steps

1. **Identify your data source**: Check if your city/region has an open data API for traffic lights
2. **Create backend endpoint**: Connect to the API and format the data
3. **Update API endpoint**: Point `TRAFFIC_LIGHTS_REALTIME` to your backend
4. **Test**: Create a route and verify traffic lights appear on the map

## Example: Connecting to City Traffic Management System

```javascript
// backend/services/trafficLightService.js
async function fetchCityTrafficLightsAPI(startLat, startLng, endLat, endLng) {
  const response = await fetch(
    `https://city-traffic-api.example.com/traffic-lights?` +
    `bounds=${startLat},${startLng},${endLat},${endLng}`,
    {
      headers: {
        'Authorization': `Bearer ${CITY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  return data.lights.map(light => ({
    id: light.signalId,
    name: light.intersectionName,
    latitude: light.lat,
    longitude: light.lng,
    status: light.currentPhase, // 'red', 'yellow', 'green'
    timeRemaining: light.timeRemaining,
    timing: light.timing,
    junctionType: light.junctionType,
    roads: light.roads,
    city: light.city,
    isRealTime: true
  }));
}
```

## Notes

- Traffic lights are automatically displayed on the map when a route is created
- Real-time status updates occur every 5 seconds
- The system falls back gracefully if no traffic light data is available
- Traffic light markers show color-coded status (green/yellow/red)
- Real-time indicators show "LIVE" badge for actively updating lights
