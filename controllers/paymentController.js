const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');

// إعداد بيئة باي بال
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret); // غيّر إلى LiveEnvironment في الإنتاج
const client = new paypal.core.PayPalHttpClient(environment);

// دالة مساعدة لتحديد السعر بناءً على الخطة
const getPlanPrice = (planId) => {
  const plans = {
    'credit_small': 4.99,
    'credit_medium': 14.99,
    'monthly': 9.99,
    'yearly': 79.99,
    'lifetime': 49.99
  };
  return plans[planId] || 0;
};



exports.webhook = async (req, res) => {
  try {
    const event = req.body;
    res.status(200).send('Event received');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};
// @route   POST /api/payments/check-coupon
// @desc    التحقق من الكوبون في الواجهة الأمامية قبل الدفع
exports.checkCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    
    if (!coupon) return res.status(400).json({ error: 'كوبون غير صالح' });
    if (coupon.validUntil < new Date()) return res.status(400).json({ error: 'الكوبون منتهي الصلاحية' });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'تم استنفاد هذا الكوبون' });

    res.json({ success: true, discountType: coupon.discountType, discountValue: coupon.discountValue });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
};

// @route   POST /api/payments/create-order
// @desc    إنشاء طلب دفع
exports.createOrder = async (req, res) => {
  try {
    const { productId, planId, couponCode } = req.body;
    
    if (!productId || !planId) {
      return res.status(400).json({ error: 'بيانات مفقودة' });
    }

    const product = await Product.findOne({ customId: productId });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

    let baseAmount = getPlanPrice(planId);
    if (baseAmount <= 0) return res.status(400).json({ error: 'خطة غير صالحة' });

    let finalAmount = baseAmount;
    let appliedCouponId = null;

    // تطبيق الكوبون إن وجد
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon && coupon.validUntil > new Date() && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
        if (coupon.discountType === 'percentage') {
          finalAmount = baseAmount - (baseAmount * (coupon.discountValue / 100));
        } else if (coupon.discountType === 'fixed') {
          finalAmount = baseAmount - coupon.discountValue;
        }
        finalAmount = Math.max(0, finalAmount); // لا يمكن أن يكون السعر بالسالب
        appliedCouponId = coupon._id;
      }
    }

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: finalAmount.toFixed(2)
        },
        description: `Plan: ${planId} for ${product.name}`
      }],
      application_context: {
        return_url: `https://softstore.appsstore.workers.dev/checkout/success`,
        cancel_url: `https://softstore.appsstore.workers.dev/checkout/${productId}`
      }
    });

    const order = await client.execute(request);

    // حفظ المعاملة
    const transaction = new Transaction({
      user: req.user.id,
      product: product._id,
      type: planId, // نحفظ نوع الخطة هنا (مثلا monthly أو credit_small)
      quantity: 1,
      amount: finalAmount,
      paypalOrderId: order.result.id,
      couponUsed: appliedCouponId,
      status: 'pending'
    });
    await transaction.save();

    const approveLink = order.result.links.find(link => link.rel === 'approve');
    res.json({ id: order.result.id, approveLink: approveLink ? approveLink.href : null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// @route   POST /api/payments/capture-order
// @desc    تأكيد الدفع وإضافة الميزات للمستخدم
exports.captureOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const capture = await client.execute(request);

    if (capture.result.status === 'COMPLETED') {
      const transaction = await Transaction.findOne({ paypalOrderId: orderId });
      
      if (!transaction) return res.status(404).json({ error: 'المعاملة غير موجودة' });
      if (transaction.status === 'completed') return res.status(400).json({ error: 'تم التأكيد مسبقاً' });

      transaction.status = 'completed';
      await transaction.save();

      // تحديث استخدام الكوبون
      if (transaction.couponUsed) {
        await Coupon.findByIdAndUpdate(transaction.couponUsed, { $inc: { usedCount: 1 } });
      }

      const user = await User.findById(transaction.user);
      const planId = transaction.type;
      
      // تفريغ الرصيد أو الاشتراك بناءً على الخطة
      if (planId.startsWith('credit_')) {
        let creditsToAdd = planId === 'credit_small' ? 50 : 200; // بناءً على الخطة
        const creditIndex = user.credits.findIndex(c => c.product.toString() === transaction.product.toString());
        if (creditIndex > -1) {
          user.credits[creditIndex].amount += creditsToAdd;
        } else {
          user.credits.push({ product: transaction.product, amount: creditsToAdd });
        }
      } 
      else if (planId === 'monthly' || planId === 'yearly') {
        const monthsToAdd = planId === 'monthly' ? 1 : 12;
        const subIndex = user.subscriptions.findIndex(s => s.product.toString() === transaction.product.toString());
        if (subIndex > -1) {
          const currentEnd = new Date(user.subscriptions[subIndex].endDate);
          const now = new Date();
          const baseDate = currentEnd > now ? currentEnd : now;
          baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
          user.subscriptions[subIndex].endDate = baseDate;
        } else {
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + monthsToAdd);
          user.subscriptions.push({ product: transaction.product, endDate });
        }
      }
      else if (planId === 'lifetime') {
        const lifeIndex = user.lifetimeLicenses.findIndex(l => l.product.toString() === transaction.product.toString());
        if (lifeIndex === -1) {
          // نضيف الترخيص بدون ربط الـ HWID حالياً. سيتم ربطه عند أول فتح للبرنامج.
          user.lifetimeLicenses.push({ product: transaction.product, hwid: null });
        }
      }

      await user.save();
      return res.json({ success: true, transaction });
    } else {
      res.status(400).json({ error: 'لم يكتمل الدفع' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};