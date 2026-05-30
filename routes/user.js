const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/profile', auth, userController.getProfile);
router.post('/consume-credit', auth, userController.consumeCredit);

module.exports = router;
