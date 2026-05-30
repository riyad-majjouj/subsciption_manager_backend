const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  customId: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: String,
  type: {
    type: String,
    enum: ['desktop', 'website'],
    required: true,
  },
  trialDays: {
    type: Number,
    default: 7,
  },
  pricing: {
    creditPrice: {
      type: Number,
      default: 0 // price per credit
    },
    subscriptionPriceMonthly: {
      type: Number,
      default: 0 // price per month
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);
