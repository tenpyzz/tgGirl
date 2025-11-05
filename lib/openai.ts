import OpenAI from 'openai'

// Проверка наличия API ключа
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY не установлен в переменных окружения')
}

// Экспортируем клиент OpenAI
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

