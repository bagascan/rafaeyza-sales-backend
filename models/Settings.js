const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  // Global settings for the application
  lowStockThreshold: {
    type: Number,
    default: 50, // Default value for low stock alert
    min: 0,
  },
  attendanceDistanceTolerance: {
    type: Number,
    default: 200, // Default value for attendance distance tolerance in meters
    min: 0,
  },
  // Add other settings here as needed
}, {
  timestamps: true,
});

// Ensure there's only one settings document in the collection
SettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({}); // Create a default settings document if none exists
  }
  return settings;
};

module.exports = mongoose.model('Settings', SettingsSchema);