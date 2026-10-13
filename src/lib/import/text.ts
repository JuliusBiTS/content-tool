const DIACRITICS = /[̀-ͯ]/g

/** Lower-case, accent-free, punctuation-free — for comparing titles across services. */
export const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
