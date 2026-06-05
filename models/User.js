const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  trials: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    usesLeft: { type: Number, default: 0 },
    expiresAt: { type: Date } 
  }],
  credits: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    amount: {
      type: Number,
      default: 0
    }
  }],
  subscriptions: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    endDate: {
      type: Date
    }
  }],
  usedCoupons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' }],
  lifetimeLicenses: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    hwid: { type: String, default: null }
  }]
}, { timestamps: true });


module.exports = mongoose.model('User', UserSchema);
