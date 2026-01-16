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
    const { alertId, trafficStatus, message, policeOfficer, policeName } = req.body;
    
    try {
      console.log(`🚔 POLICE RESPONSE RECEIVED:`);
      console.log(`   Alert ID: ${alertId}`);
      console.log(`   Traffic Status: ${trafficStatus}`);
      console.log(`   Message: ${message}`);
      console.log(`   Police Officer: ${policeOfficer || 'N/A'}`);

      // Find and update alert - try both string and number comparison
      const alertIndex = policeAlerts.findIndex(a => a.id === parseInt(alertId) || a.id === alertId);
      
      if (alertIndex === -1) {
        console.error(`❌ Alert #${alertId} not found in policeAlerts array!`);
        console.error(`📊 Current alerts:`, policeAlerts.map(a => ({ id: a.id, driverName: a.driverName, status: a.status })));
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      const alert = policeAlerts[alertIndex];
      
      // CRITICAL: Update alert with proper status and timestamps
      alert.trafficStatus = trafficStatus; // 'accepted' or 'rejected'
      alert.status = 'acknowledged'; // Changed from 'responded' to 'acknowledged' to match frontend expectations
      alert.policeResponse = message || (trafficStatus === 'accepted' ? 'Route approved. You can proceed.' : 'Route rejected. Please take another way.');
      alert.policeOfficer = policeOfficer || policeName || alert.policeName;
      alert.respondedAt = new Date().toISOString();
      alert.acknowledgedAt = new Date().toISOString(); // CRITICAL: Add this field

      console.log(`✅ Police response recorded for ${alert.driverName}`);
      console.log(`📋 Updated alert:`, {
        id: alert.id,
        status: alert.status,
        trafficStatus: alert.trafficStatus,
        driverName: alert.driverName,
        respondedAt: alert.respondedAt,
        acknowledgedAt: alert.acknowledgedAt
      });
      
      // CRITICAL: If accepted, delete all duplicate pending alerts for the same driver
      if (trafficStatus === 'accepted') {
        const driverName = alert.driverName;
        const initialCount = policeAlerts.length;
        
        // Remove all pending alerts for the same driver (duplicates)
        // Keep only the accepted one
        const alertsToKeep = policeAlerts.filter(a => {
          // Keep the accepted alert
          if (a.id === alert.id) return true;
          // Keep alerts that are already acknowledged/responded
          if (a.status === 'acknowledged' || a.status === 'responded') return true;
          // Remove pending alerts for the same driver
          if (a.driverName && a.driverName.toLowerCase() === driverName.toLowerCase() && 
              (a.status === 'pending' || !a.status)) {
            return false; // Remove this duplicate
          }
          // Keep alerts for other drivers
          return true;
        });
        
        const removedCount = initialCount - alertsToKeep.length;
        policeAlerts.length = 0; // Clear array
        policeAlerts.push(...alertsToKeep); // Restore filtered alerts
        
        console.log(`🗑️ Removed ${removedCount} duplicate pending alert(s) for driver ${driverName}`);
        console.log(`📊 Remaining alerts: ${policeAlerts.length} (was ${initialCount})`);
      }
      
      // TODO: Send response back to ambulance via WebSocket/FCM
      console.log(`📡 Response sent to ambulance driver: ${alert.driverName}`);
      
      // Emit response via WebSocket to ambulance
      const io = req.app.get('io');
      if (io) {
        io.emit('police:response', {
          alert: alert,
          trafficStatus,
          message: alert.policeResponse,
          driverName: alert.driverName,
          alertId: alertId
        });
        console.log(`📡 WebSocket response broadcasted to ambulance driver: ${alert.driverName}`);
      }

      res.json({
        success: true,
        message: 'Police response recorded',
        alert: alert
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

  // Get all police alerts (for police dashboard and ambulance polling)
  app.get('/api/police-alerts', async (req, res) => {
    try {
      const { driverName } = req.query;
      
      console.log(`\n📥 BACKEND (tollRoutes): GET /api/police-alerts called${driverName ? ` (for driver: ${driverName})` : ' (all alerts)'}`);
      console.log(`📊 Total alerts in array: ${policeAlerts.length}`);
      
      let activeAlerts = policeAlerts;
      
      // Filter out old alerts (older than 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      activeAlerts = activeAlerts.filter(alert => {
        const alertTime = new Date(alert.timestamp || alert.receivedAt);
        return alertTime > fifteenMinutesAgo;
      });
      
      console.log(`📊 After time filter: ${activeAlerts.length} alerts`);
      
      // If driverName is provided, filter alerts for that specific driver (for ambulance polling)
      if (driverName) {
        console.log(`🔍 Filtering alerts for driver: ${driverName}`);
        activeAlerts = activeAlerts.filter(alert => 
          alert.driverName && alert.driverName.toLowerCase() === driverName.toLowerCase()
        );
        console.log(`📊 After driverName filter: ${activeAlerts.length} alerts`);
        
        // CRITICAL: Log all alerts being returned, especially acknowledged ones
        activeAlerts.forEach(a => {
          console.log(`  ✅ Alert #${a.id}: status="${a.status}", trafficStatus="${a.trafficStatus || 'none'}", driverName="${a.driverName}"`);
        });
        
        // Check if we have any acknowledged alerts
        const acknowledgedAlerts = activeAlerts.filter(a => 
          a.status === 'acknowledged' || a.status === 'responded' || 
          a.trafficStatus === 'accepted' || a.trafficStatus === 'rejected'
        );
        if (acknowledgedAlerts.length > 0) {
          console.log(`\n🎯 BACKEND: Found ${acknowledgedAlerts.length} acknowledged alert(s) for driver ${driverName}:`);
          acknowledgedAlerts.forEach(a => {
            console.log(`  ✅ Alert #${a.id}: status="${a.status}", trafficStatus="${a.trafficStatus}", respondedAt="${a.respondedAt || 'none'}"`);
          });
        } else {
          console.log(`\n⚠️ BACKEND: NO acknowledged alerts found for driver ${driverName}`);
        }
      } else {
        // For police dashboard, only show pending alerts
        activeAlerts = activeAlerts.filter(a => a.status === 'pending');
      }
      
      // Sort by timestamp (newest first)
      activeAlerts.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.receivedAt);
        const timeB = new Date(b.timestamp || b.receivedAt);
        return timeB - timeA;
      });
      
      console.log(`📤 BACKEND: Sending ${activeAlerts.length} alerts${driverName ? ` to driver ${driverName}` : ' to police dashboard'}`);
      
      res.json({
        success: true,
        count: activeAlerts.length,
        alerts: activeAlerts
      });
      
    } catch (error) {
      console.error('❌ Error fetching police alerts:', error);
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

