const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const crypto = require('crypto'); // 1. Import crypto untuk generate token
const brevo = require('@getbrevo/brevo'); // 2. Import Brevo

// @route   POST api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  const { name, username, password } = req.body;

  try {
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'Username sudah digunakan' });
    }

    user = new User({
      name,
      username,
      password,
    });

    await user.save();

    // Return a token upon successful registration
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    let user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: 'Username atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Username atau password salah' });
    }

    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    };

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/auth/user
// @desc    Get logged in user data
// @access  Private
router.get('/user', auth, async (req, res) => {
  try {
    // req.user.id is attached by the auth middleware
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ msg: 'Pengguna tidak ditemukan.' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/auth/sales-users
// @desc    Get all users with the 'sales' role
// @access  Private (Admin only)
router.get('/sales-users', auth, async (req, res) => {
  // Simple authorization check
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Akses ditolak. Hanya untuk admin.' });
  }
  try {
    const salesUsers = await User.find({ role: 'sales' }).select('id name');
    res.json(salesUsers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- NEW: FORGOT PASSWORD ---
// @route   POST api/auth/forgot-password
// @desc    Request a password reset link
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body; // Kita akan menggunakan email untuk reset
    const user = await User.findOne({ username: email }); // Asumsi username adalah email

    if (!user) {
      // Kirim respons sukses palsu agar tidak membocorkan email mana yang terdaftar
      return res.json({ msg: 'Jika email Anda terdaftar, Anda akan menerima link reset password.' });
    }

    // 1. Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // 2. Save token and expiry to user document
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 3600000; // Token valid untuk 1 jam
    await user.save({ validateBeforeSave: false }); // Simpan tanpa hashing password lagi

    // 3. Send email using Brevo
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    let apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

    let sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: user.username, name: user.name }];
    sendSmtpEmail.sender = { email: "no-reply@rafaeyza.com", name: "Rafaeyza Sales App" }; // Ganti dengan email pengirim Anda
    sendSmtpEmail.subject = "Reset Password Aplikasi Sales";
    sendSmtpEmail.htmlContent = `
      <p>Anda menerima email ini karena Anda (atau orang lain) meminta untuk mereset password akun Anda.</p>
      <p>Silakan klik link di bawah, atau salin dan tempel di browser Anda untuk menyelesaikan proses:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>Jika Anda tidak meminta ini, abaikan saja email ini dan password Anda akan tetap sama.</p>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail);

    res.json({ msg: 'Email reset password telah dikirim.' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).send('Server Error');
  }
});

// --- NEW: RESET PASSWORD ---
// @route   POST api/auth/reset-password/:token
// @desc    Reset password using token
// @access  Public
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;

    // 1. Find user by token and check if token is still valid
    const user = await User.findOne({
      passwordResetToken: req.params.token,
      passwordResetExpires: { $gt: Date.now() }, // Cek apakah belum kedaluwarsa
    });

    if (!user) {
      return res.status(400).json({ msg: 'Token reset password tidak valid atau sudah kedaluwarsa.' });
    }

    // 2. Set new password and clear reset fields
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save(); // Middleware pre-save akan otomatis hash password baru

    // 3. (Opsional) Login pengguna secara otomatis atau kirim ke halaman login
    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    };

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, msg: 'Password berhasil direset. Anda sekarang login.' });
    });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;