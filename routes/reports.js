const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // Middleware otentikasi Anda
const admin = require('../middleware/admin'); // Middleware otorisasi admin Anda
const Visit = require('../models/Visit'); // Model Visit Anda

/**
 * @route   GET /api/reports/visits-by-date
 * @desc    Get all visits on a specific date for route report
 * @access  Private (Admin only)
 */
router.get('/visits-by-date', [auth, admin], async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ msg: 'Parameter tanggal diperlukan.' });
  }

  try {
    // Membuat rentang waktu untuk satu hari penuh (dari awal hingga akhir hari)
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Mencari semua kunjungan dalam rentang waktu tersebut
    const visits = await Visit.find({
      // Gunakan 'createdAt' atau 'visitTime' sesuai dengan field di model Anda
      createdAt: { $gte: startDate, $lte: endDate }, 
    })
    .populate({
        path: 'customer',
        select: 'name location', // Hanya ambil nama dan lokasi dari pelanggan
    })
    .populate({
        path: 'user',
        select: 'name', // FIX: Ensure user name is populated
    })
    .sort({ createdAt: 'asc' }); // Urutkan berdasarkan waktu untuk rute yang benar

    res.json(visits);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   GET /api/reports/sales-performance
 * @desc    Get performance report for a specific sales user in a date range
 * @access  Private (Admin only)
 */
router.get('/sales-performance', [auth], async (req, res) => { // Hapus middleware 'admin'
  const { startDate, endDate } = req.query;
  let { userId } = req.query;

  // Logika untuk menentukan userId berdasarkan peran pengguna
  // Asumsi: req.user.role tersedia dari middleware auth
  if (req.user.role !== 'admin') {
    userId = req.user.id; // Jika bukan admin, paksa gunakan ID pengguna yang login
  }

  // Validasi parameter
  if (!userId) {
    return res.status(400).json({ msg: 'Parameter userId diperlukan.' });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ msg: 'Parameter startDate dan endDate diperlukan.' });
  }
  try {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Query untuk mencari kunjungan berdasarkan sales dan rentang tanggal
    const query = {
      user: userId,
      createdAt: { $gte: start, $lte: end },
    };

    const visits = await Visit.find(query)
      .populate('customer', 'name')
      .populate('inventory.product', 'price profit') // FIX: Also populate the 'profit' field
      .sort({ createdAt: -1 });

    // Calculate total sales and total profit from the found visits
    let totalSales = 0;
    let totalProfit = 0;

    visits.forEach(visit => {
      visit.inventory.forEach(item => {
        // FIX: Use the correct sales calculation logic.
        // `addedStock` is for the next cycle and should not be part of the current sale.
        const sold = item.initialStock - (item.finalStock + item.returns);
        if (sold > 0 && item.product) {
          totalSales += sold * (item.product.price || 0);
          totalProfit += sold * (item.product.profit || 0);
        }
      });
    });

    res.json({
      summary: {
        totalSales,
        totalProfit, // FIX: Include totalProfit in the response
        visitCount: visits.length,
      },
      visits, // Kirim juga daftar detail kunjungannya
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   GET /api/reports/product-stock
 * @desc    Get stock report for a specific product
 * @access  Private (Admin only)
 */
router.get('/product-stock', [auth, admin], async (req, res) => {
  const { productId } = req.query;

  if (!productId) {
    return res.status(400).json({ msg: 'Parameter productId diperlukan.' });
  }

  try {
    // 1. Dapatkan semua kunjungan yang melibatkan produk ini
    const visits = await Visit.find({ 'inventory.product': productId })
      .sort({ customer: 1, createdAt: -1 }) // Urutkan per pelanggan, dari yang terbaru
      .populate('customer', 'name');

    // 2. Proses data untuk mendapatkan stok terakhir per pelanggan
    const stockByCustomer = {};
    let totalStockOutside = 0;
    let totalSold = 0;

    for (const visit of visits) {
      const customerId = visit.customer._id.toString();
      // Hanya proses kunjungan terakhir untuk setiap pelanggan
      if (!stockByCustomer[customerId]) {
        const productItem = visit.inventory.find(item => item.product.toString() === productId);
        if (productItem) {
          stockByCustomer[customerId] = {
            customerName: visit.customer.name,
            lastVisitDate: visit.createdAt,
            finalStock: productItem.finalStock,
          };
          totalStockOutside += productItem.finalStock;
        }
      }
      // Hitung total terjual dari semua kunjungan
      const productItemInVisit = visit.inventory.find(item => item.product.toString() === productId);
      if (productItemInVisit) {
        // FIX: Use the correct sales calculation logic.
        const sold = productItemInVisit.initialStock - (productItemInVisit.finalStock + productItemInVisit.returns);

        if (sold > 0) {
          totalSold += sold;
        }
      }
    }

    const customersWithStock = Object.values(stockByCustomer).filter(c => c.finalStock > 0);

    res.json({ totalStockOutside, totalSold, customersWithStock });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
