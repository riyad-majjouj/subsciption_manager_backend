// مسار الملف: backend/routes/contact.js

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// @route   POST /api/contact
// @desc    Receive contact form submission and send email
// @access  Public
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  // التحقق من أن جميع الحقول ممتلئة
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'الرجاء تعبئة كافة الحقول المطلوبة' });
  }

  try {
    // إعداد ناقل البريد الإلكتروني (SMTP)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // إعداد شكل الرسالة التي ستصلك إلى إيميلك (majoriyad@gmail.com)
    const mailOptions = {
      from: `"${name}" <${email}>`, // يظهر كأن العميل هو من أرسل
      to: process.env.EMAIL_USER, // إيميلك الذي ستستقبل عليه الرسائل
      replyTo: email, // لكي تتمكن من الرد مباشرة على العميل عند الضغط على Reply
      subject: `[سوفت ستور] استفسار جديد: ${subject}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">رسالة تواصل جديدة من الموقع</h2>
          <p><strong>اسم العميل:</strong> ${name}</p>
          <p><strong>البريد الإلكتروني:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>الموضوع:</strong> ${subject}</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 15px; border-right: 4px solid #4f46e5;">
            <p style="margin: 0; line-height: 1.6;"><strong>نص الرسالة:</strong><br/><br/> ${message.replace(/\n/g, '<br/>')}</p>
          </div>
        </div>
      `
    };

    // إرسال الإيميل
    await transporter.sendMail(mailOptions);
    
    // إرجاع استجابة النجاح للفرونت اند لكي يظهر رسالة (تم الإرسال بنجاح)
    res.json({ success: true, message: 'تم إرسال رسالتك بنجاح' });

  } catch (err) {
    console.error('Nodemailer Error: ', err);
    res.status(500).json({ error: 'حدث خطأ في السيرفر ولم يتم إرسال الرسالة.' });
  }
});

module.exports = router;