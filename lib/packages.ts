// Пакеты пополнения и утилиты для работы с ними

// Константа конвертации: 250 Telegram Stars = $4.84, значит 1 Star = $0.01936
const STAR_TO_USD_RATE = 4.84 / 250 // = 0.01936

// Пакеты пополнения
export const PACKAGES = {
  1: { 
    messages: 200, 
    stars: 249, 
    oldStars: 349, 
    discount: 29, 
    savings: 100, 
    name: 'Базовый' 
  },
  2: { 
    messages: 1000, 
    stars: 999, 
    oldStars: 1299, 
    discount: 23, 
    savings: 300, 
    name: 'Стандартный' 
  },
  3: { 
    messages: 3000, 
    stars: 2499, 
    oldStars: 2999, 
    discount: 17, 
    savings: 500, 
    name: 'Премиум' 
  },
} as const

export type PackageId = keyof typeof PACKAGES

// Функция конвертации звезд в доллары
export function starsToUsd(stars: number): number {
  return stars * STAR_TO_USD_RATE
}

// Функция конвертации долларов в центы (для Telegram API)
export function usdToCents(usd: number): number {
  return Math.round(usd * 100)
}

// Получить стоимость пакета в долларах
export function getPackageUsdPrice(packageId: PackageId): number {
  const pkg = PACKAGES[packageId]
  return starsToUsd(pkg.stars)
}

// Получить стоимость пакета в центах (для Telegram API)
export function getPackageCentsPrice(packageId: PackageId): number {
  return usdToCents(getPackageUsdPrice(packageId))
}

// Получить старую цену пакета в долларах
export function getPackageOldUsdPrice(packageId: PackageId): number {
  const pkg = PACKAGES[packageId]
  return starsToUsd(pkg.oldStars)
}

