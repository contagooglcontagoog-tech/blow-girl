module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ev     = req.body;
  const status = (ev.status || ev.state || '').toUpperCase();
  const id     = ev.transaction_id || ev.id || '';
  const amount = ev.amount || 0;
  const name   = ev.product_name || '';

  console.log('[BlowGirl Webhook] status=%s id=%s amount=%s produto=%s', status, id, amount, name);

  if (status === 'PAID' || status === 'APPROVED') {
    /* Extensão futura: disparar e-mail, Telegram, CRM, etc. */
  }

  return res.sendStatus(200);
};
