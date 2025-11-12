
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
  },
  profit: { // Field for profit
    type: Number,
    required: true,
  },
  // --- NEW: Barcode Field ---
  barcode: {
    type: String,
    trim: true,
    unique: true, // Ensures every barcode is unique in the database
    sparse: true, // Allows multiple products to have a null/empty barcode field
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Product', ProductSchema);
