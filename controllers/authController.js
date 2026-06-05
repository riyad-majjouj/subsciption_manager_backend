const User = require('../models/User');
const Device = require('../models/Device');
const Product = require('../models/Product');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// إعداد مرسل الإيميل
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });

    // توليد كود من 6 أرقام
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // صالح لـ 15 دقيقة

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name, email, password: hashedPassword,
      isVerified: false, otpCode, otpExpires,
      trials: [], credits: [], subscriptions: [], lifetimeLicenses: []
    });

    // إرسال الكود للإيميل
    await transporter.sendMail({
      from: '"سوفت ستور" <no-reply@softstore.dev>',
      to: email,
      subject: 'رمز التحقق من بريدك الإلكتروني',
      html: `<h2>مرحباً ${name}</h2><p>رمز التحقق الخاص بك هو: <strong>${otpCode}</strong></p><p>صالح لمدة 15 دقيقة.</p>`
    });

    await user.save();
    res.json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني.' });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) return res.status(400).json({ error: 'مستخدم غير موجود' });
    if (user.isVerified) return res.status(400).json({ error: 'الحساب مفعل مسبقاً' });
    if (user.otpCode !== otpCode || new Date(user.otpExpires) < new Date()) {
      return res.status(400).json({ error: 'الرمز خاطئ أو منتهي الصلاحية' });
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    
    // إضافة فترات التجربة هنا بعد تفعيل الحساب
    // (ضع كود إضافة الـ trials الذي كتبناه سابقاً هنا)
    
    await user.save();

    // إصدار التوكن للدخول المباشر بعد التفعيل
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ success: true, token });
    });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid Credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid Credentials' });
    }

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// @route   POST /api/auth/desktop-login
// @desc    Authenticate user from desktop, check HWID and trial
// @access  Public
exports.desktopLogin = async (req, res) => {
  try {
    const { email, password, hwid, productId } = req.body;

    if (!hwid || !productId) {
      return res.status(400).json({ error: 'HWID and Product ID are required' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid Credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid Credentials' });
    }

    const product = await Product.findOne({ customId: productId });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check HWID
    let device = await Device.findOne({ hwid, product: product._id });
    let trialStatus = 'active';

    if (device) {
      // If device exists but was used by a DIFFERENT user, deny trial for this new user!
      // This enforces: 1 HWID = 1 trial. You can't just make a new email on the same PC.
      // However, if the user actually BOUGHT credits/subscription, we should let them login.
      // So we calculate if they have active sub or credits first.
    } else {
      // First time this HWID runs this product. Create it.
      device = new Device({
        hwid,
        product: product._id,
        usedBy: user._id
      });
      await device.save();
    }

    // Check user balance/subscription for this product
    const sub = user.subscriptions.find(s => s.product.toString() === product._id.toString());
    const hasActiveSubscription = sub && new Date(sub.endDate) > new Date();
    
    const cred = user.credits.find(c => c.product.toString() === product._id.toString());
    const availableCredits = cred ? cred.amount : 0;

    const trialDays = product.trialDays || 7;
    const trialEndTime = new Date(device.trialStartedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const isTrialExpired = new Date() > trialEndTime;

    if (device.usedBy.toString() !== user._id.toString()) {
        // HWID registered to another user's trial.
        trialStatus = 'consumed_by_other_account';
    } else if (isTrialExpired) {
        trialStatus = 'expired';
    } else {
        trialStatus = 'active';
    }

    // Final authorization check
    let authorized = false;
    let authReason = '';

    if (hasActiveSubscription) {
      authorized = true;
      authReason = 'subscription';
    } else if (availableCredits > 0) {
      authorized = true;
      authReason = 'credits';
    } else if (trialStatus === 'active') {
      authorized = true;
      authReason = 'trial';
    } else {
      authorized = false;
      authReason = trialStatus; // expired or consumed_by_other_account
    }

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      authorized,
      authReason,
      trialEndsAt: trialEndTime,
      balances: {
        subscriptionEndsAt: hasActiveSubscription ? sub.endDate : null,
        credits: availableCredits
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
