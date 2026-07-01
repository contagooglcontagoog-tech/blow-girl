/**
 * Facebook Conversions API (server-side)
 * Envia eventos do lado do servidor para melhorar o match rate.
 * Env vars: FB_PIXEL_ID, FB_ACCESS_TOKEN
 */
const axios = require('axios');
const crypto = require('crypto');

const FB_PIXEL_ID     = process.env.FB_PIXEL_ID     || '';
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || '';
const FB_API_VERSION  = 'v19.0';

function hash(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
    return res.status(200).json({ ok: false, msg: 'FB não configurado' });
  }

  try {
    const { event, params = {}, url } = req.body;

    const userData = {};
    if (params.email)  userData.em  = [hash(params.email)];
    if (params.phone)  userData.ph  = [hash(params.phone)];
    if (params.name)   userData.fn  = [hash(params.name)];

    /* IP e User-Agent do request de origem */
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    if (ip) userData.client_ip_address = ip;
    if (ua) userData.client_user_agent = ua;

    const customData = {};
    if (params.value)        customData.value        = params.value;
    if (params.currency)     customData.currency     = params.currency;
    if (params.content_ids)  customData.content_ids  = params.content_ids;
    if (params.content_name) customData.content_name = params.content_name;
    if (params.content_type) customData.content_type = params.content_type;
    if (params.num_items)    customData.num_items    = params.num_items;

    const eventData = {
      event_name:  event || 'PageView',
      event_time:  Math.floor(Date.now() / 1000),
      event_source_url: url || 'https://www.blowgirl.com.br',
      action_source: 'website',
      user_data:   userData,
      custom_data: customData,
    };
    if (params.event_id) eventData.event_id = params.event_id;

    const payload = { data: [eventData] };

    const { data } = await axios.post(
      `https://graph.facebook.com/${FB_API_VERSION}/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.json({ ok: true, events_received: data.events_received });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[FB Conversions API] Erro:', msg);
    return res.status(500).json({ ok: false, erro: msg });
  }
};
