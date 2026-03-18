// Toll gate alert routes
module.exports = (app) => {
  // Store alerts in memory (in production, use database)
  // Store alerts in memory (in production, use database)
  const tollAlerts = [];
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







  // Clear old alerts
  app.delete('/api/toll-alerts/clear', async (req, res) => {
    try {
      const tollCount = tollAlerts.length;

      tollAlerts.length = 0;
      res.json({
        success: true,
        message: `Cleared ${tollCount} toll alerts`
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

