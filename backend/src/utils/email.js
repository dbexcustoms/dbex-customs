const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error('sendMail failed:', err.message);
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendWelcomeEmail(user) {
  return sendMail({
    to: user.email,
    subject: 'Добро пожаловать в DBEX Customs',
    html: `<p>Здравствуйте, ${escapeHtml(user.full_name)}!</p>
           <p>Ваш аккаунт в DBEX Customs создан. Вы можете подать первую заявку на таможенное оформление в личном кабинете.</p>`,
  });
}

async function sendApplicationCreatedEmail(user, application) {
  await sendMail({
    to: user.email,
    subject: `Заявка #${application.id} принята`,
    html: `<p>Здравствуйте, ${escapeHtml(user.full_name)}!</p>
           <p>Мы получили вашу заявку #${application.id} (${escapeHtml(application.operation_type)}).
           Ориентировочная стоимость: €${application.estimate_low} – €${application.estimate_high}.</p>
           <p>Загрузите документы по заявке в личном кабинете, чтобы мы могли начать оформление.</p>`,
  });
  if (process.env.ADMIN_NOTIFY_EMAIL) {
    await sendMail({
      to: process.env.ADMIN_NOTIFY_EMAIL,
      subject: `Новая заявка #${application.id} от ${user.email}`,
      html: `<p>Тип операции: ${escapeHtml(application.operation_type)}</p>
             <p>Стоимость груза: €${application.cargo_value}</p>
             <p>Клиент: ${escapeHtml(user.full_name)} (${escapeHtml(user.email)})</p>`,
    });
  }
}

async function sendStatusChangedEmail(user, application) {
  return sendMail({
    to: user.email,
    subject: `Статус заявки #${application.id} обновлён`,
    html: `<p>Здравствуйте, ${escapeHtml(user.full_name)}!</p>
           <p>Новый статус заявки #${application.id}: <strong>${escapeHtml(application.status)}</strong>.</p>`,
  });
}

module.exports = { sendMail, sendWelcomeEmail, sendApplicationCreatedEmail, sendStatusChangedEmail };
