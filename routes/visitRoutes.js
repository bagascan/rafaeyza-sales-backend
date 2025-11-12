
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Visit = require('../models/Visit');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const User = require('../models/User'); // 1. Import model User
const auth = require('../middleware/authMiddleware');
const webpush = require('web-push'); // 2. Import web-push

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Haversine formula to calculate distance between two lat/lon points in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  return distance;
}

// @route   POST api/visits
// @desc    Create a new visit record with photo uploads
// @access  Private
router.post('/', auth, upload.any(), async (req, res) => {
  try {
    const { customerId, inventory: inventoryJSON, salesLatitude, salesLongitude } = req.body;
    const attendancePhoto = req.files.find(file => file.fieldname === 'attendancePhoto');

    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ msg: 'Customer not found' });
    }

    // --- ATTENDANCE VALIDATION ---
    if (!customer.location || !customer.location.latitude || !customer.location.longitude) {
      return res.status(400).json({ msg: 'Data lokasi pelanggan tidak ditemukan. Mohon update data pelanggan.' });
    }

    // --- NEW: Get the attendance distance tolerance from settings ---
    const settings = await Settings.getSettings();
    const attendanceDistanceTolerance = settings.attendanceDistanceTolerance;
    const distance = calculateDistance(
      parseFloat(salesLatitude),
      parseFloat(salesLongitude),
      customer.location.latitude,
      customer.location.longitude
    );

    if (distance > attendanceDistanceTolerance) { // Use dynamic tolerance
      return res.status(400).json({ msg: `Jarak Anda terlalu jauh dari lokasi pelanggan (${distance.toFixed(0)} meter). Absensi ditolak.` });
    }

    // Parse inventory data from JSON string
    const inventory = JSON.parse(inventoryJSON);

    // Process and validate inventory products
    const validatedInventory = [];
    let totalProfit = 0; // Initialize total profit for this visit
    for (const item of inventory) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ msg: `Product with ID ${item.product} not found` }); // Corrected
      }

      validatedInventory.push({
        product: product._id,
        initialStock: item.initialStock,
        addedStock: item.addedStock || 0, // Capture added stock
        finalStock: item.finalStock,
        returns: item.returns,
        // We don't store profit per item here, but calculate it for totalProfit
      });

      // Corrected sales calculation logic
      const sold = (item.initialStock + (item.addedStock || 0)) - item.finalStock - item.returns;
      // FIX: Use the 'profit' field from the product model instead of calculating from costPrice
      if (sold > 0 && product.profit > 0) totalProfit += sold * product.profit;
    }

    // Process uploaded files
    const photos = {};
    if (req.files) {
        req.files.forEach(file => {
            // Filename format is 'photo_PRODUCTID_before' or 'photo_PRODUCTID_after'
            const parts = file.fieldname.split('_');
            const productId = parts[1];
            const type = parts[2]; // 'before' or 'after'

            if (!photos[productId]) {
                photos[productId] = { before: [], after: [] };
            }
            // Handle attendance photo separately
            if (file.fieldname === 'attendancePhoto') {
              // You might want to store this differently, e.g., on the root of the visit document
              return;
            }
            photos[productId][type].push(file.path);
        });
    }

    const newVisit = new Visit({
      user: req.user.id,
      customer: customer._id,
      inventory: validatedInventory,
      totalProfit: totalProfit, // Save the calculated total profit
      photos: {
        ...photos,
        attendance: attendancePhoto ? [attendancePhoto.path] : [], // Save attendance photo path
      },
    });

    const savedVisit = await newVisit.save();

    // **fore sending it back to the client. This ensures the receipt page gets complete data.
    const populatedVisit = await Visit.findById(savedVisit._id)
      .populate('customer', 'name address')
      .populate('user', 'name')
      .populate('inventory.product', 'name price'); // <-- TAMBAHKAN BARIS INI

    // --- NEW: Send notification to all admins ---
    try {
      const admins = await User.find({ role: 'admin', pushSubscription: { $ne: null } });
      if (admins.length > 0) {
        const payload = JSON.stringify({
          title: 'Kunjungan Baru Disimpan',
          body: `Sales ${populatedVisit.user.name} telah menyelesaikan kunjungan di ${populatedVisit.customer.name}.`,
          icon: '/logo192.png', // Pastikan ikon ini ada di folder public frontend Anda
        });

        for (const admin of admins) {
          webpush.sendNotification(admin.pushSubscription, payload).catch(error => {
            console.error(`Gagal mengirim notifikasi ke ${admin.name}:`, error.message);
            // Opsional: Tambahkan logika untuk menghapus langganan yang tidak valid (misalnya, jika error.statusCode === 410)
          });
        }
      }
    } catch (notificationError) {
      // Jangan gagalkan permintaan utama jika notifikasi gagal
      console.error('Gagal memproses pengiriman notifikasi kunjungan:', notificationError.message);
    }

    res.status(201).json(populatedVisit);
  } catch (err) {
    console.error('Error creating visit:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/visits
// @desc    Get all visit records
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    // If the user is not an admin, only show their own data
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    // If startDate and endDate are provided, add them to the query
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) // Set to end of day
      };
    }

    // This is a complex search. We need to search by customer name, which is in another collection.
    // We will use an aggregation pipeline.
    const pipeline = [];

    // Initial match for user and date range
    pipeline.push({ $match: query });

    // Lookup customer details
    pipeline.push({ $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'customerDetails' } });
    pipeline.push({ $unwind: '$customerDetails' });

    // Match by search term (customer name)
    if (search) {
      pipeline.push({ $match: { 'customerDetails.name': { $regex: search, $options: 'i' } } });
    }

    const totalVisits = (await Visit.aggregate([...pipeline, { $count: 'total' }]))[0]?.total || 0;
    const totalPages = Math.ceil(totalVisits / limit);

    pipeline.push(
      { $sort: { createdAt: -1 } }, // Sort by newest first
      { $skip: skip },
      { $limit: limit }
    );
    
    // We need to populate user and product details after the main query
    const visits = await Visit.aggregate(pipeline);
    await Visit.populate(visits, { path: 'user', select: 'name' });
    await Visit.populate(visits, { path: 'inventory.product', select: 'name price' });

    res.json({ visits, totalPages, currentPage: page });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/visits/:id
