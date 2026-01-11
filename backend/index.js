require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fastlane';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB Connected Successfully!');
  console.log(`📊 Database: ${mongoose.connection.name}`);
  console.log(`🔗 Host: ${mongoose.connection.host}`);
})
.catch((err) => {
  console.error('❌ MongoDB Connection Error:', err.message);
  console.error('💡 Make sure MongoDB is running on your system');
  console.error('   Run: mongod (or start MongoDB service)');
});

// MongoDB Connection Events
mongoose.connection.on('connected', () => {
  console.log('🟢 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed due to app termination');
  process.exit(0);
});

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Fastlane Backend API',
    status: 'running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      register: 'POST /api/register',
      login: 'POST /api/login',
      users: 'GET /api/users',
      policeAlerts: 'GET /api/police-alerts',
      policeAlert: 'POST /api/police-alert',
      policeResponse: 'POST /api/police-response',
      tollAlert: 'POST /api/toll-alert',
      tollAlerts: 'GET /api/toll-alerts',
      trafficLights: 'GET /api/traffic-lights',
      trafficLightsOverpass: 'GET /api/traffic-lights/overpass'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Real-Time WebSocket Connection Handling
const ambulanceLocations = new Map(); // Store active ambulance locations
const tollOperators = new Map(); // Store connected toll operators

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // Ambulance connects
  socket.on('ambulance:connect', (data) => {
    const { driverName, role } = data;
    ambulanceLocations.set(socket.id, {
      socketId: socket.id,
      driverName,
      role,
      location: null,
      lastUpdate: new Date()
    });
    console.log(`🚑 Ambulance connected: ${driverName} (${socket.id})`);
    
    // Join ambulance room
    socket.join('ambulances');
  });

  // Toll operator connects
  socket.on('toll:connect', (data) => {
    const { tollId, tollName } = data;
    tollOperators.set(socket.id, {
      socketId: socket.id,
      tollId,
      tollName,
      connectedAt: new Date()
    });
    console.log(`💰 Toll operator connected: ${tollName} (${socket.id})`);
    
    // Join specific toll room
    socket.join(`toll:${tollId}`);
  });

  // Ambulance location update (real-time)
  socket.on('ambulance:location', (data) => {
    const { latitude, longitude, speed, heading } = data;
    const ambulance = ambulanceLocations.get(socket.id);
    
    if (ambulance) {
      ambulance.location = { latitude, longitude, speed, heading };
      ambulance.lastUpdate = new Date();
      
      console.log(`📍 ${ambulance.driverName}: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) @ ${speed}km/h`);
      
      // Broadcast to all toll operators
      io.to('toll-operators').emit('ambulance:tracking', {
        ambulanceId: socket.id,
        driverName: ambulance.driverName,
        location: { latitude, longitude },
        speed,
        heading,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Ambulance approaching toll gate
  socket.on('ambulance:nearToll', (data) => {
    const { tollId, tollName, distance, eta } = data;
    const ambulance = ambulanceLocations.get(socket.id);
    
    if (ambulance) {
      console.log(`🚨 ALERT: ${ambulance.driverName} approaching ${tollName} (${distance}m away)`);
      
      // Send alert to specific toll operator
      io.to(`toll:${tollId}`).emit('toll:ambulanceAlert', {
        ambulanceId: socket.id,
        driverName: ambulance.driverName,
        location: ambulance.location,
        distance,
        eta,
        tollName,
        timestamp: new Date().toISOString()
      });

      // Auto-response with traffic status (simulated)
      const trafficStatus = Math.random() > 0.7 ? 'congested' : 'clear';
      socket.emit('toll:trafficStatus', {
        tollId,
        tollName,
        status: trafficStatus,
        message: trafficStatus === 'clear' 
          ? '✅ Route is clear. Free passage granted.' 
          : '⚠️ Heavy traffic. Consider alternate route.',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Toll operator sends traffic update
  socket.on('toll:updateStatus', (data) => {
    const { tollId, status, message } = data;
    const toll = tollOperators.get(socket.id);
    
    if (toll) {
      console.log(`📡 ${toll.tollName} updated status: ${status}`);
      
      // Broadcast to all ambulances
      io.to('ambulances').emit('toll:statusUpdate', {
        tollId,
        tollName: toll.tollName,
        status,
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (ambulanceLocations.has(socket.id)) {
      const ambulance = ambulanceLocations.get(socket.id);
      console.log(`🚑 Ambulance disconnected: ${ambulance.driverName}`);
      ambulanceLocations.delete(socket.id);
    }
    
    if (tollOperators.has(socket.id)) {
      const toll = tollOperators.get(socket.id);
      console.log(`💰 Toll operator disconnected: ${toll.tollName}`);
      tollOperators.delete(socket.id);
    }
  });
});

// Make io available to routes
app.set('io', io);

// Import routes
require('./routes/authRoutes')(app);
require('./routes/tollRoutes')(app);
require('./routes/policeRoutes')(app);
require('./routes/trafficLightRoutes')(app);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
  console.log(`📝 Test: http://localhost:${PORT}/api/health`);
  console.log(`⚡ WebSocket ready for real-time updates`);
});
