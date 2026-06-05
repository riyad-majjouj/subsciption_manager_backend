const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');

// إعداد بيئة باي بال (ديناميكية)
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

// إذا أضفت متغير PAYPAL_MODE=live في Railway سيعمل الدفع الحقيقي، غير ذلك سيعمل الاختبار
const environment = process.env.PAYPAL_MODE === 'live' 
  ? new paypal.core.LiveEnvironment(clientId, clientSecret)
  : new paypal.core.SandboxEnvironment(clientId, clientSecret);

const client = new paypal.core.PayPalHttpClient(environment);

// ==========================================
// 1. قاعدة بيانات أسعار الخطط لكل المنتجات
// ==========================================
const planPricings = {
  "smartcv-maroc": {
    "monthly": { price: 15.00, type: "subscription", quantity: 1 },
    "yearly": { price: 120.00, type: "subscription", quantity: 12 },
    "credit_small": { price: 5.00, type: "credit", quantity: 10 },
    "credit_medium": { price: 15.00, type: "credit", quantity: 50 },
    "credit_large": { price: 20.00, type: "credit", quantity: 100 }
  },
  "default": {
    "monthly": { price: 9.99, type: "subscription", quantity: 1 },
    "yearly": { price: 79.99, type: "subscription", quantity: 12 },
    "credit_small": { price: 4.99, type: "credit", quantity: 50 },
    "credit_medium": { price: 14.99, type: "credit", quantity: 200 },
    "lifetime": { price: 49.99, type: "lifetime", quantity: 1 }
  }
};

// @route   POST /api/payments/check-coupon
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
exports.createOrder = async (req, res) => {
  try {
    const { productId, planId, couponCode } = req.body;

    if (!productId || !planId) return res.status(400).json({ error: 'بيانات مفقودة' });

    const product = await Product.findOne({ customId: productId });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

    const currentPlans = planPricings[productId] || planPricings["default"];
    const selectedPlan = currentPlans[planId];
    
    if (!selectedPlan) return res.status(400).json({ error: 'خطة غير صالحة لهذا المنتج' });

    let baseAmount = selectedPlan.price;
    let finalAmount = baseAmount;
    let appliedCouponId = null;

    // جلب بيانات المستخدم لفحص الكوبونات المستخدمة سابقاً
    const user = await User.findById(req.user.id);

    // تطبيق الكوبون إن وجد
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      
      if (coupon) {
        // التحقق من أن المستخدم لم يقم باستخدام هذا الكوبون مسبقاً (هنا الخدعة التسويقية)
        if (user.usedCoupons.includes(coupon._id)) {
          return res.status(400).json({ error: 'لقد قمت باستخدام هذا الكوبون مسبقاً في عملية شراء سابقة.' });
        }

        if (coupon.validUntil > new Date() && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
          if (coupon.discountType === 'percentage') {
            finalAmount = baseAmount - (baseAmount * (coupon.discountValue / 100));
          } else if (coupon.discountType === 'fixed') {
            finalAmount = baseAmount - coupon.discountValue;
          }
          finalAmount = Math.max(0.5, finalAmount); 
          appliedCouponId = coupon._id;
        } else {
          return res.status(400).json({ error: 'عذراً، هذا الكوبون غير صالح أو انتهت صلاحيته.' });
        }
      } else {
        return res.status(400).json({ error: 'رمز الكوبون المدخل غير صحيح.' });
      }
    }

    // إرسال الطلب لـ PayPal
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

    // حفظ المعاملة مع تخزين الكوبون ليتم استهلاكه عند الموافقة
    const transaction = new Transaction({
      user: req.user.id,
      product: product._id,
      type: planId, 
      quantity: selectedPlan.quantity,
      amount: finalAmount,
      paypalOrderId: order.result.id,
      couponUsed: appliedCouponId,
      status: 'pending'
    });
    
    await transaction.save();

    const approveLink = order.result.links.find(link => link.rel === 'approve');
    res.json({ id: order.result.id, approveLink: approveLink ? approveLink.href : null });

  } catch (err) {
    console.error("PayPal Create Order Error:", err);
    res.status(500).json({ error: 'حدث خطأ أثناء التواصل مع سيرفر الدفع', details: err.message });
  }
};


// @route   POST /api/payments/capture-order
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

      const user = await User.findById(transaction.user);

      // تحديث استخدام الكوبون (تسجيله في حساب المستخدم لمنع استخدامه مرة أخرى)
      if (transaction.couponUsed) {
        await Coupon.findByIdAndUpdate(transaction.couponUsed, { $inc: { usedCount: 1 } });
        // إضافة الكوبون لمصفوفة العميل
        if (!user.usedCoupons.includes(transaction.couponUsed)) {
          user.usedCoupons.push(transaction.couponUsed);
        }
      }

      const planId = transaction.type;
      
      // تفريغ الرصيد أو الاشتراك بناءً على الخطة (كما هو في كودك)
      if (planId.startsWith('credit_')) {
        const creditIndex = user.credits.findIndex(c => c.product.toString() === transaction.product.toString());
        if (creditIndex > -1) {
          user.credits[creditIndex].amount += transaction.quantity;
        } else {
          user.credits.push({ product: transaction.product, amount: transaction.quantity });
        }
      } 
      else if (planId === 'monthly' || planId === 'yearly') {
        const subIndex = user.subscriptions.findIndex(s => s.product.toString() === transaction.product.toString());
        if (subIndex > -1) {
          const currentEnd = new Date(user.subscriptions[subIndex].endDate);
          const now = new Date();
          const baseDate = currentEnd > now ? currentEnd : now;
          baseDate.setMonth(baseDate.getMonth() + transaction.quantity); 
          user.subscriptions[subIndex].endDate = baseDate;
        } else {
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + transaction.quantity);
          user.subscriptions.push({ product: transaction.product, endDate });
        }
      }
      else if (planId === 'lifetime') {
        const lifeIndex = user.lifetimeLicenses.findIndex(l => l.product.toString() === transaction.product.toString());
        if (lifeIndex === -1) {
          user.lifetimeLicenses.push({ product: transaction.product, hwid: null });
        }
      }

      await user.save();
      return res.json({ success: true, transaction });
    } else {
      res.status(400).json({ error: 'لم يكتمل الدفع' });
    }

  } catch (err) {
    console.error("PayPal Capture Error:", err);
    res.status(500).json({ error: 'Server Error' });
  }
};
exports.webhook = async (req, res) => {
  res.status(200).send('Event received');
};