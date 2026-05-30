const User = require('../models/User');
const Product = require('../models/Product');

exports.verifyAndConsume = async (req, res) => {
  try {
    const { productId, hwid } = req.body;
    const userId = req.user.id;

    if (!productId || !hwid) {
      return res.status(400).json({ allowed: false, message: 'معرف المنتج ومعرف الجهاز مطلوبان' });
    }

    const product = await Product.findOne({ customId: productId });
    if (!product) return res.status(404).json({ allowed: false, message: 'المنتج غير موجود' });

    const user = await User.findById(userId);

    // 1. التحقق من ترخيص مدى الحياة
    const lifetime = user.lifetimeLicenses.find(l => l.product.toString() === product._id.toString());
    if (lifetime) {
      if (!lifetime.hwid) {
        // أول مرة يفتح البرنامج بعد شراء مدى الحياة -> نربط الجهاز
        lifetime.hwid = hwid;
        await user.save();
        return res.json({ allowed: true, message: 'تم تفعيل ترخيص مدى الحياة على هذا الجهاز' });
      } else if (lifetime.hwid === hwid) {
        return res.json({ allowed: true, message: 'ترخيص مدى الحياة نشط' });
      } else {
        return res.json({ allowed: false, reason: 'hwid_mismatch', message: 'هذا الترخيص مربوط بجهاز آخر.' });
      }
    }

    // 2. التحقق من الاشتراك الشهري/السنوي
    const subscription = user.subscriptions.find(s => s.product.toString() === product._id.toString());
    if (subscription && new Date(subscription.endDate) > new Date()) {
      return res.json({ allowed: true, message: 'الاشتراك نشط' });
    }

    // 3. التحقق من الفترة التجريبية (بالاستخدام)
    const trial = user.trials.find(t => t.product.toString() === product._id.toString());
    if (trial) {
      const isExpired = trial.expiresAt && new Date(trial.expiresAt) < new Date();
      if (trial.usesLeft > 0 && !isExpired) {
        trial.usesLeft -= 1;
        await user.save();
        return res.json({ allowed: true, message: `استخدام تجريبي. المتبقي: ${trial.usesLeft} عمليات.` });
      }
    }

    // 4. التحقق من الرصيد (Credits)
    const credit = user.credits.find(c => c.product.toString() === product._id.toString());
    if (credit && credit.amount > 0) {
      credit.amount -= 1;
      await user.save();
      return res.json({ allowed: true, message: `تم خصم رصيد. المتبقي: ${credit.amount} عمليات.` });
    }

    // 5. إذا وصل الكود إلى هنا، يعني لا يملك أي رصيد أو اشتراك
    return res.json({ 
      allowed: false, 
      reason: 'payment_required',
      message: 'انتهى الرصيد أو الفترة التجريبية. يرجى الشراء.',
      checkoutUrl: `http://localhost:5173/checkout/${productId}` // يفتح هذا الرابط في المتصفح من البرنامج
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ allowed: false, message: 'خطأ في الخادم' });
  }
};