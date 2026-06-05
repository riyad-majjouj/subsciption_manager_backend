require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Coupon = require('./models/Coupon');

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

  // 1. إضافة وتحديث المنتجات الأربعة بالبيانات الجديدة
  const products = [
    {
      customId: "autodoc-image-pro",
      name: "AutoDoc Image Pro",
      type: "desktop",
      trialDays: 3,
      pricing: { 
        creditPrice: 0.2, // سعر الكريدت 0.20$
        subscriptionPriceMonthly: 15 // الاشتراك الشهري 15$
      }
    },
    {
      customId: "smart-print-assistant",
      name: "Smart Print Assistant Pro",
      type: "desktop",
      trialDays: 3,
      pricing: { 
        creditPrice: 0.15, // سعر الكريدت 0.15$
        subscriptionPriceMonthly: 10 // الاشتراك الشهري 10$
      }
    },
    {
      customId: "autofiller-pro",
      name: "AutoFillerPro",
      type: "desktop",
      trialDays: 3,
      pricing: { 
        creditPrice: 1, // سعر الكريدت 1$
        subscriptionPriceMonthly: 20 // الاشتراك الشهري 20$
      }
    },
    {
      customId: "smartcv-maroc",
      name: "SmartCV Maroc",
      type: "website", // موقع ويب وليس برنامج سطح مكتب
      trialDays: 3,
      pricing: { 
        creditPrice: 0.3, // سعر الكريدت 0.30$
        subscriptionPriceMonthly: 15 // الاشتراك الشهري 15$
      }
    }
  ];

  for (const p of products) {
    await Product.findOneAndUpdate({ customId: p.customId }, p, { upsert: true, new: true });
  }
  console.log('All 4 Products seeded/updated successfully!');

  // 2. إضافة كوبون الخدعة التسويقية (LUCKY75)
  const couponCode = "LUCKY75";
  
  const existingCoupon = await Coupon.findOne({ code: couponCode });
  
  if (!existingCoupon) {
    const luckyCoupon = new Coupon({
      code: couponCode,
      discountType: "percentage",
      discountValue: 75, // خصم 75%
      maxUses: null, // السر هنا: الكوبون يعمل عدد لا نهائي من المرات للجميع
      validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // صالح لمدة سنة من الآن
      isActive: true,
      applicableProducts: [] // يعمل على جميع البرامج بلا استثناء
    });
    
    await luckyCoupon.save();
    console.log(`Marketing Coupon (${couponCode}) seeded successfully!`);
  } else {
    console.log(`Coupon (${couponCode}) already exists in the database.`);
  }

  process.exit();
};

seedData();