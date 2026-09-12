export function removeDuplicateRussianTransliteration(value: string): string {
  if (!/[А-Яа-яЁё]/.test(value)) return value

  const candidates = getSentenceBoundaryIndexes(value).filter((index) => index > 80 && index < value.length - 60)
  for (const index of candidates) {
    const cyrillicPart = value.slice(0, index).trim()
    const transliteratedPart = value.slice(index).trim().replace(/^["'«»„“”\s]+/, '')
    if (!isLikelyRussianTransliterationDuplicate(cyrillicPart, transliteratedPart)) continue

    return cyrillicPart
  }

  return value
}

function getSentenceBoundaryIndexes(value: string): number[] {
  const indexes: number[] = []
  const boundaryPattern = /[.!?]["'»“”)]?\s+/g
  let match: RegExpExecArray | null

  while ((match = boundaryPattern.exec(value))) {
    indexes.push(match.index + match[0].length)
  }

  return indexes
}

function isLikelyRussianTransliterationDuplicate(cyrillicPart: string, transliteratedPart: string): boolean {
  if (countMatches(cyrillicPart, /[А-Яа-яЁё]/g) < 50) return false
  if (countMatches(transliteratedPart, /[А-Яа-яЁё]/g) > 5) return false
  if (countMatches(transliteratedPart, /[A-Za-z]/g) < 50) return false

  const normalizedCyrillic = normalizeComparableText(transliterateRussian(cyrillicPart))
  const normalizedLatin = normalizeComparableText(transliteratedPart)
  if (normalizedCyrillic.length < 60 || normalizedLatin.length < 60) return false

  return getTrigramSimilarity(normalizedCyrillic.slice(0, 800), normalizedLatin.slice(0, 800)) > 0.72
}

function normalizeComparableText(value: string): string {
  return value
    .toLocaleLowerCase('en')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function transliterateRussian(value: string): string {
  const transliteration: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
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
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'ju',
    я: 'ja',
  }

  return value.replace(/[А-Яа-яЁё]/g, (character) => transliteration[character.toLocaleLowerCase('ru')] ?? character)
}

function getTrigramSimilarity(left: string, right: string): number {
  const leftGrams = getCharacterNgrams(left, 3)
  const rightGrams = getCharacterNgrams(right, 3)
  if (!leftGrams.size || !rightGrams.size) return 0

  let shared = 0
  leftGrams.forEach((gram) => {
    if (rightGrams.has(gram)) shared += 1
  })

  return (shared * 2) / (leftGrams.size + rightGrams.size)
}

function getCharacterNgrams(value: string, size: number): Set<string> {
  const grams = new Set<string>()
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.add(value.slice(index, index + size))
  }

  return grams
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0
}
