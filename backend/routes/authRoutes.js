const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'fastlane_secret';

module.exports = (app) => {
  // Register
  app.post('/api/register', async (req, res) => {
    console.log('📝 Register request received:', { ...req.body, password: '***' });
    
    const { name, email, password, role, badgeNumber, licenseNumber } = req.body;
    
    try {
      // Validation
      if (!name || !email || !password || !role) {
        console.log('❌ Validation failed: Missing required fields');
        return res.status(400).json({ 
          success: false,
          message: 'All fields are required' 
        });
      }

      // Check if user exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        console.log('❌ User already exists:', email);
        return res.status(400).json({ 
          success: false,
          message: 'Email already registered' 
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('🔒 Password hashed successfully');

      // Create user object
      const userData = {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role
      };

      // Add role-specific fields
      if (role === 'police' && badgeNumber) {
        userData.badgeNumber = badgeNumber;
      }
      if (role === 'ambulance' && licenseNumber) {
        userData.licenseNumber = licenseNumber;
      }

      // Create and save user
      const user = new User(userData);
      const savedUser = await user.save();
      
      console.log('✅ User saved to database:', savedUser._id);
      console.log('📊 User details:', { 
        id: savedUser._id, 
        email: savedUser.email, 
        role: savedUser.role 
      });

      res.status(201).json({ 
        success: true,
        message: 'User registered successfully',
        user: {
          id: savedUser._id,
          name: savedUser.name,
          email: savedUser.email,
          role: savedUser.role
        }
      });
    } catch (err) {
      console.error('❌ Registration error:', err);
      res.status(500).json({ 
        success: false,
        message: 'Server error during registration',
        error: err.message 
      });
    }
  });

  // Login
  app.post('/api/login', async (req, res) => {
    console.log('🔐 Login request received:', { email: req.body.email, role: req.body.role });
    
    const { email, password, role } = req.body;
    
    try {
      // Validation
      if (!email || !password || !role) {
        return res.status(400).json({ 
          success: false,
          message: 'All fields are required' 
        });
      }

      // Find user
      const user = await User.findOne({ 
        email: email.toLowerCase(), 
        role 
      });

      if (!user) {
        console.log('❌ User not found:', email);
        return res.status(400).json({ 
          success: false,
          message: 'Invalid credentials' 
        });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log('❌ Password mismatch for:', email);
        return res.status(400).json({ 
          success: false,
          message: 'Invalid credentials' 
        });
      }

      // Generate token
      const token = jwt.sign(
        { userId: user._id, role: user.role }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
      );

      console.log('✅ Login successful:', user.email);

      res.json({ 
        success: true,
        message: 'Login successful',
        token, 
        user: { 
          id: user._id,
          name: user.name, 
          email: user.email, 
          role: user.role 
        } 
      });
    } catch (err) {
      console.error('❌ Login error:', err);
      res.status(500).json({ 
        success: false,
        message: 'Server error during login',
        error: err.message 
      });
    }
  });

  // Get all users (for debugging)
  app.get('/api/users', async (req, res) => {
    try {
      const users = await User.find().select('-password');
      console.log(`📋 Retrieved ${users.length} users from database`);
      res.json({ 
        success: true,
        count: users.length,
        users 
      });
    } catch (err) {
      console.error('❌ Error fetching users:', err);
      res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: err.message 
      });
    }
  });

  // Get all police users with their current locations
  app.get('/api/police/locations', async (req, res) => {
    try {
      const policeUsers = await User.find({ 
        role: 'police',
        isActive: true,
        location: { $ne: null } // Only users with location data
      }).select('name email badgeNumber location updatedAt');
      
      console.log(`🚔 Retrieved ${policeUsers.length} police users with locations`);
      
      res.json({ 
        success: true,
        count: policeUsers.length,
        police: policeUsers.map(user => ({
          id: user._id,
          name: user.name,
          email: user.email,
          badgeNumber: user.badgeNumber,
          location: user.location,
          lastUpdate: user.updatedAt
        }))
      });
    } catch (err) {
      console.error('❌ Error fetching police locations:', err);
      res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: err.message 
      });
    }
  });

  // Update police user location
  app.put('/api/police/location', async (req, res) => {
    try {
      const { userId, email, location } = req.body;
      
      if (!location || !location.latitude || !location.longitude) {
        return res.status(400).json({ 
          success: false,
          message: 'location (latitude, longitude) is required' 
        });
      }

      if (!userId && !email) {
        return res.status(400).json({ 
          success: false,
          message: 'userId or email is required' 
        });
      }

      // Find user by userId or email
      let user;
      if (userId) {
        user = await User.findById(userId);
        console.log(`🔍 Looking for user by ID: ${userId}, found: ${user ? 'yes' : 'no'}`);
      } else if (email) {
        user = await User.findOne({ email: email.toLowerCase(), role: 'police' });
        console.log(`🔍 Looking for user by email: ${email.toLowerCase()}, found: ${user ? 'yes' : 'no'}`);
        if (!user) {
          // Try without role filter in case role is not set correctly
          user = await User.findOne({ email: email.toLowerCase() });
          console.log(`🔍 Retrying without role filter, found: ${user ? 'yes' : 'no'}`);
        }
      }

      if (!user) {
        console.error(`❌ Police user not found - userId: ${userId}, email: ${email}`);
        return res.status(404).json({ 
          success: false,
          message: `Police user not found. Please make sure you are registered.`,
          debug: { userId, email }
        });
      }

      if (user.role !== 'police') {
        return res.status(400).json({ 
          success: false,
          message: 'User is not a police officer' 
        });
      }

      // Update location
      user.location = {
        latitude: location.latitude,
        longitude: location.longitude
      };
      await user.save();

      console.log(`📍 Updated location for police: ${user.name} (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`);

      res.json({ 
        success: true,
        message: 'Location updated successfully',
        user: {
          id: user._id,
          name: user.name,
          location: user.location
        }
      });
    } catch (err) {
      console.error('❌ Error updating police location:', err);
      res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: err.message 
      });
    }
  });

  // Delete all users (for testing - remove in production!)
  app.delete('/api/users/clear', async (req, res) => {
    try {
      const result = await User.deleteMany({});
      console.log(`🗑️ Deleted ${result.deletedCount} users`);
      res.json({ 
        success: true,
        message: `Deleted ${result.deletedCount} users` 
      });
    } catch (err) {
      console.error('❌ Error clearing users:', err);
      res.status(500).json({ 
        success: false,
        message: 'Server error',
        error: err.message 
      });
    }
  });
};
