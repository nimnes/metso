export type TampereBranch = {
  code: string
  label: string
}

export const TAMPERE_CITY_CODE = '1/Piki/1/'

export const TAMPERE_BRANCHES: TampereBranch[] = [
  { code: 'holdings:1 001 piki', label: 'Main library Metso' },
  { code: 'holdings:1 021 piki', label: 'Hervanta' },
  { code: 'holdings:1 007 piki', label: 'Härmälä' },
  { code: 'holdings:1 006 piki', label: 'Kaukajärvi' },
  { code: 'holdings:1 005 piki', label: 'Koilliskeskus' },
  { code: 'holdings:1 008 piki', label: 'Koivistonkylä' },
  { code: 'holdings:1 015 piki', label: 'Koukkuniemi' },
  { code: 'holdings:1 020 piki', label: 'Lielahti' },
  { code: 'holdings:1 012 piki', label: 'Messukylä' },
  { code: 'holdings:1 019 piki', label: 'Nekala' },
  { code: 'holdings:1 024 piki', label: 'Peltolammi' },
  { code: 'holdings:1 003 piki', label: 'Sampola' },
  { code: 'holdings:1 016 piki', label: 'Terälahti' },
  { code: 'holdings:1 013 piki', label: 'Tesoma' },
  { code: 'holdings:1 011 piki', label: 'Vuores' },
]

export const TAMPERE_HOLDING_LABELS = new Map(
  TAMPERE_BRANCHES.map((branch) => [branch.code.replace('holdings:', ''), branch.label]),
)

export const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any language' },
  { value: 'fin', label: 'Finnish' },
  { value: 'eng', label: 'English' },
  { value: 'rus', label: 'Russian' },
  { value: 'swe', label: 'Swedish' },
  { value: 'fra', label: 'French' },
  { value: 'ger', label: 'German' },
]

export const LANGUAGE_LABELS: Record<string, string> = {
  fin: 'Finnish',
  eng: 'English',
  rus: 'Russian',
  swe: 'Swedish',
  fra: 'French',
  ger: 'German',
  spa: 'Spanish',
  est: 'Estonian',
}
