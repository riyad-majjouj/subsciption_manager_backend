require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payments');
const productRoutes = require('./routes/products');
const desktopRoutes = require('./routes/desktop');
const contactRoutes = require('./routes/contact');

const app = express();

// Connect to Database
connectDB();

// Middleware
const allowedOrigins = [
  'https://softstore.appsstore.workers.dev',
  'http://localhost:8080',
  'http://localhost:5173',
  'https://smartcv-delta.vercel.app', // أضفه أيضاً إذا كنت تستخدم Vite افتراضياً
];

app.use(cors({
  origin: function (origin, callback) {
    // السماح بالطلبات التي ليس لها origin (مثل برامج سطح المكتب أو Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // مهم إذا كنت ترسل ملفات تعريف الارتباط أو التوكن في الهيدر
}));
// Parse JSON body, except for PayPal webhook which needs raw body for verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(morgan('dev'));

// Mount Routers
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/desktop', desktopRoutes);
app.use('/api/contact', contactRoutes);
// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server Error', details: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
