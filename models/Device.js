const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  hwid: {
    type: String,
    required: true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  trialStartedAt: {
    type: Date,
    default: Date.now,
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, { timestamps: true });

// Ensure a single HWID can only have one trial per product
DeviceSchema.index({ hwid: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('Device', DeviceSchema);
