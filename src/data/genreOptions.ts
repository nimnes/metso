export type GenreOption = {
  value: string
  labels: {
    en: string
    ru: string
  }
  finnaValues: string[]
}

export const GENRE_OPTIONS: GenreOption[] = [
  {
    value: 'fiction',
    labels: { en: 'Fiction', ru: 'Художественная литература' },
    finnaValues: ['Kaunokirjallisuus', 'Skönlitteratur'],
  },
  {
    value: 'novels',
    labels: { en: 'Novels', ru: 'Романы' },
    finnaValues: ['Romaanit', 'Romaner'],
  },
  {
    value: 'children',
    labels: { en: "Children's books", ru: 'Детские книги' },
    finnaValues: ['Lastenkirjallisuus', 'Barnlitteratur'],
  },
  {
    value: 'picture-books',
    labels: { en: 'Picture books', ru: 'Книжки с картинками' },
    finnaValues: ['Kuvakirjat', 'Bilderböcker'],
  },
  {
    value: 'young-adult',
    labels: { en: 'Young adult', ru: 'Подростковые книги' },
    finnaValues: ['Nuortenkirjallisuus', 'Ungdomslitteratur'],
  },
  {
    value: 'mystery-thriller',
    labels: { en: 'Mystery and thriller', ru: 'Детективы и триллеры' },
    finnaValues: ['Jännityskirjallisuus', 'Thrillers (litteratur)', 'Rikoskirjallisuus'],
  },
  {
    value: 'memoirs',
    labels: { en: 'Memoirs', ru: 'Мемуары' },
    finnaValues: ['Muistelmat', 'Memoarer'],
  },
  {
    value: 'biographies',
    labels: { en: 'Biographies', ru: 'Биографии' },
    finnaValues: ['Elämäkerrat'],
  },
  {
    value: 'comics',
    labels: { en: 'Comics', ru: 'Комиксы' },
    finnaValues: ['Sarjakuvat'],
  },
  {
    value: 'poetry',
    labels: { en: 'Poetry', ru: 'Поэзия' },
    finnaValues: ['Runot', 'Dikter'],
  },
  {
    value: 'humor',
    labels: { en: 'Humor', ru: 'Юмор' },
    finnaValues: ['Huumori'],
  },
]
