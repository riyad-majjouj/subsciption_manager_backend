const Product = require('../models/Product');

// @route   GET /api/products
// @desc    Get all active products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    res.json(products);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @route   POST /api/products
// @desc    Create a product (admin only normally, keeping simple for now)
// @access  Public
exports.createProduct = async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    const product = await newProduct.save();
    res.json(product);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};
