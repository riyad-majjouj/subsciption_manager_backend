const User = require('../models/User');
const Device = require('../models/Device');
const Product = require('../models/Product');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    user = new User({ name, email, password });

    // تشفير كلمة المرور
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // --- إضافة الفترات التجريبية المخصصة ---
    // نعتمد على customId لكل برنامج كما هي في الفرونت اند
    const products = await Product.find({ 
      customId: { $in: ['autodoc-image-pro', 'smart-print-assistant', 'autofiller-pro'] } 
    });

    const trials = [];
    products.forEach(product => {
      if (product.customId === 'autodoc-image-pro' || product.customId === 'smart-print-assistant') {
        // برامج الوورد والصور: تجربة تعتمد على الاستخدام فقط (15 ملف مجاني)
        trials.push({ product: product._id, usesLeft: 15 });
      } 
      else if (product.customId === 'autofiller-pro') {
        // برنامج تعبئة الاستمارات: تجربة هجينة (5 استخدامات وتنتهي بعد 48 ساعة)
        trials.push({ 
          product: product._id, 
          usesLeft: 5, 
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) 
        });
      }
    });

    user.trials = trials;
    // -------------------------------------

    await user.save();

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
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
