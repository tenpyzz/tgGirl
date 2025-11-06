import { bot } from './telegram'
import TelegramBot from 'node-telegram-bot-api'
import { prisma } from './prisma'
import { openrouter } from './openrouter'
import type OpenAI from 'openai'

// Регистрация обработчиков бота

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
  const userMessageContent = userMessage.trim()
  await prisma.message.create({
    data: {
      chatId: chat.id,
      role: 'user',
      content: userMessageContent,
    },
  })

  // Получаем историю сообщений для контекста (последние 20)
  const chatHistory = await prisma.message.findMany({
    where: {
      chatId: chat.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 20,
  })

  // Получаем девушку и её системный промпт
  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
  })

  if (!girl) {
    throw new Error('Девушка не найдена')
  }

  // Формируем сообщения для OpenRouter
  // КРИТИЧЕСКИ ВАЖНО: Сначала инструкции о том, что нужно слушать пользователя
  const enhancedSystemPrompt = `КРИТИЧЕСКИ ВАЖНО - ПРАВИЛА ОБЩЕНИЯ:
1. ВСЕГДА внимательно читай и понимай каждое сообщение пользователя
2. ОТВЕЧАЙ именно на то, о чем спрашивает или говорит пользователь
3. Если пользователь задает вопрос - ОБЯЗАТЕЛЬНО отвечай на этот вопрос
4. Если пользователь говорит о чем-то конкретном - отвечай именно на эту тему
5. НЕ игнорируй слова пользователя и НЕ придумывай свои интерпретации
6. НЕ переводи разговор на другие темы, если пользователь говорит о чем-то конкретном

Только после выполнения этих правил можешь использовать свой характер:

${girl.systemPrompt}`

  // Формируем массив сообщений для ИИ
  const historyMessages = chatHistory.map((message: { role: string; content: string }) => ({
    role: (message.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: message.content,
  }))

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: enhancedSystemPrompt,
    },
    ...historyMessages,
  ]

  // Генерируем ответ от ИИ через OpenRouter
  // Снижаем температуру для более точных ответов
  const completion = await openrouter.chat.completions.create({
    model: 'deepseek/deepseek-chat',
    messages: messages,
    temperature: 0.7, // Снижено с 0.9 для более точных ответов
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
    await getOrCreateUser(
      telegramUserId,
      from.username,
      from.first_name,
      from.last_name
    )

    await bot.sendMessage(
      chatId,
      'Добро пожаловать! 👋\n\nЭто бот для общения с ИИ-девушками. Чтобы начать общение, пожалуйста, откройте мини-приложение и выберите девушку',
      {
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
      }
    )
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
  const chatId = msg.chat.id
  const from = msg.from
  const telegramUserId = from?.id

  if (!telegramUserId || !from) {
    await bot.sendMessage(chatId, 'Ошибка: не удалось определить пользователя')
    return
  }

  // Проверяем, есть ли данные от WebApp в сообщении
  if (msg.web_app_data?.data) {
    try {
      const data = JSON.parse(msg.web_app_data.data)
      if (data.action === 'girl_selected') {
        // Получаем пользователя (обновляем данные, чтобы убедиться, что выбор актуален)
        const user = await getOrCreateUser(
          telegramUserId,
          from.username,
          from.first_name,
          from.last_name
        )
        
        // Если в данных есть girlId, обновляем выбор девочки
        let updatedUser = user
        if (data.girlId && typeof data.girlId === 'number') {
          updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { selectedGirlId: data.girlId },
            include: { selectedGirl: true },
          })
        } else {
          // Если girlId нет в данных, получаем пользователя с актуальными данными
          const freshUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: { selectedGirl: true },
          })
          if (freshUser) {
            updatedUser = freshUser
          }
        }
        
        // Проверяем, выбрана ли девочка
        if (updatedUser && updatedUser.selectedGirlId && updatedUser.selectedGirl) {
          const girl = updatedUser.selectedGirl
          
          // Генерируем приветственное сообщение от девочки через ИИ
          try {
            // Создаем или получаем чат
            const chat = await prisma.chat.upsert({
              where: {
                userId_girlId: {
                  userId: updatedUser.id,
                  girlId: updatedUser.selectedGirlId,
                },
              },
              create: {
                userId: updatedUser.id,
                girlId: updatedUser.selectedGirlId,
              },
              update: {},
            })
            
            // Удаляем все старые сообщения в базе данных
            await prisma.message.deleteMany({
              where: {
                chatId: chat.id,
              },
            })
            
            // Генерируем приветственное сообщение от девочки через ИИ
            const welcomeMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
              {
                role: 'system',
                content: girl.systemPrompt,
              },
              {
                role: 'user',
                content: 'Привет!',
              },
            ]
            
            const completion = await openrouter.chat.completions.create({
              model: 'deepseek/deepseek-chat',
              messages: welcomeMessages,
              temperature: 0.9,
              max_tokens: 200,
            })
            
            const welcomeResponse = completion.choices?.[0]?.message?.content
            
            if (welcomeResponse && typeof welcomeResponse === 'string') {
              const aiWelcome = welcomeResponse.trim()
              
              // Сохраняем приветственное сообщение в базу
              await prisma.message.create({
                data: {
                  chatId: chat.id,
                  role: 'assistant',
                  content: aiWelcome,
                },
              })
              
              // Отправляем приветствие от девочки (девочка ПЕРВАЯ начинает общение)
              await bot.sendMessage(chatId, aiWelcome)
            } else {
              // Если ИИ не ответил, отправляем стандартное приветствие
              await bot.sendMessage(
                chatId,
                `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
              )
            }
          } catch (aiError) {
            console.error('Ошибка генерации приветствия:', aiError)
            // Если ошибка, отправляем стандартное приветствие
            const girl = updatedUser.selectedGirl
            if (girl) {
              await bot.sendMessage(
                chatId,
                `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
              )
            }
          }
          
          return // Не обрабатываем это сообщение дальше
        }
        return // Не обрабатываем это сообщение дальше
      }
    } catch (error) {
      console.error('Ошибка обработки данных от WebApp:', error)
      // Продолжаем обработку как обычное сообщение
    }
  }

  // Игнорируем команды
  if (msg.text?.startsWith('/')) {
    return
  }

  // Игнорируем не текстовые сообщения
  if (!msg.text || !msg.text.trim()) {
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
      // Если девочка не выбрана, напоминаем перейти в Mini App и выбрать девочку
      await bot.sendMessage(
        chatId,
        'Пожалуйста, сначала откройте мини-приложение и выберите девушку для общения! 👇\n\nТолько после выбора девушки вы сможете начать общение с ней.',
        {
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
        }
      )
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

// Обработчик данных от WebApp
bot.on('callback_query', async (query: TelegramBot.CallbackQuery) => {
  try {
    if (query.data) {
      const data = JSON.parse(query.data)
      if (data.action === 'girl_selected' && query.from) {
        const chatId = query.message?.chat.id || query.from.id
        const telegramUserId = query.from.id
        
        // Получаем пользователя
        const user = await getOrCreateUser(
          telegramUserId,
          query.from.username,
          query.from.first_name,
          query.from.last_name
        )
        
        // Проверяем, выбрана ли девочка
        if (user.selectedGirlId && user.selectedGirl) {
          const girl = user.selectedGirl
          
          // Проверяем, есть ли уже сообщения в чате
          const chat = await prisma.chat.findUnique({
            where: {
              userId_girlId: {
                userId: user.id,
                girlId: user.selectedGirlId,
              },
            },
            include: {
              messages: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
              },
            },
          })
          
          // Если это первое сообщение в чате, отправляем приветствие
          if (!chat || chat.messages.length === 0) {
            await bot.sendMessage(
              chatId,
              `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
            )
          }
        }
        
        // Отвечаем на callback query
        await bot.answerCallbackQuery(query.id)
      }
    }
  } catch (error) {
    console.error('Ошибка обработки callback query:', error)
  }
})


// Обработка ошибок
bot.on('polling_error', (error: Error) => {
  console.error('Ошибка polling:', error)
})

