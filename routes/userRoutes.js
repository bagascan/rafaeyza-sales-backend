const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/admin');

// @route   GET api/users
// @desc    Get all users (for admin panel)
// @access  Private (Admin only)
router.get('/', [auth, admin], async (req, res) => {
  try {
    // Ambil semua pengguna, hapus password dari hasil, dan urutkan dari yang terbaru
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/users
// @desc    Create a new user (by admin)
// @access  Private (Admin only)
router.post('/', [auth, admin], async (req, res) => {
  const { name, username, password, role } = req.body;

  // Validasi dasar
  if (!name || !username || !password || !role) {
    return res.status(400).json({ msg: 'Semua field wajib diisi.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ msg: 'Password minimal harus 6 karakter.' });
  }

  try {
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'Username sudah digunakan.' });
    }

    user = new User({ name, username, password, role });
    await user.save(); // Middleware pre-save di model User akan otomatis hash password

    res.status(201).json({ msg: 'Pengguna baru berhasil dibuat.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/users/:id
// @desc    Update a user's name and role (by admin)
// @access  Private (Admin only)
router.put('/:id', [auth, admin], async (req, res) => {
  const { name, role } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'Pengguna tidak ditemukan.' });
    }

    user.name = name || user.name;
    user.role = role || user.role;

    await user.save();
    res.json({ msg: 'Data pengguna berhasil diperbarui.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/users/:id
// @desc    Delete a user (by admin)
// @access  Private (Admin only)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'Pengguna tidak ditemukan.' });
    }

    // Tambahan: Cegah admin menghapus akunnya sendiri
    if (user.id.toString() === req.user.id) {
        return res.status(400).json({ msg: 'Anda tidak dapat menghapus akun Anda sendiri.' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Pengguna berhasil dihapus.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
