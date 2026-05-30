const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  type: {
    type: String,
    // تم التحديث هنا ليشمل جميع الخطط والخيارات الجديدة المدعومة
    enum: ['credit', 'subscription', 'lifetime', 'credit_small', 'credit_medium', 'monthly', 'yearly'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true, // عدد النقاط أو الأشهر أو التراخيص
  },
  amount: {
    type: Number,
    required: true, // المبلغ الإجمالي المدفوع
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  couponUsed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
  paypalOrderId: {
    type: String,
    unique: true,
    sparse: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);