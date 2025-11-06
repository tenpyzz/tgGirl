/**
 * Утилиты для работы с Telegram
 */

/**
 * Получает Telegram User ID из запроса
 * Поддерживает получение из query параметра, заголовка x-telegram-init-data
 * или возвращает дефолтный ID для development
 */
export function getTelegramUserId(request: Request): number | null {
  // Проверяем query параметр
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  
  if (userId) {
    return parseInt(userId)
  }
  
  // Проверяем заголовок с initData (для production)
  const initData = request.headers.get('x-telegram-init-data')
  if (initData) {
    try {
      const params = new URLSearchParams(initData)
      const userParam = params.get('user')
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam))
        if (user.id) {
          return user.id
        }
      }
    } catch (e) {
      console.error('Ошибка парсинга initData:', e)
    }
  }
  
  // Для тестирования на localhost используем дефолтный ID
  if (process.env.NODE_ENV === 'development') {
    return 123456789
  }
  
  return null
}

