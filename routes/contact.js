const express = require('express');
const router = express.Router();

// @route   POST /api/contact
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'الرجاء تعبئة كافة الحقول المطلوبة' });
  }

  try {
    // إرسال رسالة "اتصل بنا" عبر الـ API إلى بريدك الشخصي مباشرة
    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SoftStore Contact <onboarding@resend.dev>',
        to: 'majoriyad@gmail.com', // إيميلك الشخصي المستهدف لاستقبال الشكاوى والاستفسارات
        reply_to: email, // للرد مباشرة على العميل عند الضغط على Reply في بريدك
        subject: `[سوفت ستور] استفسار جديد: ${subject}`,
        html: `
          <div dir="rtl" style="font-family: Arial; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #4f46e5; border-bottom: 1px solid #eee; padding-bottom: 10px;">رسالة تواصل جديدة من الموقع</h2>
            <p><strong>اسم العميل:</strong> ${name}</p>
            <p><strong>البريد الإلكتروني للعميل:</strong> ${email}</p>
            <p><strong>الموضوع:</strong> ${subject}</p>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; border-right: 4px solid #4f46e5; margin-top: 15px;">
              <p style="margin: 0; line-height: 1.6;"><strong>نص الرسالة:</strong><br/> ${message.replace(/\n/g, '<br/>')}</p>
            </div>
          </div>
        `
      })
    });

    if (!mailResponse.ok) {
      const errorData = await mailResponse.json();
      throw new Error(errorData.message || 'فشل الإرسال عبر Resend');
    }

    res.json({ success: true, message: 'تم إرسال رسالتك بنجاح' });

  } catch (err) {
    console.error('Resend Contact Error: ', err);
    res.status(500).json({ error: 'حدث خطأ في السيرفر ولم يتم إرسال الرسالة.' });
  }
});

module.exports = router;