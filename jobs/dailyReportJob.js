const cron = require('node-cron');
const webpush = require('web-push');
const User = require('../models/User');
const Visit = require('../models/Visit');

// Fungsi untuk mengirim notifikasi ke semua admin
const sendReportToAdmins = async () => {
  console.log('Menjalankan tugas laporan harian...');

  try {
    // 1. Dapatkan rentang waktu untuk hari ini
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 2. Hitung total penjualan dan jumlah kunjungan hari ini
    const visitsToday = await Visit.find({
      createdAt: { $gte: today, $lt: tomorrow },
    }).populate('inventory.product', 'price');

    let totalSalesToday = 0;
    visitsToday.forEach(visit => {
      visit.inventory.forEach(item => {
        const sold = (item.initialStock + (item.addedStock || 0)) - item.finalStock - item.returns;
        if (sold > 0 && item.product) {
          totalSalesToday += sold * item.product.price;
        }
      });
    });
    const visitCount = visitsToday.length;

    // 3. Dapatkan semua admin yang berlangganan notifikasi
    const admins = await User.find({ role: 'admin', pushSubscription: { $ne: null } });
    if (admins.length === 0) {
      console.log('Tidak ada admin yang berlangganan notifikasi. Tugas selesai.');
      return;
    }

    // 4. Siapkan payload notifikasi
    const payload = JSON.stringify({
      title: 'Laporan Penjualan Harian',
      body: `Total penjualan hari ini: Rp ${totalSalesToday.toLocaleString('id-ID')} dari ${visitCount} kunjungan.`,
      icon: '/logo192.png',
    });

    // 5. Kirim notifikasi ke setiap admin
    for (const admin of admins) {
      try {
        await webpush.sendNotification(admin.pushSubscription, payload);
        console.log(`Notifikasi laporan terkirim ke ${admin.name}`);
      } catch (error) {
        console.error(`Gagal mengirim notifikasi ke ${admin.name}:`, error.message);
        // Di sini Anda bisa menambahkan logika untuk menghapus langganan yang sudah tidak valid
      }
    }

  } catch (error) {
    console.error('Error saat menjalankan tugas laporan harian:', error);
  }
};

// Jadwalkan tugas untuk berjalan setiap hari jam 5 sore (17:00)
// Format: 'menit jam hari_dalam_bulan bulan hari_dalam_minggu'
// '*' berarti setiap
const scheduleDailyReport = () => {
  cron.schedule('0 17 * * *', () => {
    sendReportToAdmins();
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });

  console.log('Tugas laporan harian terjadwal setiap jam 17:00 WIB.');
};

module.exports = scheduleDailyReport;
