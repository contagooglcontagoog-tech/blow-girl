const axios = require('axios');

const DICE_URL      = 'https://dev.use-dice.com';
const CLIENT_ID     = process.env.DICE_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.DICE_CLIENT_SECRET || '';
const WEBHOOK_URL   = process.env.WEBHOOK_URL        || '';

let _token  = null;
let _expiry = 0;

async function getDiceToken() {
  if (_token && Date.now() < _expiry) return _token;
  const res = await axios.post(`${DICE_URL}/api/v1/auth/login`, {
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET
  });
  _token  = res.data.token || res.data.access_token;
  _expiry = Date.now() + 50 * 60 * 1000;
  return _token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, erro: 'Method not allowed' });

  try {
    const { nome, email, cpf, tel, produto_nome, total } = req.body;

    if (!nome || !email || !cpf || !total)
      return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: nome, email, cpf, total.' });
    if (total < 2)
      return res.status(400).json({ ok: false, erro: 'Valor mínimo é R$ 2,00.' });

    const token = await getDiceToken();

    const payload = {
      product_name: `BlowGirl — ${produto_nome || 'Pedido'}`,
      amount:       parseFloat(parseFloat(total).toFixed(2)),
      payer: {
        name:     nome,
        email:    email,
        document: cpf.replace(/\D/g, ''),
      },
    };
    if (tel) payload.payer.phone = tel.replace(/\D/g, '');
    if (WEBHOOK_URL) payload.clientCallbackUrl = WEBHOOK_URL;

    const { data } = await axios.post(
      `${DICE_URL}/api/v2/payments/deposit`,
      payload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    return res.json({
      ok:           true,
      qr_code_text: data.qr_code_text,
      payment_id:   data.transaction_id || data.id || data.payment_id || null,
      expires_at:   data.expires_at || null,
    });

  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('[BlowGirl/Dice] Erro:', msg, err.response?.data);
    if (err.response?.status === 401) { _token = null; _expiry = 0; }
    return res.status(500).json({ ok: false, erro: msg || 'Erro interno ao criar pagamento.' });
  }
};
