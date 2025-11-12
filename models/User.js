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
  // --- NEW: Field to store the push notification subscription object ---
  pushSubscription: {
    type: Object,
    default: null,
  },
  passwordResetToken: String,
  passwordResetExpires: Date,

});

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