import { useEffect, useState } from 'react';

/**
 * Textos de la pantalla inicial en español, quechua, aymara, guaraní, inglés, francés y portugués.
 * Todos salvo el español: traducción automática con IA (Claude, Anthropic), pendiente
 * de revisión por hablantes. El español es la referencia.
 */
export type Language = 'es' | 'qu' | 'ay' | 'gn' | 'en' | 'pt' | 'fr';

export const LANGUAGES: readonly { readonly id: Language; readonly name: string }[] = [
  { id: 'es', name: 'Español' },
  { id: 'qu', name: 'Runasimi (quechua)' },
  { id: 'ay', name: 'Aymar aru (aymara)' },
  { id: 'gn', name: 'Avañe’ẽ (guaraní)' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'pt', name: 'Português' },
];

const TEXTS = {
  language: {
    es: 'Idioma',
    qu: 'Simi',
    ay: 'Aru',
    gn: 'Ñe’ẽ',
    en: 'Language',
    pt: 'Idioma',
    fr: 'Langue',
  },
  eyebrow: {
    es: 'Laboratorio de simulación agrícola',
    qu: 'Chakra llamk’aypa yachana wasin',
    ay: 'Yapu lurawi yatxatañ uta',
    gn: 'Ñemitỹ ñemoha’ãnga renda',
    en: 'Agricultural simulation lab',
    pt: 'Laboratório de simulação agrícola',
    fr: 'Laboratoire de simulation agricole',
  },
  lead: {
    es: 'Prepara parcelas, cultiva y compara estrategias de rotación en un entorno 3D, con modelos agronómicos explícitos y reproducibles alimentados por datos científicos de la NASA.',
    qu: '3D nisqapi chakrakunata wakichiy, tarpuy, tarpuy muyuykunata tupachiy, NASA willakuykunawan.',
    ay: '3D ukan yapunak wakichma, yapuchma, yapu muyunak chikachma, NASA yatiyawinakampi.',
    gn: 'Embosako’i nekokue, emitỹ ha embojoja ñemitỹ jere 3D-pe, NASA mba’ekuaa ndive.',
    en: 'Prepare plots, grow crops and compare rotation strategies in a 3D environment, with explicit, reproducible agronomic models fed by NASA scientific data.',
    pt: 'Prepare parcelas, cultive e compare estratégias de rotação em um ambiente 3D, com modelos agronômicos explícitos e reprodutíveis alimentados por dados científicos da NASA.',
    fr: 'Préparez des parcelles, cultivez et comparez des stratégies de rotation dans un environnement 3D, avec des modèles agronomiques explicites et reproductibles alimentés par des données scientifiques de la NASA.',
  },
  chooseLocation: {
    es: 'Elegir la ubicación de la granja',
    qu: 'Chakraykipa maypi kasqanta akllay',
    ay: 'Yapuman kawkinkis ajlliña',
    gn: 'Eiporavo nekokue renda',
    en: 'Choose the farm location',
    pt: 'Escolher a localização da fazenda',
    fr: 'Choisir l’emplacement de la ferme',
  },
  continueWith: {
    es: 'Continuar con {name}',
    qu: '{name}wan purichiy',
    ay: '{name}mpi sarantaña',
    gn: 'Eho tenonde {name} ndive',
    en: 'Continue with {name}',
    pt: 'Continuar com {name}',
    fr: 'Continuer avec {name}',
  },
  changeLocation: {
    es: 'Cambiar ubicación',
    qu: 'Maypi kasqanta tikray',
    ay: 'Kawkinkis mayjt’ayaña',
    gn: 'Emoambue renda',
    en: 'Change location',
    pt: 'Mudar localização',
    fr: 'Changer d’emplacement',
  },
  openLab: {
    es: 'Abrir el laboratorio (escena provisional)',
    qu: 'Yachana wasita kichay (qallariq)',
    ay: 'Yatxatañ uta jist’araña (qalltawi)',
    gn: 'Eipe’a ñemoha’ãnga renda (ñepyrũrã)',
    en: 'Open the lab (provisional scene)',
    pt: 'Abrir o laboratório (cena provisória)',
    fr: 'Ouvrir le laboratoire (scène provisoire)',
  },
  compare: {
    es: 'Comparar rotaciones',
    qu: 'Tarpuy muyuykunata tupachiy',
    ay: 'Yapu muyunak chikachaña',
    gn: 'Embojoja ñemitỹ jere',
    en: 'Compare rotations',
    pt: 'Comparar rotações',
    fr: 'Comparer les rotations',
  },
  compareHint: {
    es: 'Abre el comparador de Raíz para Oruro: 45 años de datos de la NASA, ya calculados. No necesita WebGL.',
    qu: 'Raíz tupachinanta Orurupaq kichan: NASA 45 wata willakuykuna, ñam yupasqa. WebGL mana necesitanchu.',
    ay: 'Raíz chikachawip Oruro markatak jist’ari: NASA 45 mara yatiyawinaka, niya jakhuta. Janiw WebGL munkiti.',
    gn: 'Oipe’a Raíz ñembojoja Oruro-rã: 45 ary NASA mba’ekuaa, oñembohasáma. Noikotevẽi WebGL.',
    en: 'Opens the Raíz comparator for Oruro: 45 years of NASA data, already calculated. No WebGL needed.',
    pt: 'Abre o comparador do Raíz para Oruro: 45 anos de dados da NASA, já calculados. Não precisa de WebGL.',
    fr: 'Ouvre le comparateur Raíz pour Oruro : 45 ans de données NASA, déjà calculées. WebGL non nécessaire.',
  },
  systemStatus: {
    es: 'Estado del sistema',
    qu: 'Sistemapa kaynin',
    ay: 'Sistema kunjamaski',
    gn: 'Sistema reko',
    en: 'System status',
    pt: 'Estado do sistema',
    fr: 'État du système',
  },
  aiNotice: {
    es: 'Traducción automática con IA (Claude): puede tener errores y está pendiente de revisión por hablantes. El español es la referencia; los datos técnicos siguen en español.',
    qu: 'IA nisqawan tikrasqa (Claude): pantasqakuna kanman, rimaqkuna manaraq qhawarinkuchu.',
    ay: 'IA ukamp jaqukipata (Claude): pantjatanakaw utjaspa, aru parlirinakax janïraw uñakipapkiti.',
    gn: 'IA omoambue ñe’ẽ (Claude): ikatu oreko jejavy ha ñe’ẽhára ndohechái gueteri.',
    en: 'AI machine translation (Claude): it may contain errors and has not been reviewed by speakers. Spanish is the reference; technical data stay in Spanish.',
    pt: 'Tradução automática com IA (Claude): pode ter erros e ainda não foi revisada por falantes. O espanhol é a referência; os dados técnicos continuam em espanhol.',
    fr: 'Traduction automatique par IA (Claude) : elle peut contenir des erreurs et n’a pas été relue par des locuteurs. L’espagnol fait référence ; les données techniques restent en espagnol.',
  },
} as const satisfies Record<string, Record<Language, string>>;

export type TextKey = keyof typeof TEXTS;

export function translate(
  key: TextKey,
  language: Language,
  vars: Record<string, string> = {},
): string {
  return Object.entries(vars).reduce<string>(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    TEXTS[key][language],
  );
}

const STORAGE_KEY = 'raiz-idioma';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((item) => item.id === value);
}

function readStored(): Language {
  try {
    const fromUrl = new URLSearchParams(globalThis.location.search).get('idioma');
    if (isLanguage(fromUrl)) return fromUrl;
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : 'es';
  } catch {
    return 'es';
  }
}

/** Idioma elegido, recordado en este navegador. */
export function useLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>(readStored);
  useEffect(() => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Preferencia válida solo durante la sesión.
    }
  }, [language]);
  return [language, setLanguage];
}

export { isLanguage };

/** true si la persona ya eligió idioma (en la URL o guardado). Leer antes del primer render. */
export function isLanguageConfigured(): boolean {
  try {
    if (isLanguage(new URLSearchParams(globalThis.location.search).get('idioma'))) return true;
    return globalThis.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}
