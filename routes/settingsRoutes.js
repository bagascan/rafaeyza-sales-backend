const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/admin');

// @route   GET /api/settings
// @desc    Get application settings
// @access  Private (Admin only)
router.get('/', [auth, admin], async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/settings
// @desc    Update application settings
// @access  Private (Admin only)
router.put('/', [auth, admin], async (req, res) => {
  const { lowStockThreshold, attendanceDistanceTolerance } = req.body;

  try {
    let settings = await Settings.getSettings(); // Get the single settings document

    if (lowStockThreshold !== undefined) settings.lowStockThreshold = lowStockThreshold;
    if (attendanceDistanceTolerance !== undefined) settings.attendanceDistanceTolerance = attendanceDistanceTolerance;

    await settings.save();
    res.json(settings);
  } catch (err) {
    console.error('Error updating settings:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
