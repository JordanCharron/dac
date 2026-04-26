import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import en from './en.json';

const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('dac_lang')) || 'fr';

i18next
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    lng: saved,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });

export const i18n = i18next;

export function setLang(lang: 'fr' | 'en') {
  i18next.changeLanguage(lang);
  localStorage.setItem('dac_lang', lang);
  document.documentElement.lang = lang;
}
