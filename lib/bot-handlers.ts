import { bot } from './telegram'
import { TelegramBot } from 'node-telegram-bot-api'

// URL вашего Mini App (замените на реальный URL при деплое)
const MINI_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Обработчик команды /start
bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id
  
  await bot.sendMessage(chatId, 'Добро пожаловать! 👋\n\nВыберите девушку для общения:', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть Mini App 👉',
            web_app: { url: MINI_APP_URL }
          }
        ]
      ]
    }
  })
})

// Обработчик команды /help
bot.onText(/\/help/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id
  
  await bot.sendMessage(chatId, `
🤖 Команды бота:

/start - Начать работу с ботом
/help - Показать эту справку

Для общения с девушками используйте Mini App, которое открывается через кнопку в меню.
  `)
})

// Обработчик всех сообщений (кроме команд)
bot.on('message', async (msg: TelegramBot.Message) => {
  // Игнорируем команды
  if (msg.text?.startsWith('/')) {
    return
  }
  
  const chatId = msg.chat.id
  
  // Предлагаем открыть Mini App
  await bot.sendMessage(chatId, 'Для общения с девушками откройте Mini App через кнопку ниже:', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть Mini App 👉',
            web_app: { url: MINI_APP_URL }
          }
        ]
      ]
    }
  })
})

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error)
})

console.log('Telegram бот инициализирован')

