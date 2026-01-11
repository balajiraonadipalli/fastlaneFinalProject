// Police Alert Routes
module.exports = (app) => {
  // In-memory storage for police alerts (replace with database in production)
  let policeAlerts = [];
  let alertIdCounter = 1;

  // POST /api/police-alert - Create new police alert when ambulance is nearby
  app.post('/api/police-alert', (req, res) => {
    try {
      const {
        policeId,
        policeName,
        area,
        ambulanceRole,
        driverName,
        distance,
        location,
        route,
        routeCoordinates,
        startLocation,
        endLocation,
        startAddress,
        endAddress,
        timestamp,
        forAllPolice
      } = req.body;

      // Create new alert
      const alert = {
        id: alertIdCounter++,
        policeId,
        policeName,
        area,
        ambulanceRole,
        driverName,
        distance,
        location,
        route,
        routeCoordinates: routeCoordinates || null,
        startLocation: startLocation || null,
        endLocation: endLocation || null,
        startAddress: startAddress || 'Unknown',
        endAddress: endAddress || 'Unknown',
        timestamp: timestamp || new Date().toISOString(),
        forAllPolice: forAllPolice || true,
        status: 'pending', // pending, responded, cleared
        createdAt: new Date().toISOString()
      };

      // Add to alerts array
      policeAlerts.push(alert);

      console.log(`🚔 New Police Alert Created:`, {
        id: alert.id,
        driver: driverName,
        area: area,
        distance: distance,
        status: alert.status,
        hasRoute: !!routeCoordinates,
        routePoints: routeCoordinates?.length || 0,
        startAddress: startAddress || 'N/A',
        endAddress: endAddress || 'N/A'
      });

      // Emit real-time alert via WebSocket if io is available
      const io = app.get('io');
      if (io) {
        io.emit('police:newAlert', alert);
        console.log(`📡 Alert broadcasted to all police users via WebSocket`);
      }

      res.json({
        success: true,
        message: 'Police alert created successfully',
        alert: alert
      });

    } catch (error) {
      console.error('❌ Error creating police alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create police alert',
        error: error.message
      });
    }
  });

  // GET /api/police-alerts - Get all active police alerts (visible to ALL logged-in police users)
  app.get('/api/police-alerts', (req, res) => {
    try {
      // Filter out old alerts (older than 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const activeAlerts = policeAlerts.filter(alert => {
        const alertTime = new Date(alert.timestamp || alert.createdAt);
        return alertTime > fifteenMinutesAgo;
      });

      // Update the policeAlerts array to only keep active alerts
      policeAlerts = activeAlerts;

      // Sort by timestamp (newest first)
      activeAlerts.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt);
        const timeB = new Date(b.timestamp || b.createdAt);
        return timeB - timeA;
      });

      console.log(`📋 Fetching police alerts: ${activeAlerts.length} active alerts`);
      console.log(`📊 Alert details:`, activeAlerts.map(a => ({
        id: a.id,
        driver: a.driverName,
        status: a.status,
        timestamp: a.timestamp || a.createdAt
      })));

      res.json({
        success: true,
        count: activeAlerts.length,
        alerts: activeAlerts
      });

    } catch (error) {
      console.error('❌ Error fetching police alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch police alerts',
        error: error.message
      });
    }
  });

  // POST /api/police-response - Police officer responds to alert
  app.post('/api/police-response', (req, res) => {
    try {
      const { alertId, trafficStatus, message, policeOfficer } = req.body;

      // Find the alert
      const alertIndex = policeAlerts.findIndex(alert => alert.id === parseInt(alertId));

      if (alertIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      // Update alert status
      policeAlerts[alertIndex].status = 'responded';
      policeAlerts[alertIndex].trafficStatus = trafficStatus;
      policeAlerts[alertIndex].policeResponse = message;
      policeAlerts[alertIndex].policeOfficer = policeOfficer;
      policeAlerts[alertIndex].respondedAt = new Date().toISOString();

      console.log(`✅ Police Response:`, {
        alertId: alertId,
        officer: policeOfficer,
        status: trafficStatus
      });

      // Emit response via WebSocket
      const io = app.get('io');
      if (io) {
        io.emit('police:response', {
          alert: policeAlerts[alertIndex],
          trafficStatus,
          message
        });
        console.log(`📡 Response broadcasted to ambulances via WebSocket`);
      }

      res.json({
        success: true,
        message: 'Response sent successfully',
        alert: policeAlerts[alertIndex]
      });

    } catch (error) {
      console.error('❌ Error sending police response:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send response',
        error: error.message
      });
    }
  });

  // DELETE /api/police-alerts/:id - Delete specific alert
  app.delete('/api/police-alerts/:id', (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      const alertIndex = policeAlerts.findIndex(alert => alert.id === alertId);

      if (alertIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      const deletedAlert = policeAlerts.splice(alertIndex, 1)[0];

      console.log(`🗑️ Alert deleted: ${alertId}`);

      res.json({
        success: true,
        message: 'Alert deleted successfully',
        alert: deletedAlert
      });

    } catch (error) {
      console.error('❌ Error deleting alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete alert',
        error: error.message
      });
    }
  });

  // GET /api/police-alerts/stats - Get statistics
  app.get('/api/police-alerts/stats', (req, res) => {
    try {
      const stats = {
        total: policeAlerts.length,
        pending: policeAlerts.filter(a => a.status === 'pending').length,
        responded: policeAlerts.filter(a => a.status === 'responded').length,
        cleared: policeAlerts.filter(a => a.status === 'cleared').length,
        byArea: {}
      };

      // Group by area
      policeAlerts.forEach(alert => {
        if (!stats.byArea[alert.area]) {
          stats.byArea[alert.area] = 0;
        }
        stats.byArea[alert.area]++;
      });

      res.json({
        success: true,
        stats: stats
      });

    } catch (error) {
      console.error('❌ Error getting stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get statistics',
        error: error.message
      });
    }
  });

  console.log('✅ Police routes loaded');
};





