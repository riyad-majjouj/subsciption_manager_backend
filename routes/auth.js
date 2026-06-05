const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/desktop-auto-login', authController.desktopAutoLogin);
router.post('/verify-session', authController.verifySession); 

module.exports = router;
