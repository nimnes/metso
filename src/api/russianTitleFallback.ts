const CYRILLIC_PATTERN = /[А-Яа-яЁё]/

const MULTI_LETTER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/shch/g, 'щ'],
  [/štš/g, 'щ'],
  [/tš/g, 'ч'],
  [/tsch/g, 'ч'],
  [/ts/g, 'ц'],
  [/zh/g, 'ж'],
  [/ž/g, 'ж'],
  [/sh/g, 'ш'],
  [/š/g, 'ш'],
  [/č/g, 'ч'],
  [/kh/g, 'х'],
  [/â/g, 'я'],
  [/û/g, 'ю'],
  [/ë/g, 'ё'],
  [/ij\b/g, 'ий'],
  [/yj\b/g, 'ый'],
  [/ja/g, 'я'],
  [/ya/g, 'я'],
  [/ju/g, 'ю'],
  [/yu/g, 'ю'],
  [/jo/g, 'ё'],
  [/yo/g, 'ё'],
  [/je/g, 'е'],
  [/ye/g, 'е'],
]

const LETTER_MAP: Record<string, string> = {
  a: 'а',
  b: 'б',
  c: 'к',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'х',
  i: 'и',
  j: 'й',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'кс',
  y: 'ы',
  z: 'з',
  ä: 'я',
}

const FINNISH_ROMANIZATION: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'jo',
  ж: 'ž',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'tš',
  ш: 'š',
  щ: 'štš',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'ju',
  я: 'ja',
}

const ASCII_ROMANIZATION: Record<string, string> = {
  ...FINNISH_ROMANIZATION,
  ё: 'yo',
  ж: 'zh',
  й: 'y',
  х: 'kh',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ю: 'yu',
  я: 'ya',
}

export function getRussianTitleFallback(title?: string): string | undefined {
  const cleaned = title?.replace(/\s+/g, ' ').trim()
  if (!cleaned || CYRILLIC_PATTERN.test(cleaned)) return undefined

  const transliterated = cleaned.replace(/[A-Za-zšžčŠŽČâûëÂÛËäÄ]+/g, transliterateWord).replace(/\s+([:;,.!?])/g, '$1')
  return CYRILLIC_PATTERN.test(transliterated) ? transliterated : undefined
}

export function getRussianSearchQueryVariants(query: string): string[] {
  const cleaned = query.replace(/\s+/g, ' ').trim()
  if (!CYRILLIC_PATTERN.test(cleaned)) return [cleaned]

  const finnish = transliterateCyrillic(cleaned, FINNISH_ROMANIZATION)
  const ascii = transliterateCyrillic(cleaned, ASCII_ROMANIZATION)
  const commonYoVariant = finnish.replace(/\bvse\b/gi, 'vsjo')

  return unique([cleaned, finnish, commonYoVariant, ascii].map((value) => value.replace(/\s+([:;,.!?])/g, '$1')))
}

function transliterateWord(word: string): string {
  const capitalized = /^[A-ZŠŽČÂÛËÄ]/.test(word)
  let value = word.toLocaleLowerCase()

  value = value.replace(/([bcdfghjklmnpqrstvwxzšžč])j([eё])/g, '$1ь$2')
  for (const [pattern, replacement] of MULTI_LETTER_REPLACEMENTS) {
    value = value.replace(pattern, replacement)
  }

  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const letter = value[index]
    if (letter === 'e' && index === 0) {
      result += 'э'
    } else {
      result += LETTER_MAP[letter] ?? letter
    }
  }

  return capitalized ? result.charAt(0).toLocaleUpperCase() + result.slice(1) : result
}

function transliterateCyrillic(value: string, alphabet: Record<string, string>): string {
  let result = ''

  for (const character of value) {
    const lower = character.toLocaleLowerCase()
    const replacement = alphabet[lower]
    if (replacement === undefined) {
      result += character
      continue
    }

    result += character === lower ? replacement : capitalizeReplacement(replacement)
  }

  return result
}

function capitalizeReplacement(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