// @desc    Get a single visit by its ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate('user', 'name') // Add this line to include user's name
      .populate('customer', 'name address')
      .populate('inventory.product', 'name price costPrice');

    if (!visit) {
      return res.status(404).json({ msg: 'Visit not found' });
    }
    res.json(visit);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/visits/customer/:customerId/last
// @desc    Get the last visit for a specific customer
// @access  Private
router.get('/customer/:customerId/last', auth, async (req, res) => {
  try {
    const lastVisit = await Visit.findOne({ user: req.user.id, customer: req.params.customerId })
      .sort({ createdAt: -1 }) // Sort by creation date descending to get the latest
      .populate('inventory.product', 'name price costPrice');

    if (!lastVisit) {
      return res.status(404).json({ msg: 'No previous visits found for this customer.' });
    }

    res.json(lastVisit);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- NEW: Endpoint to get the last final stock for a specific product and customer ---
// @route   GET api/visits/last-stock/:customerId/:productId
// @desc    Get the last final stock for a specific product at a specific customer
// @access  Private
router.get('/last-stock/:customerId/:productId', auth, async (req, res) => {
  try {
    const { customerId, productId } = req.params;

    // Find the most recent visit for this customer that contains the specified product
    const lastVisit = await Visit.findOne({
      customer: customerId,
      'inventory.product': productId,
    }).sort({ createdAt: -1 });

    if (!lastVisit) {
      // If no visit is found, the initial stock is 0
      return res.json({ finalStock: 0 });
    }

    // Find the specific inventory item within that visit
    const inventoryItem = lastVisit.inventory.find(
      item => item.product.toString() === productId
    );

    res.json({ finalStock: inventoryItem ? inventoryItem.finalStock : 0 });
  } catch (err) {
    console.error('Error fetching last stock:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
