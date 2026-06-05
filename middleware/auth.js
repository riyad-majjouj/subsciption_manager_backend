const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret123');
    
    // السر هنا: استخراج الـ id بالشكل الصحيح بناءً على طريقة توليد التوكن
    req.user = { id: decoded.id }; 
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};