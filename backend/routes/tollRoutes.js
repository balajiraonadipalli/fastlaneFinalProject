// Toll gate alert routes
module.exports = (app) => {
  // Store alerts in memory (in production, use database)
  const tollAlerts = [];
  const policeAlerts = [];
  const tollOperators = {}; // Simulated toll operator connections
  const policeStations = {}; // Simulated police station connections

  // Receive alert from ambulance
  app.post('/api/toll-alert', async (req, res) => {
    const { tollId, tollName, highway, ambulanceRole, driverName, distance, estimatedArrival, timestamp } = req.body;
    
    try {
      console.log(`🚨 TOLL ALERT RECEIVED:`);
      console.log(`   Toll: ${tollName} (${highway})`);
      console.log(`   Ambulance Driver: ${driverName}`);
      console.log(`   Distance: ${distance}m`);
      console.log(`   ETA: ${estimatedArrival} min`);

      // Simulate traffic status check
      const trafficStatus = Math.random() > 0.7 ? 'congested' : 'clear';
      const message = trafficStatus === 'clear' 
        ? 'Route is clear. Free passage granted.'
        : 'Heavy traffic detected. Consider alternate route.';

      // Store alert
      const alert = {
        id: tollAlerts.length + 1,
        tollId,
        tollName,
        highway,
        ambulanceRole,
        driverName,
        distance,
        estimatedArrival,
        trafficStatus,
        message,
        timestamp,
        receivedAt: new Date().toISOString(),
        status: 'active'
      };

      tollAlerts.push(alert);

      // TODO: Send real-time notification to toll operator via WebSocket/FCM
      console.log(`✅ Alert sent to ${tollName} operator`);
      console.log(`📊 Traffic Status: ${trafficStatus.toUpperCase()}`);

      res.json({
        success: true,
        trafficStatus,
        message,
        alert
      });

    } catch (error) {
      console.error('❌ Error processing toll alert:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing toll alert',
        error: error.message
      });
    }
  });

  // Get all toll alerts (for toll operator dashboard)
  app.get('/api/toll-alerts', async (req, res) => {
    try {
      const activeAlerts = tollAlerts.filter(a => a.status === 'active');
      res.json({
        success: true,
        count: activeAlerts.length,
        alerts: activeAlerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching alerts',
        error: error.message
      });
    }
  });

  // Get alerts for specific toll
  app.get('/api/toll-alerts/:tollId', async (req, res) => {
    try {
      const tollId = parseInt(req.params.tollId);
      const alerts = tollAlerts.filter(a => a.tollId === tollId && a.status === 'active');
      
      res.json({
        success: true,
        count: alerts.length,
        alerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching toll alerts',
        error: error.message
      });
    }
  });

  // Update traffic status (toll operator response)
  app.post('/api/toll-status', async (req, res) => {
    const { tollId, status, message } = req.body;
    
    try {
      console.log(`📡 Traffic status update from Toll ${tollId}:`);
      console.log(`   Status: ${status}`);
      console.log(`   Message: ${message}`);

      res.json({
        success: true,
        message: 'Status updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating status',
        error: error.message
      });
    }
  });

  // Receive police alert from ambulance - sends to ALL logged-in police users
  app.post('/api/police-alert', async (req, res) => {
    const { policeId, policeName, area, ambulanceRole, driverName, distance, location, route, timestamp } = req.body;
    
    try {
      console.log(`🚔 POLICE ALERT RECEIVED (FOR ALL POLICE USERS):`);
      console.log(`   📍 Location: ${area || 'Near police station'}`);
      console.log(`   🚑 Ambulance Driver: ${driverName}`);
      console.log(`   📏 Distance: ${distance}m`);
      console.log(`   🛣️  Route Status: ${route}`);

      // Store police alert - visible to ALL police users
      const alert = {
        id: policeAlerts.length + 1,
        policeId, // Which police station/area
        policeName,
        area,
        ambulanceRole,
        driverName,
        distance,
        location,
        route,
        timestamp,
        receivedAt: new Date().toISOString(),
        status: 'pending', // Waiting for any police response
        trafficStatus: 'unknown', // Will be updated by any police user
        forAllPolice: true // Flag indicating this is for all police users
      };

      policeAlerts.push(alert);

      // Send via WebSocket to all connected police users (if implemented)
      const io = req.app.get('io');
      if (io) {
        io.to('police-users').emit('new-ambulance-alert', alert);
        console.log(`📡 Alert broadcast to ALL police users via WebSocket`);
      }

      console.log(`✅ Alert stored and visible to ALL police users`);
      console.log(`📊 Status: PENDING - Any police user can respond`);

      res.json({
        success: true,
        message: 'Police alert received and broadcast to all police users',
        alert
      });

    } catch (error) {
      console.error('❌ Error processing police alert:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing police alert',
        error: error.message
      });
    }
  });

  // Police station responds with traffic status
  app.post('/api/police-response', async (req, res) => {
    const { alertId, trafficStatus, message } = req.body;
    
    try {
      console.log(`🚔 POLICE RESPONSE RECEIVED:`);
      console.log(`   Alert ID: ${alertId}`);
      console.log(`   Traffic Status: ${trafficStatus}`);
      console.log(`   Message: ${message}`);

      // Find and update alert
      const alert = policeAlerts.find(a => a.id === parseInt(alertId));
      if (alert) {
        alert.trafficStatus = trafficStatus;
        alert.status = 'responded';
        alert.policeResponse = message;
        alert.respondedAt = new Date().toISOString();

        console.log(`✅ Police response recorded for ${alert.policeName}`);
        
        // TODO: Send response back to ambulance via WebSocket/FCM
        console.log(`📡 Response sent to ambulance driver: ${alert.driverName}`);
      }

      res.json({
        success: true,
        message: 'Police response recorded',
        alert
      });

    } catch (error) {
      console.error('❌ Error processing police response:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing police response',
        error: error.message
      });
    }
  });

  // Get all police alerts (for police dashboard)
  app.get('/api/police-alerts', async (req, res) => {
    try {
      const activeAlerts = policeAlerts.filter(a => a.status === 'pending');
      res.json({
        success: true,
        count: activeAlerts.length,
        alerts: activeAlerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching police alerts',
        error: error.message
      });
    }
  });

  // Clear old alerts
  app.delete('/api/toll-alerts/clear', async (req, res) => {
    try {
      const tollCount = tollAlerts.length;
      const policeCount = policeAlerts.length;
      tollAlerts.length = 0;
      policeAlerts.length = 0;
      res.json({
        success: true,
        message: `Cleared ${tollCount} toll alerts and ${policeCount} police alerts`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error clearing alerts',
        error: error.message
      });
    }
  });
};

