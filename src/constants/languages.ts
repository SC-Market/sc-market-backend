export interface Language {
  code: string // ISO 639-1 code (e.g., 'en', 'es', 'fr')
  name: string // Display name (e.g., 'English', 'Spanish')
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "tr", name: "Türkçe" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
  { code: "no", name: "Norsk" },
  { code: "fi", name: "Suomi" },
  { code: "cs", name: "Čeština" },
  { code: "hu", name: "Magyar" },
  { code: "ro", name: "Română" },
  { code: "el", name: "Ελληνικά" },
  { code: "he", name: "עברית" },
  { code: "th", name: "ไทย" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ms", name: "Bahasa Melayu" },
  { code: "uk", name: "Українська" },
  { code: "sk", name: "Slovenčina" },
]

/**
 * Get language name from language code
 * @param code - ISO 639-1 language code
 * @returns Language name or undefined if not found
 */
export function getLanguageName(code: string): string | undefined {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code)?.name
}

/**
 * Check if a language code is valid
 * @param code - Language code to validate
 * @returns true if valid, false otherwise
 */
export function isValidLanguageCode(code: string): boolean {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code)
}

/**
 * Validate an array of language codes
 * @param codes - Array of language codes to validate
 * @returns Object with validation result and list of invalid codes
 */
export function validateLanguageCodes(codes: string[]): {
  valid: boolean
  invalid: string[]
} {
  const invalid = codes.filter((code) => !isValidLanguageCode(code))
  return {
    valid: invalid.length === 0,
    invalid,
  }
}
