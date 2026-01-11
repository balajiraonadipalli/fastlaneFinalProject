const mongoose = require('mongoose');

const TrafficLightSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    latitude: { type: Number, required: true, index: true },
    longitude: { type: Number, required: true, index: true },
    junctionType: { type: String, enum: ['three-way', 'four-way', 'roundabout'], default: 'three-way' },
    roads: { type: [String], default: [] },
    city: { type: String },

    // Signal runtime state (optional if frontend simulates)
    status: { type: String, enum: ['red', 'yellow', 'green'], default: 'red' },
    currentPhase: { type: String, enum: ['red', 'yellow', 'green'], default: 'red' },
    timeRemaining: { type: Number, default: 30 },
    isEmergency: { type: Boolean, default: false },

    // Timing configuration
    timing: {
      red: { type: Number, default: 30 },
      yellow: { type: Number, default: 5 },
      green: { type: Number, default: 25 }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrafficLight', TrafficLightSchema);



