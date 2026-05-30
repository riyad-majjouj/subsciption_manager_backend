const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

// مسار إنشاء الطلب
router.post('/create-order', auth, paymentController.createOrder);

// مسار تأكيد الدفع
router.post('/capture-order', auth, paymentController.captureOrder);

// مسار التحقق من الكوبون
router.post('/check-coupon', auth, paymentController.checkCoupon);

// مسار الويب هوك الخاص بباي بال
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

module.exports = router;