// Posts one thread from threads.md to X via the X API v2: each tweet replies to the previous one, images attached.
// Dry run by default — prints the tweets, their weighted length and the images. Posting needs --post.
// Auth: OAuth 1.0a user context (app with Read and Write). Reads X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN,
// X_ACCESS_TOKEN_SECRET from the environment. No dependencies.
// Usage: node docs/social/twitter/post.mjs <thread 1-7> [--post] [--from <tweet n> --reply-to <tweet id>]
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.x.com/2';

// threads.md → [{ title, tweets: [{ text, image? }] }]
export function parseThreads(md) {
  return md.split(/^## /m).slice(1).filter((s) => /^Thread \d+/.test(s)).map((s) => {
    const tweets = [];
    const re = /```text\n([\s\S]*?)\n```(?:\n🖼 `([^`]+)`)?/g;
    for (let m; (m = re.exec(s));) tweets.push({ text: m[1], image: m[2] });
    return { title: s.split('\n')[0], tweets };
  });
}

// X counts most characters as 1 and the rest (arrows, emoji, CJK) as 2; any URL counts as 23.
const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
export const weighted = (t) => [...t.replace(/https?:\/\/\S+/g, 'x'.repeat(23))]
  .reduce((n, c) => n + (LIGHT.some(([a, b]) => c.codePointAt(0) >= a && c.codePointAt(0) <= b) ? 1 : 2), 0);

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
// OAuth 1.0a HMAC-SHA1. JSON and multipart bodies are not part of the signature, only query + oauth_* params.
export function oauthHeader(method, url, keys, extra = {}, nonce = randomBytes(16).toString('hex'), ts = Math.floor(Date.now() / 1000)) {
  const o = { oauth_consumer_key: keys.apiKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(ts), oauth_token: keys.token, oauth_version: '1.0' };
  const params = { ...extra, ...o };
  const base = [method, pct(url), pct(Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&'))].join('&');
  o.oauth_signature = createHmac('sha1', `${pct(keys.apiSecret)}&${pct(keys.tokenSecret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).sort().map((k) => `${pct(k)}="${pct(o[k])}"`).join(', ');
}

async function call(keys, url, init) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: oauthHeader(init.method, url, keys) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
async function uploadImage(keys, file) {
  const form = new FormData();
  form.append('media', new Blob([readFileSync(file)], { type: 'image/png' }), basename(file));
  form.append('media_category', 'tweet_image');
  return (await call(keys, `${API}/media/upload`, { method: 'POST', body: form })).data.id;
}
async function tweet(keys, text, mediaId, replyTo) {
  const body = { text, ...(mediaId && { media: { media_ids: [mediaId] } }), ...(replyTo && { reply: { in_reply_to_tweet_id: replyTo } }) };
  return (await call(keys, `${API}/tweets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).data.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const n = Number(args[0]);
  const threads = parseThreads(readFileSync(join(here, 'threads.md'), 'utf8'));
  if (!threads[n - 1]) { console.error(`Usage: post.mjs <thread 1-${threads.length}> [--post] [--from <n> --reply-to <id>]`); process.exit(1); }
  const { title, tweets } = threads[n - 1];
  const from = Number(opt('--from') ?? 1);
  let replyTo = opt('--reply-to');
  if (from > 1 && !replyTo) { console.error('--from needs --reply-to <id of the last posted tweet>'); process.exit(1); }

  const over = tweets.filter((t) => weighted(t.text) > 280);
  if (over.length) { console.error(`Over 280: ${over.map((t) => t.text.slice(0, 40)).join(' | ')}`); process.exit(1); }

  console.log(`${title} — ${tweets.length} tweets${from > 1 ? `, starting at ${from}` : ''}\n`);
  if (!args.includes('--post')) {
    tweets.forEach((t, i) => console.log(`[${i + 1}/${tweets.length}] ${weighted(t.text)} chars${t.image ? ` + ${t.image}` : ''}\n${t.text}\n`));
    console.log('Dry run. Add --post to publish.');
    process.exit(0);
  }
  const keys = { apiKey: process.env.X_API_KEY, apiSecret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_TOKEN_SECRET };
  const missing = Object.entries({ X_API_KEY: keys.apiKey, X_API_SECRET: keys.apiSecret, X_ACCESS_TOKEN: keys.token, X_ACCESS_TOKEN_SECRET: keys.tokenSecret }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) { console.error(`Missing env: ${missing.join(', ')}`); process.exit(1); }

  for (let i = from - 1; i < tweets.length; i++) {
    const t = tweets[i];
    try {
      const media = t.image ? await uploadImage(keys, join(here, t.image)) : undefined;
      replyTo = await tweet(keys, t.text, media, replyTo);
      console.log(`[${i + 1}/${tweets.length}] posted ${replyTo}${i === 0 ? `  https://x.com/i/status/${replyTo}` : ''}`);
    } catch (e) {
      console.error(`[${i + 1}/${tweets.length}] failed: ${e.message}`);
      if (i > 0) console.error(`Resume: node docs/social/twitter/post.mjs ${n} --post --from ${i + 1} --reply-to ${replyTo}`);
      process.exit(1);
    }
  }
  console.log('Done.');
}
