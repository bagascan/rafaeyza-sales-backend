
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const User = require('../models/User'); // 1. Import User model
const auth = require('../middleware/authMiddleware'); // 1. Import middleware
const webpush = require('web-push'); // 2. Import web-push

// @route   GET api/customers
// @desc    Get all customers
// @access  Private
router.get('/', auth, async (req, res) => { // 2. Tambahkan 'auth'
  // Pagination, Search, and Sort parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10; // Default 10 item per halaman
  const skip = (page - 1) * limit;
  const searchTerm = req.query.search || '';
  const sortOption = req.query.sort || 'name-asc';

  try {
    let query = {};
    // If the user is not an admin, only show their own data
    if (req.user.role !== 'admin') {
      query.user = req.user.id;
    }

    // Add search term to query
    if (searchTerm) {
      query.name = { $regex: searchTerm, $options: 'i' }; // Case-insensitive search
    }

    // Define sort logic
    let sort = {};
    if (sortOption === 'name-desc') {
      sort.name = -1;
    } else {
      sort.name = 1; // Default to name-asc
    }

    // Dapatkan total dokumen untuk perhitungan halaman
    const totalCustomers = await Customer.countDocuments(query);
    const totalPages = Math.ceil(totalCustomers / limit);

    const customers = await Customer.find(query).sort(sort).skip(skip).limit(limit);

    res.json({ customers, totalPages, currentPage: page });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/customers/:id
// @desc    Get single customer by ID
// @access  Private
router.get('/:id', auth, async (req, res) => { // 3. Tambahkan 'auth'
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ msg: 'Customer not found' });
    }
    res.json(customer);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/customers
// @desc    Create a new customer
// @access  Private
router.post('/', auth, async (req, res) => { // 4. Tambahkan 'auth'
  const { name, address, phone, latitude, longitude } = req.body; // Corrected declaration
  try {
    const newCustomer = new Customer({
      user: req.user.id,
      name,
      address,
      phone,
       // Add location data
      location: { latitude, longitude },

    });

    const customer = await newCustomer.save();
    res.status(201).json(customer);

    // --- NEW: Send notification to the assigned sales user ---
    try {
      const assignedUser = await User.findById(req.user.id);
      if (assignedUser && assignedUser.pushSubscription) {
        const payload = JSON.stringify({
          title: 'Pelanggan Baru Ditugaskan',
          body: `Pelanggan baru, "${customer.name}", telah ditugaskan kepada Anda.`,
          icon: '/logo192.png',
        });
        await webpush.sendNotification(assignedUser.pushSubscription, payload);
        console.log(`Notifikasi penugasan terkirim ke ${assignedUser.name}`);
      }
    } catch (notificationError) {
      // Log the error but don't fail the main request
      console.error('Gagal mengirim notifikasi penugasan:', notificationError.message);
    }
    // --- END NEW ---

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/customers/:id
// @desc    Update a customer
// @access  Private
router.put('/:id', auth, async (req, res) => { // 5. Tambahkan 'auth'
  const { name, address, phone, latitude, longitude } = req.body; // Corrected declaration
  try {
    let customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ msg: 'Customer not found' });
    const oldAssignedUserId = customer.user.toString(); // Store old user ID

    // Authorization check: Ensure the user owns the customer or is an admin
    if (customer.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Akses ditolak.' });
    }

    customer.name = name;
    customer.address = address;
    customer.phone = phone;
     // Update location data
    customer.location.latitude = latitude;
    customer.location.longitude = longitude;

    await customer.save();
    res.json(customer);

    // --- NEW: Send notification if the assignment has changed ---
    const newAssignedUserId = customer.user.toString();
    if (oldAssignedUserId !== newAssignedUserId) {
      try {
        const newlyAssignedUser = await User.findById(newAssignedUserId);
        if (newlyAssignedUser && newlyAssignedUser.pushSubscription) {
          const payload = JSON.stringify({
            title: 'Anda Mendapat Pelanggan Baru',
            body: `Pelanggan "${customer.name}" telah dialihkan dan ditugaskan kepada Anda.`,
            icon: '/logo192.png',
          });
          await webpush.sendNotification(newlyAssignedUser.pushSubscription, payload);
          console.log(`Notifikasi pengalihan terkirim ke ${newlyAssignedUser.name}`);
        }
      } catch (notificationError) {
        console.error('Gagal mengirim notifikasi pengalihan:', notificationError.message);
      }
    }
    // --- END NEW ---

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/customers/:id
// @desc    Delete a customer
// @access  Private
router.delete('/:id', auth, async (req, res) => { // 6. Tambahkan 'auth'
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ msg: 'Customer not found' });

    // Authorization check: Ensure the user owns the customer or is an admin
    if (customer.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Akses ditolak.' });
    }

    await Customer.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Customer removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
