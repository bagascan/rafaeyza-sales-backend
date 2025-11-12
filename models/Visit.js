
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const inventoryItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  initialStock: {
    type: Number,
    required: true,
    default: 0,
  },
  addedStock: {
    type: Number,
    required: true,
    default: 0,
  },
  finalStock: {
    type: Number,
    required: true,
    default: 0,
  },
  returns: {
    type: Number,
    required: true,
    default: 0,
  },
}, { _id: false }); // Best practice: prevent IDs on subdocuments

const visitSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  inventory: [inventoryItemSchema],
  photos: {
    type: Map,
    of: {
      before: [{ type: String }],
      after: [{ type: String }],
    },
    default: {},
  },
  totalProfit: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

const Visit = mongoose.model('Visit', visitSchema);

module.exports = Visit;
