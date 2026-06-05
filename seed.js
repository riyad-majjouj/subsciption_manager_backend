require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Coupon = require('./models/Coupon'); // أضفنا مودل الكوبون هنا

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected for Seeding`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seedData = async () => {
  await connectDB();

  // 1. إضافة المنتجات
  const products = [
    {
      customId: "autodoc-image-pro",
      name: "AutoDoc Image Pro",
      type: "desktop",
      trialDays: 7,
      pricing: { creditPrice: 19, subscriptionPriceMonthly: 39 }
    },
    {
      customId: "smart-print-assistant",
      name: "Smart Print Assistant Pro",
      type: "desktop",
      trialDays: 7,
      pricing: { creditPrice: 25, subscriptionPriceMonthly: 49 }
    },
    {
      customId: "autofiller-pro",
      name: "AutoFillerPro",
      type: "desktop",
      trialDays: 7,
      pricing: { creditPrice: 49, subscriptionPriceMonthly: 89 }
    }
  ];

  for (const p of products) {
    await Product.findOneAndUpdate({ customId: p.customId }, p, { upsert: true, new: true });
  }
  console.log('Products seeded successfully');

  // 2. إضافة كوبون الخدعة التسويقية
  const couponCode = "LUCKY75"; // يمكنك تغيير الرمز كما تشاء
  
  // التحقق مما إذا كان الكوبون موجوداً مسبقاً حتى لا يتكرر
  const existingCoupon = await Coupon.findOne({ code: couponCode });
  
  if (!existingCoupon) {
    const luckyCoupon = new Coupon({
      code: couponCode,
      discountType: "percentage",
      discountValue: 75, // خصم 75%
      maxUses: null, // السر هنا: null تعني عدد لا نهائي من الاستخدامات
      validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // صالح لمدة سنة من الآن
      isActive: true,
      applicableProducts: [] // يعمل على جميع البرامج
    });
    
    await luckyCoupon.save();
    console.log(`Marketing Coupon (${couponCode}) seeded successfully!`);
  } else {
    console.log(`Coupon (${couponCode}) already exists in the database.`);
  }

  process.exit();
};

seedData();