import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { messages, type Locale } from '../i18n';

const LocaleContext = createContext({
  locale: 'zh' as Locale,
  setLocale: (_locale: Locale) => {},
  t: (key: string) => messages.zh[key] || key,
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      return localStorage.getItem('dashboard-locale') === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });
  const updateLocale = useCallback((value: Locale) => {
    setLocale(value);
    try {
      localStorage.setItem('dashboard-locale', value);
    } catch {
      /* The selector also works without browser storage. */
    }
  }, []);
  const t = useCallback(
    (key: string) => messages[locale][key] || key,
    [locale]
  );
  return (
    <LocaleContext.Provider value={{ locale, setLocale: updateLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}
export const useLocale = () => useContext(LocaleContext);
