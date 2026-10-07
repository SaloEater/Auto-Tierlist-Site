// Site strings (site/i18n) and export strings (data/lang).

let siteStrings = {};
let fallbackStrings = {};
let langData = null;

export function shortCode(code) {
  return code.split('_')[0];
}

async function fetchSite(code) {
  const res = await fetch(`i18n/${code}.json`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Load site strings for a language (English as fallback) and the export language file.
 */
export async function setLanguage(code, exportLang) {
  if (!Object.keys(fallbackStrings).length) {
    fallbackStrings = (await fetchSite('en_us')) ?? {};
  }
  siteStrings = (code === 'en_us' ? fallbackStrings : await fetchSite(code)) ?? fallbackStrings;
  langData = exportLang;
  document.documentElement.lang = shortCode(code);
  applyToDom();
}

/** Site string with {placeholder} substitution. */
export function t(key, params = {}) {
  let s = siteStrings[key] ?? fallbackStrings[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function name(id) {
  return langData?.items?.[id]?.name ?? id;
}

export function tooltip(id) {
  return langData?.items?.[id]?.tooltip ?? [];
}

/** Line index where the export removed the game's modifier block, or null. */
export function modifiersAt(id) {
  return langData?.items?.[id]?.modifiersAt ?? null;
}

/** Translated attribute name from the export, or the id when missing. */
export function attributeName(id) {
  return langData?.attributes?.[id] ?? id;
}

/** The game's format string for a key (e.g. "attribute.modifier.plus.0"), or null. */
export function gameFormat(key) {
  return langData?.formats?.[key] ?? null;
}

export function tierName(index) {
  return langData?.armageddonTiers?.[String(index)] ?? `#${index}`;
}

function applyToDom() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  const search = document.getElementById('search');
  if (search) search.placeholder = t('searchPlaceholder');
  document.title = t('title');
}
