import type { Book } from '../types'

const SUPPORTED_LANGUAGE_CODES = new Set(['eng', 'rus'])

const FANTLAB_SUBJECT_HINTS = [
  'adventure',
  'cyberpunk',
  'detective',
  'dystopia',
  'fantasy',
  'fiction',
  'horror',
  'novel',
  'science fiction',
  'speculative',
  'thriller',
  'seikkailu',
  'dystopia',
  'fantasia',
  'fantasiakirjallisuus',
  'jännityskirjallisuus',
  'kauhukirjallisuus',
  'kyberpunk',
  'romaanit',
  'salapoliisikirjallisuus',
  'tieteiskirjallisuus',
  'утопия',
  'антиутопия',
  'детектив',
  'киберпанк',
  'приключ',
  'роман',
  'триллер',
  'ужас',
  'фантаст',
  'фэнтези',
]

export function shouldUseFantLab(book: Pick<Book, 'formats' | 'languages' | 'subjects'>): boolean {
  return hasSupportedLanguage(book.languages) && hasFantLabSubjectHint(book)
}

function hasSupportedLanguage(languages: string[]): boolean {
  return languages.some((language) => SUPPORTED_LANGUAGE_CODES.has(language))
}

function hasFantLabSubjectHint(book: Pick<Book, 'formats' | 'subjects'>): boolean {
  const metadata = [...book.subjects, ...book.formats].join(' ').toLocaleLowerCase('fi')
  return FANTLAB_SUBJECT_HINTS.some((hint) => metadata.includes(hint))
}
