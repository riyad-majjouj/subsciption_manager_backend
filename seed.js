require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected for Seeding`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seedProducts = async () => {
  await connectDB();

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
  process.exit();
};

seedProducts();
