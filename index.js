
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
app.use(cors());
app.use(express.json()); // For parsing application/json

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

// Basic route
app.get('/', (req, res) => {
  res.send('Rafaeyza Sales Backend API is running!');
});

// --- BLOK FRONTEND (HARUS DI AKHIR SEBELUM EXPORT) ---
// Sajikan aplikasi React yang sudah di-build HANYA untuk lingkungan produksi lokal
if (process.env.NODE_ENV !== 'vercel') {
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

module.exports = app; // Export the app for Vercel
