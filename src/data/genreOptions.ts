export type GenreFilterField = 'genre_facet' | 'major_genre_str_mv' | 'topic_facet'

export type GenreFilter = {
  field: GenreFilterField
  value: string
}

export type GenreOption = {
  value: string
  labels: {
    en: string
    ru: string
  }
  finnaFilters: GenreFilter[]
}

const genre = (value: string): GenreFilter => ({ field: 'genre_facet', value })
const majorGenre = (value: string): GenreFilter => ({ field: 'major_genre_str_mv', value })
const topic = (value: string): GenreFilter => ({ field: 'topic_facet', value })

export const GENRE_OPTIONS: GenreOption[] = [
  {
    value: 'fiction',
    labels: { en: 'Fiction', ru: 'Художественная литература' },
    finnaFilters: [genre('Kaunokirjallisuus'), genre('Romaanit')],
  },
  {
    value: 'children',
    labels: { en: "Children's", ru: 'Детские книги' },
    finnaFilters: [genre('Lastenkirjallisuus'), genre('Kuvakirjat'), genre('Paksulehtiset kirjat')],
  },
  {
    value: 'young-adult',
    labels: { en: 'Young Adult', ru: 'Подростковые книги' },
    finnaFilters: [genre('Nuortenkirjallisuus'), genre('Nuorten aikuisten kirjat')],
  },
  {
    value: 'easy-language',
    labels: { en: 'Easy language', ru: 'Книги на простом языке' },
    finnaFilters: [genre('Selkokirjat'), genre('Helppolukuiset kirjat')],
  },
  {
    value: 'classics',
    labels: { en: 'Classics', ru: 'Классика' },
    finnaFilters: [genre('Klassikot')],
  },
  {
    value: 'comics',
    labels: { en: 'Comics', ru: 'Комиксы' },
    finnaFilters: [genre('Sarjakuvat'), genre('Sarjakuvaromaanit')],
  },
  {
    value: 'graphic-novels',
    labels: { en: 'Graphic Novels', ru: 'Графические романы' },
    finnaFilters: [genre('Sarjakuvaromaanit'), genre('Sarjakuvat')],
  },
  {
    value: 'manga',
    labels: { en: 'Manga', ru: 'Манга' },
    finnaFilters: [topic('manga')],
  },
  {
    value: 'fantasy',
    labels: { en: 'Fantasy', ru: 'Фэнтези' },
    finnaFilters: [genre('Fantasiakirjallisuus')],
  },
  {
    value: 'science-fiction',
    labels: { en: 'Science Fiction', ru: 'Научная фантастика' },
    finnaFilters: [genre('Tieteiskirjallisuus'), genre('Science fiction')],
  },
  {
    value: 'horror',
    labels: { en: 'Horror', ru: 'Ужасы' },
    finnaFilters: [genre('Kauhukirjallisuus')],
  },
  {
    value: 'crime',
    labels: { en: 'Crime', ru: 'Криминальная литература' },
    finnaFilters: [genre('Rikoskirjallisuus')],
  },
  {
    value: 'mystery',
    labels: { en: 'Mystery', ru: 'Детективы' },
    finnaFilters: [genre('Salapoliisikirjallisuus'), genre('Jännityskirjallisuus')],
  },
  {
    value: 'thriller',
    labels: { en: 'Thriller', ru: 'Триллеры' },
    finnaFilters: [genre('Trillerit'), genre('Thrillers (litteratur)'), genre('Jännityskirjallisuus')],
  },
  {
    value: 'suspense',
    labels: { en: 'Suspense', ru: 'Саспенс' },
    finnaFilters: [genre('Jännityskirjallisuus')],
  },
  {
    value: 'romance',
    labels: { en: 'Romance', ru: 'Романтика' },
    finnaFilters: [genre('Rakkausromaanit')],
  },
  {
    value: 'historical-fiction',
    labels: { en: 'Historical Fiction', ru: 'Исторические романы' },
    finnaFilters: [genre('Historialliset romaanit')],
  },
  {
    value: 'poetry',
    labels: { en: 'Poetry', ru: 'Поэзия' },
    finnaFilters: [genre('Runot'), genre('Dikter')],
  },
  {
    value: 'humor',
    labels: { en: 'Humor & Comedy', ru: 'Юмор и комедия' },
    finnaFilters: [genre('Huumori')],
  },
  {
    value: 'chick-lit',
    labels: { en: 'Chick-lit', ru: 'Женская проза' },
    finnaFilters: [genre('Chick lit'), genre('Viihdekirjallisuus')],
  },
  {
    value: 'biography',
    labels: { en: 'Biography', ru: 'Биографии' },
    finnaFilters: [genre('Elämäkerrat')],
  },
  {
    value: 'memoir',
    labels: { en: 'Memoir', ru: 'Мемуары' },
    finnaFilters: [genre('Muistelmat')],
  },
  {
    value: 'nonfiction',
    labels: { en: 'Nonfiction', ru: 'Нон-фикшн' },
    finnaFilters: [majorGenre('nonfiction')],
  },
  {
    value: 'art',
    labels: { en: 'Art', ru: 'Искусство' },
    finnaFilters: [topic('taide'), topic('taiteilijat'), topic('kuvataide')],
  },
  {
    value: 'business',
    labels: { en: 'Business', ru: 'Бизнес' },
    finnaFilters: [topic('liiketalous'), topic('yritykset'), topic('yrittäjyys'), topic('johtaminen')],
  },
  {
    value: 'history',
    labels: { en: 'History', ru: 'История' },
    finnaFilters: [topic('historia')],
  },
  {
    value: 'music',
    labels: { en: 'Music', ru: 'Музыка' },
    finnaFilters: [topic('musiikki'), topic('muusikot')],
  },
  {
    value: 'philosophy',
    labels: { en: 'Philosophy', ru: 'Философия' },
    finnaFilters: [topic('filosofia')],
  },
  {
    value: 'psychology',
    labels: { en: 'Psychology', ru: 'Психология' },
    finnaFilters: [topic('psykologia')],
  },
  {
    value: 'religion',
    labels: { en: 'Religion', ru: 'Религия' },
    finnaFilters: [topic('uskonto'), topic('uskonnot')],
  },
  {
    value: 'science',
    labels: { en: 'Science', ru: 'Наука' },
    finnaFilters: [topic('tiede'), topic('luonnontieteet')],
  },
  {
    value: 'spirituality',
    labels: { en: 'Spirituality', ru: 'Духовность' },
    finnaFilters: [topic('henkisyys'), topic('spiritualiteetti')],
  },
  {
    value: 'sports',
    labels: { en: 'Sports', ru: 'Спорт' },
    finnaFilters: [topic('urheilu'), topic('liikunta')],
  },
  {
    value: 'self-help',
    labels: { en: 'Self Help', ru: 'Саморазвитие' },
    finnaFilters: [genre('Elämäntaito-oppaat')],
  },
  {
    value: 'cookbooks',
    labels: { en: 'Cookbooks', ru: 'Кулинария и рецепты' },
    finnaFilters: [genre('Keittokirjat'), genre('Ruokaohjeet')],
  },
  {
    value: 'crafts',
    labels: { en: 'Crafts', ru: 'Рукоделие' },
    finnaFilters: [genre('Käsityöohjeet')],
  },
  {
    value: 'travel',
    labels: { en: 'Travel', ru: 'Путешествия' },
    finnaFilters: [genre('Matkaoppaat')],
  },
]
