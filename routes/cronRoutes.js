const express = require('express');
const router = express.Router();
const scheduleDailyReport = require('../jobs/dailyReportJob');
const scheduleStockAlert = require('../jobs/stockAlertJob');

// Endpoint ini akan dipanggil oleh Vercel Cron Job
// Kita tambahkan sedikit keamanan dasar agar tidak bisa dipanggil sembarang orang
router.get('/trigger', (req, res) => {
  // Ambil secret dari header atau query parameter
  const authHeader = req.headers['authorization'];
  const secret = authHeader && authHeader.split(' ')[1];

  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  console.log('CRON: Menjalankan tugas terjadwal secara manual...');
  
  // Jalankan fungsi cron job di sini
  // Catatan: Fungsi ini akan berjalan sekali saat endpoint ini dipanggil.
  // Vercel yang akan bertanggung jawab memanggil endpoint ini sesuai jadwal.
  scheduleDailyReport(); // Ini mungkin perlu diubah jika fungsinya bersifat async
  scheduleStockAlert();  // Ini juga

  res.status(200).json({ message: 'Cron jobs triggered successfully.' });
});

module.exports = router;
