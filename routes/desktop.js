const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const desktopController = require('../controllers/desktopController');

// مسار التحقق من الصلاحيات والخصم من الرصيد أو التجربة
router.post('/verify-and-consume', auth, desktopController.verifyAndConsume);

module.exports = router;