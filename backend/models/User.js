const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true 
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: { 
    type: String, 
    enum: {
      values: ['police', 'ambulance'],
      message: '{VALUE} is not a valid role'
    },
    required: [true, 'Role is required']
  },
  badgeNumber: {
    type: String,
    required: function() { return this.role === 'police'; }
  },
  licenseNumber: {
    type: String,
    required: function() { return this.role === 'ambulance'; }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  location: {
    type: {
      latitude: Number,
      longitude: Number
    },
    default: null
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
