// pages/api/verify.js
// Server-side email verification
// MX record lookup + pattern scoring + catch-all detection

const PERSONAL_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'aol.com','protonmail.com','mail.com','zoho.com','yandex.com',
  'live.com','msn.com','me.com','mac.com'
]);

const CATCHALL_SUSPECTS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(200).json({ conf: 'UNKNOWN', reason: 'No email provided', color: 'gray' });
  }

  const [local, domain] = email.toLowerCase().split('@');
  if (!domain) return res.status(200).json({ conf: 'LOW', reason: 'Malformed email', color: 'red' });

  // Level 1: personal domain check
  if (PERSONAL_DOMAINS.has(domain)) {
    return res.status(200).json({
      conf: 'LOW',
      reason: 'Personal/generic domain — not a business email',
      color: 'red'
    });
  }

  // Level 2: MX record lookup via Google DNS
  let hasMX = false;
  let mxRecords = [];
  try {
    const mxRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    if (mxRes.ok) {
      const mxData = await mxRes.json();
      hasMX = mxData.Status === 0 && mxData.Answer && mxData.Answer.length > 0;
      mxRecords = mxData.Answer || [];
    }
  } catch (e) { /* DNS unavailable */ }

  if (!hasMX) {
    return res.status(200).json({
      conf: 'LOW',
      reason: 'Domain has no MX records — cannot receive email',
      color: 'red'
    });
  }

  // Level 3: A record — domain exists
  let domainExists = false;
  try {
    const aRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`);
    if (aRes.ok) {
      const aData = await aRes.json();
      domainExists = aData.Status === 0 && aData.Answer && aData.Answer.length > 0;
    }
  } catch (e) {}

  // Level 4: catch-all / hosted provider detection
  const mxData = mxRecords.map(r => (r.data || '').toLowerCase()).join(' ');
  const isGoogleHosted = mxData.includes('google') || mxData.includes('aspmx');
  const isMicrosoftHosted = mxData.includes('outlook') || mxData.includes('microsoft');
  const isHostedProvider = isGoogleHosted || isMicrosoftHosted;

  // Level 5: local part pattern scoring
  const GOOD_PATTERNS = ['owner', 'info', 'contact', 'hello', 'admin', 'support', 'office'];
  const isGoodPattern = GOOD_PATTERNS.some(p => local.includes(p));
  const isNamePattern = /^[a-z]+(\.[a-z]+)?$/.test(local) && local.length > 2 && local.length < 20;

  // Scoring logic
  if (!domainExists) {
    return res.status(200).json({
      conf: 'LOW',
      reason: 'Domain does not resolve — likely invalid',
      color: 'red'
    });
  }

  if (isHostedProvider) {
    return res.status(200).json({
      conf: 'MEDIUM',
      reason: `Hosted on ${isGoogleHosted ? 'Google Workspace' : 'Microsoft 365'} — cannot verify specific mailbox`,
      color: 'amber'
    });
  }

  if (hasMX && domainExists) {
    if (isGoodPattern) {
      return res.status(200).json({
        conf: 'HIGH',
        reason: 'MX confirmed + standard business pattern (owner/info/contact)',
        color: 'green'
      });
    }
    if (isNamePattern) {
      return res.status(200).json({
        conf: 'HIGH',
        reason: 'MX confirmed + name pattern on business domain',
        color: 'green'
      });
    }
    return res.status(200).json({
      conf: 'MEDIUM',
      reason: 'MX confirmed but pattern is unusual — verify manually',
      color: 'amber'
    });
  }

  return res.status(200).json({
    conf: 'MEDIUM',
    reason: 'Partial signals — send with caution',
    color: 'amber'
  });
}
