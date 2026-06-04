const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcryptjs'); // استخدم bcryptjs لتجنب مشاكل التثبيت
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// إعداد مرسل الإيميل
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// @route   POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    let user = await User.findOne({ email });
    if (user) {
        if (user.isVerified) return res.status(400).json({ error: 'البريد الإلكتروني مسجل ومفعل مسبقاً' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 دقيقة

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user && !user.isVerified) {
        user.password = hashedPassword;
        user.otpCode = otpCode;
        user.otpExpires = otpExpires;
    } else {
        user = new User({
            email,
            password: hashedPassword,
            isVerified: false,
            otpCode,
            otpExpires,
            hwids: [], trials: [], credits: [], subscriptions: [], lifetimeLicenses: [], usedCoupons: []
        });
    }

    // === التعديل هنا: محاولة إرسال الإيميل مع التقاط الخطأ ===
    try {
      await transporter.sendMail({
        from: '"سوفت ستور" <support@softstore.dev>',
        to: email,
        subject: 'رمز تفعيل حسابك في سوفت ستور',
        html: `
          <div dir="rtl" style="font-family: Arial; padding: 20px;">
            <h2>مرحباً بك في سوفت ستور!</h2>
            <p>رمز التحقق الخاص بك هو: <strong style="font-size: 24px; color: #4f46e5;">${otpCode}</strong></p>
            <p>هذا الرمز صالح لمدة 15 دقيقة.</p>
          </div>
        `
      });
    } catch (mailError) {
      console.error("Mail Error Details:", mailError);
      return res.status(500).json({ error: 'حدث خطأ أثناء محاولة إرسال الإيميل. تأكد من إعدادات البريد.' });
    }
    // ========================================================

    await user.save();
    res.json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server Error' });
  }
};

// @route   POST /api/auth/verify-otp
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ error: 'المستخدم غير موجود' });
    if (user.isVerified) return res.status(400).json({ error: 'الحساب مفعل مسبقاً' });
    if (user.otpCode !== otpCode || new Date(user.otpExpires) < new Date()) {
        return res.status(400).json({ error: 'رمز التحقق خاطئ أو منتهي الصلاحية' });
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;

    // منح الفترات التجريبية عند التفعيل لأول مرة
    const prod1 = await Product.findOne({ customId: "smart-print-assistant" });
    const prod2 = await Product.findOne({ customId: "autofiller-pro" });
    const prod3 = await Product.findOne({ customId: "autodoc-image-pro" });

    if (prod1) user.trials.push({ product: prod1._id, usesLeft: 15, expiresAt: null });
    if (prod2) user.trials.push({ product: prod2._id, usesLeft: 5, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) });
    if (prod3) user.trials.push({ product: prod3._id, usesLeft: 5, expiresAt: null });

    await user.save();

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ success: true, token, user: { email: user.email } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server Error' });
  }
};

// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password, hwid } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    if (!user.isVerified) return res.status(401).json({ error: 'يرجى تفعيل حسابك أولاً', needsVerification: true });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

    // تسجيل الجهاز للدخول التلقائي لاحقاً (تم إضافته هنا)
    if (hwid && !user.hwids.includes(hwid)) {
        user.hwids.push(hwid);
        await user.save();
    }

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { email: user.email } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server Error' });
  }
};

// @route   POST /api/auth/hwid-login
// الدخول التلقائي للبرنامج بدون يوزر وباسورد (يعتمد على البصمة)
exports.hwidLogin = async (req, res) => {
  try {
    const { hwid } = req.body;
    if (!hwid) return res.status(400).json({ error: 'لم يتم توفير بصمة الجهاز' });

    // البحث عن مستخدم يمتلك هذه البصمة ومفعل
    const user = await User.findOne({ hwids: hwid, isVerified: true });
    
    if (!user) {
        return res.status(401).json({ error: 'الجهاز غير مسجل، يرجى تسجيل الدخول يدوياً' });
    }

    // إصدار توكن جديد في الذاكرة للبرنامج
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ success: true, token, email: user.email });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};