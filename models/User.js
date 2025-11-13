const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['sales', 'admin'], // Only allows these two values
    default: 'sales', // New users will be 'sales' by default
  },
    // 2. GUNAKAN SKEMA BARU di sini
  pushSubscription: {
    type: PushSubscriptionSchema,
    default: null,
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
}, { timestamps: true });


// 1. BUAT SKEMA BARU untuk struktur PushSubscription
const PushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  expirationTime: { type: Number, default: null },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  }
}, { _id: false }); // _id: false karena ini adalah sub-dokumen

// Middleware to hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model('User', UserSchema);

module.exports = User;