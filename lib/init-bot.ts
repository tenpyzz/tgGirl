// Инициализация бота при старте приложения
import { bot } from './telegram'

// Инициализируем бота при загрузке модуля (для production)
if (process.env.NODE_ENV === 'production') {
  // Инициализируем бота, чтобы установить webhook
  try {
    bot.getMe()
      .then(() => {
        console.log('Бот инициализирован и готов к работе')
      })
      .catch((error) => {
        console.error('Ошибка инициализации бота:', error)
      })
  } catch (error) {
    console.error('Ошибка при попытке инициализации бота:', error)
  }
}

