const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');

// إعداد بيئة باي بال (استخدم LiveEnvironment عند النشر النهائي)
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
const client = new paypal.core.PayPalHttpClient(environment);

// قاعدة بيانات مصغرة للأسعار والكميات وأنواع الباقات لكل منتج
const PRODUCT_PLANS = {
  "smartcv-maroc": {
    "credit_small": { price: 5.00, qty: 10, type: "credit" },      // 10 سير ذاتية
    "credit_medium": { price: 15.00, qty: 50, type: "credit" },     // 50 سيرة ذاتية
    "credit_large": { price: 20.00, qty: 100, type: "credit" },    // 100 سيرة ذاتية
    "monthly": { price: 15.00, qty: 1, type: "subscription" },     // شهر واحد
    "yearly": { price: 120.00, qty: 12, type: "subscription" }     // 12 شهر
  },
  "default": { 
    // هذه الباقات ستطبق تلقائياً على باقي البرامج (الوورد، الاستمارات، واتساب)
    "credit_small": { price: 4.99, qty: 50, type: "credit" },
    "credit_medium": { price: 14.99, qty: 200, type: "credit" },
    "monthly": { price: 9.99, qty: 1, type: "subscription" },
    "yearly": { price: 79.99, qty: 12, type: "subscription" },
    "lifetime": { price: 49.99, qty: 1, type: "lifetime" }
  }
};

// @route   POST /api/payments/webhook
// @desc    استقبال إشعارات باي بال الخلفية
exports.webhook = async (req, res) => {
  try {
    // يمكن هنا إضافة منطق للتحقق من الاستردادات (Refunds) مستقبلاً
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
    
    if (!code) {
      return res.status(400).json({ error: 'الرجاء إدخال كود الكوبون' });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

    if (!coupon) return res.status(400).json({ error: 'كوبون غير صالح أو غير موجود' });
    if (coupon.validUntil < new Date()) return res.status(400).json({ error: 'الكوبون منتهي الصلاحية' });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'تم استنفاد الحد الأقصى لاستخدام هذا الكوبون' });

    res.json({ 
      success: true, 
      discountType: coupon.discountType, 
      discountValue: coupon.discountValue 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم أثناء التحقق من الكوبون' });
  }
};

// @route   POST /api/payments/create-order
// @desc    إنشاء طلب دفع وتسجيل الفاتورة كـ Pending
exports.createOrder = async (req, res) => {
  try {
    const { productId, planId, couponCode } = req.body;

    if (!productId || !planId) {
      return res.status(400).json({ error: 'بيانات المنتج أو الباقة مفقودة' });
    }

    const product = await Product.findOne({ customId: productId });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود بمتجرنا' });

    // تحديد الخطة من كائن PRODUCT_PLANS
    const plans = PRODUCT_PLANS[productId] || PRODUCT_PLANS["default"];
    const planDetails = plans[planId];
    
    if (!planDetails) {
      return res.status(400).json({ error: 'الخطة المحددة غير صالحة لهذا المنتج' });
    }

    let baseAmount = planDetails.price;
    let finalAmount = baseAmount;
    let appliedCouponId = null;

    // معالجة وتطبيق الكوبون إن وجد
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      
      if (coupon && coupon.validUntil > new Date() && (!coupon.maxUses || coupon.usedCount < coupon.maxUses)) {
        if (coupon.discountType === 'percentage') {
          finalAmount = baseAmount - (baseAmount * (coupon.discountValue / 100));
        } else if (coupon.discountType === 'fixed') {
          finalAmount = baseAmount - coupon.discountValue;
        }
        
        // منع السعر من النزول عن 0.5 دولار (الحد الأدنى المسموح في باي بال)
        finalAmount = Math.max(0.5, finalAmount);
        appliedCouponId = coupon._id;
      }
    }

    // إعداد فاتورة باي بال
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

    // حفظ المعاملة في قاعدة البيانات بحالة "معلقة"
    const transaction = new Transaction({
      user: req.user.id,
      product: product._id,
      type: planId,
      quantity: planDetails.qty, // حفظ الكمية الحقيقية (عدد الكريدت أو عدد الأشهر)
      amount: finalAmount,
      paypalOrderId: order.result.id,
      couponUsed: appliedCouponId,
      status: 'pending'
    });
    
    await transaction.save();

    // إرسال رابط الموافقة للواجهة الأمامية
    const approveLink = order.result.links.find(link => link.rel === 'approve');
    res.json({ id: order.result.id, approveLink: approveLink ? approveLink.href : null });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// @route   POST /api/payments/capture-order
// @desc    تأكيد الدفع وإضافة الميزات للمستخدم فعلياً
exports.captureOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const capture = await client.execute(request);

    // التحقق من نجاح العملية من باي بال
    if (capture.result.status === 'COMPLETED') {
      const transaction = await Transaction.findOne({ paypalOrderId: orderId }).populate('product');
      
      if (!transaction) return res.status(404).json({ error: 'المعاملة غير موجودة في سجلاتنا' });
      if (transaction.status === 'completed') return res.status(400).json({ error: 'تم تأكيد هذه العملية مسبقاً' });

      // تحديث حالة المعاملة إلى مكتملة
      transaction.status = 'completed';
      await transaction.save();

      // زيادة عداد استخدام الكوبون
      if (transaction.couponUsed) {
        await Coupon.findByIdAndUpdate(transaction.couponUsed, { $inc: { usedCount: 1 } });
      }

      // جلب المستخدم وتحديث باقاته
      const user = await User.findById(transaction.user);
      const planId = transaction.type;
      
      // 1. نظام الرصيد (Credits)
      if (planId.startsWith('credit_')) {
        const creditIndex = user.credits.findIndex(c => c.product.toString() === transaction.product._id.toString());
        if (creditIndex > -1) {
          user.credits[creditIndex].amount += transaction.quantity;
        } else {
          user.credits.push({ product: transaction.product._id, amount: transaction.quantity });
        }
      } 
      // 2. نظام الاشتراكات (شهري / سنوي)
      else if (planId === 'monthly' || planId === 'yearly') {
        const subIndex = user.subscriptions.findIndex(s => s.product.toString() === transaction.product._id.toString());
        if (subIndex > -1) {
          const currentEnd = new Date(user.subscriptions[subIndex].endDate);
          const now = new Date();
          // إذا كان الاشتراك منتهي، نبدأ من اليوم. إذا كان فعال، نضيف المدة الجديدة لتاريخ الانتهاء
          const baseDate = currentEnd > now ? currentEnd : now;
          baseDate.setMonth(baseDate.getMonth() + transaction.quantity); // quantity هنا تمثل عدد الأشهر
          user.subscriptions[subIndex].endDate = baseDate;
        } else {
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + transaction.quantity);
          user.subscriptions.push({ product: transaction.product._id, endDate });
        }
      }
      // 3. نظام رخصة مدى الحياة
      else if (planId === 'lifetime') {
        const lifeIndex = user.lifetimeLicenses.findIndex(l => l.product.toString() === transaction.product._id.toString());
        if (lifeIndex === -1) {
          // نضيف الترخيص فارغ الـ HWID. سيتم ربطه عند فتح البرنامج لأول مرة
          user.lifetimeLicenses.push({ product: transaction.product._id, hwid: null });
        }
      }

      await user.save();
      return res.json({ success: true, transaction });
      
    } else {
      res.status(400).json({ error: 'لم تكتمل الدفعة بشكل صحيح من قبل PayPal' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};