const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const webpush = require('web-push');

// Konfigurasi web-push dengan kunci VAPID dari .env
webpush.setVapidDetails(
  'mailto:bagascndr@gmail.com', // Ganti dengan email Anda
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// @route   POST /api/notifications/subscribe
// @desc    Subscribe user to push notifications
// @access  Private
router.post('/subscribe', auth, async (req, res) => {
  const subscription = req.body;
  try {
    await User.findByIdAndUpdate(req.user.id, { pushSubscription: subscription });
    res.status(200).json({ msg: 'Langganan notifikasi berhasil.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/notifications/test-push
// @desc    Send a test push notification to the logged-in user
// @access  Private
router.post('/test-push', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.pushSubscription) {
            return res.status(404).json({ msg: 'Pengguna tidak berlangganan notifikasi.' });
        }

        const payload = JSON.stringify({
            title: 'Tes Notifikasi Push',
            body: 'Jika Anda melihat ini, notifikasi berfungsi dengan baik!',
            icon: '/logo192.png' // Ikon yang akan muncul di notifikasi
        });

        await webpush.sendNotification(user.pushSubscription, payload);
        res.status(200).json({ msg: 'Notifikasi tes terkirim.' });

    } catch (err) {
        console.error('Error sending test push:', err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
