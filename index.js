
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');

// Web-push VAPID keys
const webpush = require('web-push');
webpush.setVapidDetails(
  'mailto:bagascndr@gmail.com', // Ganti dengan email Anda
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Connect to Database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Konfigurasi CORS yang lebih aman untuk produksi
const corsOptions = {
  // Izinkan hanya domain frontend Anda dan port pengembangan lokal
  origin: [process.env.FRONTEND_URL, 'http://localhost:3000'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json()); // For parsing application/json

// NEW: Enable pre-flight across-the-board
app.options('*', cors(corsOptions));

// Define Routes
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/visits', require('./routes/visitRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/users', require('./routes/userRoutes')); // Tambahkan ini
app.use('/api/settings', require('./routes/settingsRoutes')); // NEW: Register settings routes
app.use('/api/cron', require('./routes/cronRoutes')); // Daftarkan rute cron baru
app.use('/api/maps', require('./routes/mapRoutes'));
// Basic route
app.get('/', (req, res) => {
  res.send('Rafaeyza Sales Backend API is running!');
});

// --- BLOK FRONTEND (HARUS DI AKHIR SEBELUM EXPORT) ---
// Jalankan server HANYA jika tidak di lingkungan Vercel (untuk pengembangan lokal)
if (process.env.VERCEL_ENV !== 'production') {
  const buildPath = path.resolve(__dirname, '../build');
  app.use(express.static(buildPath));

  // Rute ini hanya akan menangani permintaan yang BUKAN API
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.resolve(buildPath, 'index.html'));
  });

  // Start the server HANYA jika file ini dieksekusi secara langsung (bukan diimpor oleh Vercel)
  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
}
// --- AKHIR BLOK FRONTEND ---

module.exports = app; // Selalu export app untuk Vercel dan untuk testing
