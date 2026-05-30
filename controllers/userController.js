const User = require('../models/User');

// @route   GET /api/user/profile
// @desc    Get current user profile
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('credits.product', 'name type customId')
      .populate('subscriptions.product', 'name type customId')
      .populate('trials.product', 'name type customId')           // <-- تم الإضافة هنا
      .populate('lifetimeLicenses.product', 'name type customId'); // <-- وتم الإضافة هنا
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @route   POST /api/user/consume-credit
// @desc    Consume 1 credit for a specific product
// @access  Private
exports.consumeCredit = async (req, res) => {
  try {
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    const product = await require('../models/Product').findOne({ customId: productId });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const user = await User.findById(req.user.id);
    const creditIndex = user.credits.findIndex(c => c.product.toString() === product._id.toString());

    if (creditIndex === -1 || user.credits[creditIndex].amount <= 0) {
      return res.status(400).json({ error: 'Not enough credits' });
    }

    user.credits[creditIndex].amount -= 1;
    await user.save();

    res.json({ success: true, remainingCredits: user.credits[creditIndex].amount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};
