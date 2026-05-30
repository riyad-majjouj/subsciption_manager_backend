const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// @route   POST /api/contact
// @desc    استقبال رسائل اتصل بنا وإرسالها لبريد الإدارة
// @access  Public
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'الرجاء تعبئة كافة الحقول المطلوبة' });
  }

  try {
    // إعداد ناقل البريد الإلكتروني (SMTP)
    // نوصي باستخدام بريد Gmail وسيط لإرسال الرسائل لبريدك الشخصي
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // البريد الوسيط المضيف (مثلاً حساب Gmail خاص بالمشروع)
        pass: process.env.EMAIL_PASS  // كلمة مرور التطبيق (App Password) المستخرجة من حساب جوجل
      }
    });

    const mailOptions = {
      from: `"${name}" <${email}>`,
      to: 'majoriyad@gmail.com', // حسابك الشخصي المستهدف
      subject: `رسالة جديدة من الموقع: ${subject}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">رسالة تواصل جديدة</h2>
          <p><strong>الاسم بالكامل:</strong> ${name}</p>
          <p><strong>البريد الإلكتروني للعميل:</strong> ${email}</p>
          <p><strong>الموضوع:</strong> ${subject}</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 15px; border-right: 4px solid #4f46e5;">
            <p style="margin: 0; line-height: 1.6;"><strong>محتوى الرسالة:</strong><br/> ${message.replace(/\n/g, '<br/>')}</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'تم إرسال رسالتك بنجاح' });

  } catch (err) {
    console.error('Mail Error: ', err);
    res.status(500).json({ error: 'فشل إرسال البريد الإلكتروني، يرجى المحاولة لاحقاً.' });
  }
});

module.exports = router;