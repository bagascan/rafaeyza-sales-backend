
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/admin');
const User = require('../models/User'); // 1. Import model User
const webpush = require('web-push'); // 2. Import web-push

// @route   GET api/products
// @desc    Get all products
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';

    let query = {};
    if (searchTerm) {
      query.name = { $regex: searchTerm, $options: 'i' };
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    res.json({ products, totalPages, currentPage: page });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/products/:id
// @desc    Get single product by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/products
// @desc    Create a new product
// @access  Private (Admin Only)
router.post('/', [auth, admin], async (req, res) => {
  const { name, price, profit, barcode } = req.body;
  try {
    // Cek jika barcode sudah ada (jika diisi)
    if (barcode) {
      const existingProduct = await Product.findOne({ barcode });
      if (existingProduct) {
        return res.status(400).json({ msg: 'Barcode ini sudah digunakan oleh produk lain.' });
      }
    }

    const newProduct = new Product({
      name,
      price,
      profit,
      barcode: barcode || null, // Simpan null jika barcode kosong
    });
    const product = await newProduct.save();

    // --- NEW: Send notification to all sales users ---
    try {
      const salesUsers = await User.find({ role: 'sales', pushSubscription: { $ne: null } });
      if (salesUsers.length > 0) {
        const payload = JSON.stringify({
          title: 'Produk Baru Tersedia',
          body: `Produk baru, '${product.name}', telah ditambahkan dengan harga Rp ${product.price.toLocaleString('id-ID')}.`,
          icon: '/logo192.png',
        });

        for (const sales of salesUsers) {
          webpush.sendNotification(sales.pushSubscription, payload).catch(error => {
            console.error(`Gagal mengirim notifikasi ke ${sales.name}:`, error.message);
          });
        }
      }
    } catch (notificationError) {
      // Jangan gagalkan permintaan utama jika notifikasi gagal
      console.error('Gagal memproses pengiriman notifikasi produk baru:', notificationError.message);
    }

    res.status(201).json(product);
  } catch (err) {
    console.error(err.message);
    if (err.code === 11000) { // Handle duplicate key error for barcode
      return res.status(400).json({ msg: 'Barcode ini sudah digunakan.' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/products/:id
// @desc    Update a product
// @access  Private (Admin Only)
router.put('/:id', [auth, admin], async (req, res) => {
  const { name, price, profit, barcode } = req.body;

  const productFields = {};
  if (name) productFields.name = name;
  if (price) productFields.price = price;
  if (profit) productFields.profit = profit;
  // Hanya update barcode jika ada nilainya, atau set ke null jika string kosong
  if (barcode !== undefined) productFields.barcode = barcode || null;

  try {
    let product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

     product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: productFields },
      { new: true }
    );
    res.json(product);
  } catch (err) {
    console.error(err.message);
    if (err.code === 11000) { // Handle duplicate key error for barcode
      return res.status(400).json({ msg: 'Barcode ini sudah digunakan oleh produk lain.' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/products/:id
// @desc    Delete a product
// @access  Private
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });

    await Product.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Product removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
