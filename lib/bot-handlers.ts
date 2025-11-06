import { bot } from './telegram'
import TelegramBot from 'node-telegram-bot-api'
import { prisma } from './prisma'
import { openrouter } from './openrouter'
import type OpenAI from 'openai'

// URL вашего Mini App
const MINI_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.WEBAPP_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'http://localhost:3000'

// Функция для получения или создания пользователя
async function getOrCreateUser(telegramId: number, username?: string, firstName?: string, lastName?: string) {
  let user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    include: { selectedGirl: true },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId: BigInt(telegramId),
        username,
        firstName,
        lastName,
      },
      include: { selectedGirl: true },
    })
  } else {
    // Обновляем информацию о пользователе, если она изменилась
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        username,
        firstName,
        lastName,
      },
      include: { selectedGirl: true },
    })
  }

  return user
}

// Функция для генерации ответа от девочки
async function generateGirlResponse(userId: number, girlId: number, userMessage: string): Promise<string> {
  // Получаем или создаем чат
  const chat = await prisma.chat.upsert({
    where: {
      userId_girlId: {
        userId,
        girlId,
      },
    },
    create: {
      userId,
      girlId,
    },
    update: {},
  })

  // Сохраняем сообщение пользователя
  await prisma.message.create({
    data: {
      chatId: chat.id,
      role: 'user',
      content: userMessage.trim(),
    },
  })

  // Получаем историю сообщений для контекста
  const chatHistory = await prisma.message.findMany({
    where: {
      chatId: chat.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 20, // Последние 20 сообщений для контекста
  })

  // Получаем девушку и её системный промпт
  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
  })

  if (!girl) {
    throw new Error('Девушка не найдена')
  }

  // Формируем сообщения для OpenRouter
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: girl.systemPrompt,
    },
    ...chatHistory.map((message: { role: string; content: string }) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    })),
  ]

  // Генерируем ответ от ИИ через OpenRouter
  const completion = await openrouter.chat.completions.create({
    model: 'deepseek/deepseek-chat',
    messages: messages,
    temperature: 0.9,
    max_tokens: 500,
  })

  const responseContent = completion.choices?.[0]?.message?.content

  if (!responseContent || typeof responseContent !== 'string') {
    throw new Error('Неожиданный формат ответа от OpenRouter API')
  }

  const aiResponse = responseContent.trim() || 'Извините, я не могу ответить сейчас.'

  // Сохраняем ответ ИИ
  await prisma.message.create({
    data: {
      chatId: chat.id,
      role: 'assistant',
      content: aiResponse,
    },
  })

  return aiResponse
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id
  const from = msg.from
  const telegramUserId = from?.id

  if (!telegramUserId || !from) {
    await bot.sendMessage(chatId, 'Ошибка: не удалось определить пользователя')
    return
  }

  try {
    // Получаем или создаем пользователя
    const user = await getOrCreateUser(
      telegramUserId,
      from.username,
      from.first_name,
      from.last_name
    )

    // Проверяем, выбрал ли пользователь девочку
    if (!user.selectedGirlId || !user.selectedGirl) {
      // Если девочка не выбрана, предлагаем открыть Mini App
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
    } else {
      // Если девочка выбрана, приветствуем от её лица
      const girl = user.selectedGirl
      await bot.sendMessage(
        chatId,
        `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
      )
    }
  } catch (error) {
    console.error('Ошибка в обработчике /start:', error)
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.')
  }
})

// Обработчик команды /help
bot.onText(/\/help/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id
  
  await bot.sendMessage(chatId, `
🤖 Команды бота:

/start - Начать работу с ботом
/help - Показать эту справку

Для выбора девушки используйте Mini App.
  `)
})

// Обработчик всех сообщений (кроме команд)
bot.on('message', async (msg: TelegramBot.Message) => {
  // Игнорируем команды
  if (msg.text?.startsWith('/')) {
    return
  }

  // Игнорируем не текстовые сообщения
  if (!msg.text || !msg.text.trim()) {
    return
  }

  const chatId = msg.chat.id
  const from = msg.from
  const telegramUserId = from?.id

  if (!telegramUserId || !from) {
    await bot.sendMessage(chatId, 'Ошибка: не удалось определить пользователя')
    return
  }

  try {
    // Получаем или создаем пользователя
    const user = await getOrCreateUser(
      telegramUserId,
      from.username,
      from.first_name,
      from.last_name
    )

    // Проверяем, выбрал ли пользователь девочку
    if (!user.selectedGirlId || !user.selectedGirl) {
      // Если девочка не выбрана, предлагаем открыть Mini App
      await bot.sendMessage(chatId, 'Сначала выберите девушку для общения:', {
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
      return
    }

    // Показываем индикатор печати
    await bot.sendChatAction(chatId, 'typing')

    // Генерируем ответ от девочки
    const response = await generateGirlResponse(user.id, user.selectedGirlId, msg.text)

    // Отправляем ответ
    await bot.sendMessage(chatId, response)
  } catch (error) {
    console.error('Ошибка при обработке сообщения:', error)
    await bot.sendMessage(chatId, 'Извините, произошла ошибка. Попробуйте позже.')
  }
})

// Обработка ошибок
bot.on('polling_error', (error: Error) => {
  console.error('Ошибка polling:', error)
})

console.log('✅ Telegram бот инициализирован')

