// Police Alert Routes
module.exports = (app) => {
  // In-memory storage for police alerts (replace with database in production)
  let policeAlerts = [];
  let alertIdCounter = 1;

  // POST /api/police-alert - Create new police alert when ambulance is nearby
  app.post('/api/police-alert', (req, res) => {
    try {
      console.log('\n🚨 === BACKEND: RECEIVING POLICE ALERT ===');
      console.log('📦 Request body received:');
      console.log('  - driverName:', req.body.driverName);
      console.log('  - location (ambulance current position):', req.body.location);
      console.log('  - startLocation (journey start):', req.body.startLocation);
      console.log('  - endLocation (destination):', req.body.endLocation);
      console.log('  - startAddress:', req.body.startAddress);
      console.log('  - endAddress:', req.body.endAddress);
      console.log('  - routeCoordinates:', req.body.routeCoordinates ? `${req.body.routeCoordinates.length} points` : 'NULL');
      
      const {
        policeId,
        policeName,
        area,
        ambulanceRole,
        driverName,
        distance,
        location, // CRITICAL: Ambulance's current real-time position (for map marker)
        route,
        routeCoordinates,
        startLocation, // Where journey started
        endLocation, // Destination
        startAddress,
        endAddress,
        timestamp,
        forAllPolice
      } = req.body;

      // CRITICAL: Validate that both source and destination addresses are provided
      if (!startAddress || startAddress.trim() === '' || startAddress.toLowerCase() === 'unknown' ||
          !endAddress || endAddress.trim() === '' || endAddress.toLowerCase() === 'unknown') {
        console.error('❌ BACKEND: Rejecting alert - Missing source or destination address');
        console.error('  - startAddress:', startAddress);
        console.error('  - endAddress:', endAddress);
        return res.status(400).json({
          success: false,
          message: 'Cannot create alert: Missing source or destination address',
          error: 'Both startAddress and endAddress are required'
        });
      }

      // CRITICAL: Validate that all required locations are provided
      if (!location || !location.latitude || !location.longitude) {
        console.error('❌ BACKEND: Rejecting alert - Missing ambulance current location');
        console.error('  - location:', location);
        return res.status(400).json({
          success: false,
          message: 'Cannot create alert: Missing ambulance current location',
          error: 'location (ambulance current position) is required'
        });
      }
      
      if (!startLocation || !startLocation.latitude || !startLocation.longitude) {
        console.error('❌ BACKEND: Rejecting alert - Missing start location');
        console.error('  - startLocation:', startLocation);
        return res.status(400).json({
          success: false,
          message: 'Cannot create alert: Missing start location',
          error: 'startLocation is required'
        });
      }
      
      if (!endLocation || !endLocation.latitude || !endLocation.longitude) {
        console.error('❌ BACKEND: Rejecting alert - Missing end location');
        console.error('  - endLocation:', endLocation);
        return res.status(400).json({
          success: false,
          message: 'Cannot create alert: Missing end location',
          error: 'endLocation is required'
        });
      }

      // Create new alert with validated data
      const alert = {
        id: alertIdCounter++,
        policeId,
        policeName,
        area,
        ambulanceRole,
        driverName,
        distance,
        location: location, // CRITICAL: Ambulance's current real-time position (for map marker)
        route,
        routeCoordinates: routeCoordinates || null,
        startLocation: startLocation, // Required - where journey started
        endLocation: endLocation, // Required - destination
        startAddress: startAddress, // Required - already validated
        endAddress: endAddress, // Required - already validated
        timestamp: timestamp || new Date().toISOString(),
        forAllPolice: forAllPolice || true,
        status: 'pending', // pending, responded, cleared, acknowledged
        trafficStatus: null, // Will be set to 'accepted' or 'rejected' when police responds
        createdAt: new Date().toISOString()
      };

      console.log('✅ BACKEND: Alert created successfully:');
      console.log('  - Alert ID:', alert.id);
      console.log('  - location (ambulance current):', alert.location ? `lat:${alert.location.latitude}, lng:${alert.location.longitude}` : 'MISSING');
      console.log('  - startLocation:', alert.startLocation ? `lat:${alert.startLocation.latitude}, lng:${alert.startLocation.longitude}` : 'MISSING');
      console.log('  - endLocation:', alert.endLocation ? `lat:${alert.endLocation.latitude}, lng:${alert.endLocation.longitude}` : 'MISSING');
      console.log('  - startAddress:', alert.startAddress);
      console.log('  - endAddress:', alert.endAddress);
      console.log('  - Has route:', !!alert.routeCoordinates);
      console.log('  - Route points:', alert.routeCoordinates?.length || 0);

      // Add to alerts array
      policeAlerts.push(alert);

      console.log(`🚔 BACKEND: New Police Alert Created:`, {
        id: alert.id,
        driver: driverName,
        area: area,
        distance: distance,
        status: alert.status,
        hasRoute: !!routeCoordinates,
        routePoints: routeCoordinates?.length || 0,
        location: alert.location ? `lat:${alert.location.latitude}, lng:${alert.location.longitude}` : 'MISSING',
        startLocation: alert.startLocation ? `lat:${alert.startLocation.latitude}, lng:${alert.startLocation.longitude}` : 'MISSING',
        endLocation: alert.endLocation ? `lat:${alert.endLocation.latitude}, lng:${alert.endLocation.longitude}` : 'MISSING',
        startAddress: alert.startAddress,
        endAddress: alert.endAddress
      });
      console.log('=== END BACKEND ALERT CREATION ===\n');

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
  // Optional query param: driverName - to filter alerts for specific ambulance driver
  app.get('/api/police-alerts', (req, res) => {
    try {
      const { driverName } = req.query;
      console.log(`\n📥 BACKEND: GET /api/police-alerts called${driverName ? ` (for driver: ${driverName})` : ' (all alerts)'}`);
      console.log(`📥 Query params:`, req.query);
      
      // Filter out old alerts (older than 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      console.log(`\n📊 BACKEND: GET /api/police-alerts - Total alerts in array: ${policeAlerts.length}`);
      console.log(`⏰ Filtering alerts older than: ${fifteenMinutesAgo.toISOString()}`);
      
      let activeAlerts = policeAlerts.filter(alert => {
        const alertTime = new Date(alert.timestamp || alert.createdAt);
        const isRecent = alertTime > fifteenMinutesAgo;
        if (!isRecent) {
          console.log(`  ⏰ Alert #${alert.id} filtered out (too old): ${alertTime.toISOString()}`);
        }
        return isRecent;
      });
      
      console.log(`📊 After time filter: ${activeAlerts.length} alerts`);
      activeAlerts.forEach(a => {
        console.log(`  Alert #${a.id}: driver="${a.driverName}", status="${a.status}", trafficStatus="${a.trafficStatus || 'none'}", time="${a.timestamp || a.createdAt}"`);
      });

      // If driverName is provided, filter alerts for that specific driver (for ambulance polling)
      if (driverName) {
        console.log(`\n🔍 BACKEND: Filtering alerts for driver: ${driverName}`);
        console.log(`📊 Total alerts before filtering: ${activeAlerts.length}`);
        activeAlerts.forEach(a => {
          console.log(`  Alert #${a.id}: driverName="${a.driverName}", status="${a.status}", trafficStatus="${a.trafficStatus || 'none'}"`);
        });
        
        activeAlerts = activeAlerts.filter(alert => 
          alert.driverName && alert.driverName.toLowerCase() === driverName.toLowerCase()
        );
        
        console.log(`📊 After driverName filter: ${activeAlerts.length} alerts`);
        activeAlerts.forEach(a => {
          console.log(`  ✅ Alert #${a.id}: status="${a.status}", trafficStatus="${a.trafficStatus || 'none'}", respondedAt="${a.respondedAt || 'none'}", driverName="${a.driverName}"`);
        });
        
        // CRITICAL: Check if we have any acknowledged alerts that should be returned
        const acknowledgedAlerts = activeAlerts.filter(a => 
          a.status === 'acknowledged' || a.trafficStatus === 'accepted' || a.trafficStatus === 'rejected'
        );
        if (acknowledgedAlerts.length > 0) {
          console.log(`\n🎯 BACKEND: Found ${acknowledgedAlerts.length} acknowledged alert(s) for driver ${driverName}:`);
          acknowledgedAlerts.forEach(a => {
            console.log(`  ✅ Alert #${a.id}: status="${a.status}", trafficStatus="${a.trafficStatus}", respondedAt="${a.respondedAt}"`);
          });
        } else {
          console.log(`\n⚠️ BACKEND: NO acknowledged alerts found for driver ${driverName} in activeAlerts`);
          console.log(`  All ${activeAlerts.length} alerts have status:`, activeAlerts.map(a => `#${a.id}=${a.status}`).join(', '));
        }
      }

      // Update the policeAlerts array to only keep active alerts (only if not filtering by driver)
      if (!driverName) {
        policeAlerts = policeAlerts.filter(alert => {
          const alertTime = new Date(alert.timestamp || alert.createdAt);
          return alertTime > fifteenMinutesAgo;
        });
      }

      // Sort by timestamp (newest first)
      activeAlerts.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt);
        const timeB = new Date(b.timestamp || b.createdAt);
        return timeB - timeA;
      });

      // Log what we're sending to police dashboard
      console.log(`\n📤 BACKEND: Sending ${activeAlerts.length} alerts to police dashboard`);
      activeAlerts.forEach((alert, index) => {
        console.log(`  Alert #${index + 1} (ID: ${alert.id}):`);
        console.log(`    - driverName: ${alert.driverName}`);
        console.log(`    - location: ${alert.location ? `lat:${alert.location.latitude}, lng:${alert.location.longitude}` : 'MISSING ❌'}`);
        console.log(`    - startLocation: ${alert.startLocation ? `lat:${alert.startLocation.latitude}, lng:${alert.startLocation.longitude}` : 'MISSING ❌'}`);
        console.log(`    - endLocation: ${alert.endLocation ? `lat:${alert.endLocation.latitude}, lng:${alert.endLocation.longitude}` : 'MISSING ❌'}`);
        console.log(`    - routeCoordinates: ${alert.routeCoordinates ? `${alert.routeCoordinates.length} points` : 'NULL'}`);
        console.log(`    - startAddress: ${alert.startAddress || 'MISSING'}`);
        console.log(`    - endAddress: ${alert.endAddress || 'MISSING'}`);
      });
      console.log('=== END BACKEND ALERT RESPONSE ===\n');

      // Calculate stats
      const stats = {
        total: activeAlerts.length,
        pending: activeAlerts.filter(a => a.status === 'pending').length,
        responded: activeAlerts.filter(a => a.status === 'responded' || a.status === 'acknowledged').length,
        acknowledged: activeAlerts.filter(a => a.status === 'acknowledged').length,
      };

      console.log(`📋 Fetching police alerts: ${activeAlerts.length} active alerts${driverName ? ` (for driver: ${driverName})` : ''}`);
      console.log(`📊 Stats:`, stats);
      console.log(`📊 Alert details being sent:`, activeAlerts.map(a => ({
        id: a.id,
        driver: a.driverName,
        status: a.status,
        trafficStatus: a.trafficStatus || 'none',
        policeResponse: a.policeResponse ? a.policeResponse.substring(0, 50) + '...' : null,
        policeOfficer: a.policeOfficer || 'none',
        respondedAt: a.respondedAt || 'none',
        acknowledgedAt: a.acknowledgedAt || 'none',
        timestamp: a.timestamp || a.createdAt
      })));
      
      // CRITICAL: Log if we're sending responded alerts
      if (driverName) {
        const hasResponded = activeAlerts.some(a => 
          a.status === 'acknowledged' || a.status === 'responded' || 
          a.trafficStatus === 'accepted' || a.trafficStatus === 'rejected'
        );
        if (hasResponded) {
          console.log(`\n✅ BACKEND: SENDING RESPONDED ALERTS to ambulance driver ${driverName}`);
        } else {
          console.log(`\n⚠️ BACKEND: NO RESPONDED ALERTS in response for driver ${driverName}`);
          console.log(`  All alerts have status:`, activeAlerts.map(a => `Alert #${a.id}: ${a.status}`).join(', '));
        }
      }
      
      // If filtering by driverName, log all responded alerts
      if (driverName) {
        const respondedAlerts = activeAlerts.filter(a => 
          a.status === 'acknowledged' || a.status === 'responded' || 
          a.trafficStatus === 'accepted' || a.trafficStatus === 'rejected'
        );
        if (respondedAlerts.length > 0) {
          console.log(`\n🎉 BACKEND: FOUND ${respondedAlerts.length} RESPONDED ALERT(S) for driver ${driverName}:`);
          respondedAlerts.forEach(a => {
            console.log(`  ✅ Alert #${a.id}: Status=${a.status}, TrafficStatus=${a.trafficStatus}, Officer=${a.policeOfficer}, RespondedAt=${a.respondedAt || 'none'}`);
          });
        } else {
          console.log(`\n⚠️ BACKEND: NO RESPONDED ALERTS found for driver ${driverName}`);
          console.log(`  All ${activeAlerts.length} alerts for this driver:`, activeAlerts.map(a => ({
            id: a.id,
            status: a.status,
            trafficStatus: a.trafficStatus || 'none',
            respondedAt: a.respondedAt || 'none'
          })));
        }
      }

      console.log(`\n📤 BACKEND: Sending response with ${activeAlerts.length} alerts${driverName ? ` to driver ${driverName}` : ''}`);
      
      // CRITICAL: Log the exact data being sent in the response
      if (driverName) {
        console.log(`\n🔍 BACKEND: EXACT ALERT DATA BEING SENT TO AMBULANCE:`);
        activeAlerts.forEach(alert => {
          console.log(`  📋 Alert #${alert.id}:`, {
            id: alert.id,
            driverName: alert.driverName,
            status: alert.status,
            trafficStatus: alert.trafficStatus,
            policeResponse: alert.policeResponse,
            policeOfficer: alert.policeOfficer,
            respondedAt: alert.respondedAt,
            acknowledgedAt: alert.acknowledgedAt,
            timestamp: alert.timestamp
          });
        });
      }
      
      res.json({
        success: true,
        count: activeAlerts.length,
        alerts: activeAlerts,
        stats: stats
      });
      console.log(`✅ BACKEND: Response sent successfully\n`);

    } catch (error) {
      console.error('❌ Error fetching police alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch police alerts',
        error: error.message
      });
    }
  });

  // POST /api/police-response - Police officer responds to alert (Accept/Reject)
  app.post('/api/police-response', (req, res) => {
    try {
      const { alertId, trafficStatus, message, policeOfficer } = req.body;

      // Find the alert - try both string and number comparison
      const alertIndex = policeAlerts.findIndex(alert => {
        return alert.id === parseInt(alertId) || alert.id === alertId;
      });

      if (alertIndex === -1) {
        console.error(`❌ BACKEND: Alert #${alertId} not found in array!`);
        console.error(`📊 Current alerts in array (${policeAlerts.length} total):`, policeAlerts.map(a => ({ 
          id: a.id, 
          driverName: a.driverName,
          status: a.status,
          trafficStatus: a.trafficStatus 
        })));
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      // Update alert status based on trafficStatus
      // Mark as 'acknowledged' to prevent ambulance from sending duplicate requests
      // 'accepted' -> status: 'acknowledged', trafficStatus: 'accepted'
      // 'rejected' -> status: 'acknowledged', trafficStatus: 'rejected'
      // 'clear' or 'busy' -> legacy support, also marked as acknowledged
      console.log(`\n🔧 BACKEND: Updating alert #${alertId} with trafficStatus: ${trafficStatus}`);
      console.log(`📋 Before update:`, {
        status: policeAlerts[alertIndex].status,
        trafficStatus: policeAlerts[alertIndex].trafficStatus,
        driverName: policeAlerts[alertIndex].driverName
      });
      
      if (trafficStatus === 'accepted' || trafficStatus === 'rejected') {
        policeAlerts[alertIndex].status = 'acknowledged';
        policeAlerts[alertIndex].trafficStatus = trafficStatus;
        policeAlerts[alertIndex].policeResponse = message || (trafficStatus === 'accepted' ? 'Route approved. You can proceed.' : 'Route rejected. Please take another way.');
        policeAlerts[alertIndex].policeOfficer = policeOfficer;
        policeAlerts[alertIndex].respondedAt = new Date().toISOString();
        policeAlerts[alertIndex].acknowledgedAt = new Date().toISOString();
      } else {
        // Legacy support for 'clear' and 'busy'
        policeAlerts[alertIndex].status = 'acknowledged';
        policeAlerts[alertIndex].trafficStatus = trafficStatus;
        policeAlerts[alertIndex].policeResponse = message;
        policeAlerts[alertIndex].policeOfficer = policeOfficer;
        policeAlerts[alertIndex].respondedAt = new Date().toISOString();
        policeAlerts[alertIndex].acknowledgedAt = new Date().toISOString();
      }
      
      console.log(`📋 After update:`, {
        status: policeAlerts[alertIndex].status,
        trafficStatus: policeAlerts[alertIndex].trafficStatus,
        driverName: policeAlerts[alertIndex].driverName,
        respondedAt: policeAlerts[alertIndex].respondedAt,
        acknowledgedAt: policeAlerts[alertIndex].acknowledgedAt
      });
      console.log(`✅ BACKEND: Alert #${alertId} updated successfully - Status: ${policeAlerts[alertIndex].status}, TrafficStatus: ${policeAlerts[alertIndex].trafficStatus}`);

      console.log(`✅ Police Response:`, {
        alertId: alertId,
        officer: policeOfficer,
        status: trafficStatus,
        message: message
      });

      // Emit response via WebSocket to ambulance
      const io = app.get('io');
      if (io) {
        io.emit('police:response', {
          alert: policeAlerts[alertIndex],
          trafficStatus,
          message: message || (trafficStatus === 'accepted' ? 'Route approved. You can proceed.' : 'Route rejected. Please take another way.'),
          driverName: policeAlerts[alertIndex].driverName,
          alertId: alertId
        });
        console.log(`📡 Response broadcasted to ambulance driver: ${policeAlerts[alertIndex].driverName}`);
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





