import OpenAI from 'openai'

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY не установлен в переменных окружения')
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

