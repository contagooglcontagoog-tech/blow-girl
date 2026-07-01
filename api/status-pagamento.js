const axios = require('axios');

const DICE_URL      = 'https://dev.use-dice.com';
const CLIENT_ID     = process.env.DICE_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.DICE_CLIENT_SECRET || '';

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
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ ok: false, erro: 'id obrigatório' });

  try {
    const token = await getDiceToken();
    const { data } = await axios.get(
      `${DICE_URL}/api/v2/payments/deposit/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.json({ ok: true, status: data.status || data.state || 'PENDING' });
  } catch (err) {
    if (err.response?.status === 401) { _token = null; _expiry = 0; }
    return res.status(500).json({ ok: false, erro: err.message });
  }
};
