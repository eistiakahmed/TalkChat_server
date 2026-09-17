import { Request, Response, NextFunction } from 'express';
import enLocale from './locales/en.json';
import bnLocale from './locales/bn.json';

export const SUPPORTED_LANGUAGES = ['en', 'bn'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

const locales: Record<SupportedLanguage, Record<string, any>> = {
  en: enLocale,
  bn: bnLocale,
};

/**
 * Parses the Accept-Language header and returns the best matching supported language.
 * Follows HTTP/1.1 content negotiation priority specification.
 * 
 * @see https://datatracker.ietf.org/doc/html/rfc9110#section-12.5.4
 */
export function parseAcceptLanguage(header?: string): SupportedLanguage {
  if (!header) return DEFAULT_LANGUAGE;

  // Format: "bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7"
  const languages = header
    .split(',')
    .map((lang) => {
      const [code, priority] = lang.trim().split(';q=');
      return {
        code: code.trim().toLowerCase(),
        priority: priority ? parseFloat(priority) : 1.0,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  for (const { code } of languages) {
    if (code.startsWith('bn')) return 'bn';
    if (code.startsWith('en')) return 'en';
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Resolves a dot-notated translation key for the specified language.
 */
export function t(key: string, lang: string = DEFAULT_LANGUAGE): string {
  const language = (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
    ? lang
    : DEFAULT_LANGUAGE) as SupportedLanguage;

  const keys = key.split('.');
  let current: any = locales[language];

  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      // Fallback to English if missing in selected language
      let fallback: any = locales[DEFAULT_LANGUAGE];
      for (const fbKey of keys) {
        if (fallback && typeof fallback === 'object' && fbKey in fallback) {
          fallback = fallback[fbKey];
        } else {
          return key; // return key as last resort
        }
      }
      return typeof fallback === 'string' ? fallback : key;
    }
  }

  return typeof current === 'string' ? current : key;
}

/**
 * Express middleware to attach language to Request.
 */
export function i18nMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const acceptLanguageHeader = req.headers['accept-language'];
  req.language = parseAcceptLanguage(acceptLanguageHeader);
  next();
}
