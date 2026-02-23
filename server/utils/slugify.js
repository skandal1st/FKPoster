const { get } = require('../db');

const RESERVED_SLUGS = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'static', 'cdn'];

const TRANSLIT_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function transliterate(str) {
  return str
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

async function generateUniqueSlug(companyName, txClient) {
  const base = transliterate(companyName);
  if (!base) return 'tenant';

  const query = txClient ? txClient.get : get;

  const existing = await query('SELECT id FROM tenants WHERE slug = $1', [base]);
  if (!existing) return base;

  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    const found = await query('SELECT id FROM tenants WHERE slug = $1', [candidate]);
    if (!found) return candidate;
  }

  return `${base}-${Date.now()}`;
}

function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') return 'Адрес заведения обязателен';
  if (slug.length < 3 || slug.length > 63) return 'Адрес должен быть от 3 до 63 символов';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) return 'Адрес может содержать только латинские буквы, цифры и дефис, и не должен начинаться/заканчиваться дефисом';
  if (RESERVED_SLUGS.includes(slug)) return 'Этот адрес зарезервирован';
  return null;
}

module.exports = { transliterate, generateUniqueSlug, validateSlug, RESERVED_SLUGS };
