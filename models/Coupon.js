const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true }, // نسبة مئوية أو مبلغ ثابت
  discountValue: { type: Number, required: true },
  maxUses: { type: Number, default: null }, // عدد مرات الاستخدام المسموح بها للكوبون ككل
  usedCount: { type: Number, default: 0 },
  validUntil: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }] // فارغ يعني يطبق على كل المنتجات
}, { timestamps: true });

module.exports = mongoose.model('Coupon', CouponSchema);