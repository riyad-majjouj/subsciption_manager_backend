const User = require('../models/User');
const Product = require('../models/Product');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// دالة مساعدة لإنشاء التوكن
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecret123', { expiresIn: '30d' });
};

// 1. إنشاء حساب جديد (وربطه ببصمة الجهاز)
exports.register = async (req, res) => {
  try {
    const { email, password, hwid } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'الرجاء إدخال البريد وكلمة المرور' });

    // التحقق هل الإيميل موجود؟
    let userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });

    // التحقق هل هذا الجهاز (HWID) يمتلك حساباً مسبقاً؟ (لمنع عمل حسابات وهمية)
    if (hwid) {
      let hwidExists = await User.findOne({ hwid });
      if (hwidExists) return res.status(400).json({ error: 'هذا الجهاز مسجل بحساب آخر مسبقاً.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // إعطاء فترات تجريبية تلقائية (كما برمجناها سابقاً)
    const prod1 = await Product.findOne({ customId: "smart-print-assistant" });
    const prod2 = await Product.findOne({ customId: "autofiller-pro" });
    const prod3 = await Product.findOne({ customId: "autodoc-image-pro" });

    const trialsData = [];
    if (prod1) trialsData.push({ product: prod1._id, usesLeft: 15, expiresAt: null });
    if (prod2) trialsData.push({ product: prod2._id, usesLeft: 5, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) });
    if (prod3) trialsData.push({ product: prod3._id, usesLeft: 5, expiresAt: null });

    const user = new User({
      email,
      password: hashedPassword,
      hwid: hwid || null, // حفظ بصمة الجهاز
      trials: trialsData
    });

    await user.save();

    res.json({ token: generateToken(user._id), user: { id: user._id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب', details: err.message });
  }
};

// 2. تسجيل الدخول العادي (للموقع)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    res.json({ token: generateToken(user._id), user: { id: user._id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

// 3. تسجيل الدخول التلقائي لبرامج سطح المكتب (بدون باسوورد، بالاعتماد على البصمة)
exports.desktopAutoLogin = async (req, res) => {
  try {
    const { hwid } = req.body;
    if (!hwid) return res.status(400).json({ error: 'لم يتم العثور على بصمة الجهاز' });

    const user = await User.findOne({ hwid });
    
    if (user) {
      // الجهاز معروف، قم بإدخاله فوراً
      res.json({ success: true, token: generateToken(user._id), user: { id: user._id, email: user.email } });
    } else {
      // الجهاز غير معروف، يجب عليه التسجيل أو تسجيل الدخول يدوياً لأول مرة لربطه
      res.status(404).json({ success: false, error: 'جهاز جديد غير مسجل' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};