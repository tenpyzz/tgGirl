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

// Функция для генерации первого сообщения от девочки в формате ролевой игры (действие в звездочках + диалог)
async function generateFirstMessage(userId: number, girlId: number): Promise<string> {
  // Получаем девушку и её системный промпт
  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
  })

  if (!girl) {
    throw new Error('Девушка не найдена')
  }

  // Создаем специальный промпт для первого сообщения
  const firstMessagePrompt = `Ты - ${girl.name}. Это ролевая игра, где ты и пользователь находитесь рядом друг с другом в реальном времени.

КРИТИЧЕСКИ ВАЖНО - ФОРМАТ РОЛЕВОЙ ИГРЫ:
Ты ОБЯЗАНА отвечать в формате ролевой игры:
1. Сначала опиши свое действие/реакцию/эмоцию в звездочках (например: *Я сижу на диване и скучаю, тут входишь ты*)
2. Затем пустая строка
3. Затем напиши свой диалог обычным текстом БЕЗ звездочек

Примеры правильных сообщений:
*Я сижу на диване и скучаю, тут входишь ты*

Ой, привет! Как дела?

*Только что закончила готовить ужин, как вдруг получила твое сообщение*

Привет! Рада тебя видеть! Что-то случилось?

*Лежу на кровати и листаю соцсети, когда заметила, что ты написал*

Привет! Как дела? Что нового?

ВАЖНО:
- ВСЕГДА используй этот формат: действие в звездочках, пустая строка, диалог
- Действия в звездочках описывают то, что ты делаешь, как реагируешь, что чувствуешь
- Диалог - это то, что ты говоришь пользователю
- Представь, что вы находитесь рядом, видите друг друга, можете взаимодействовать

${girl.systemPrompt}`

  // Генерируем первое сообщение через OpenRouter
  const completion = await openrouter.chat.completions.create({
    model: 'deepseek/deepseek-chat',
    messages: [
      {
        role: 'system',
        content: firstMessagePrompt,
      },
      {
        role: 'user',
        content: 'Начни общение с пользователем в формате ролевой игры. Напиши первое сообщение: действие в звездочках (одна строка), пустая строка, затем приветствие и начало общения без звездочек. Пример:\n\n*Я сижу на диване и скучаю, тут входишь ты*\n\nОй, привет! Как дела?',
      },
    ],
    temperature: 0.9, // Высокая температура для более креативных ответов
    max_tokens: 400, // Увеличено для более длинных и естественных сообщений
  })

  const responseContent = completion.choices?.[0]?.message?.content

  if (!responseContent || typeof responseContent !== 'string') {
    throw new Error('Неожиданный формат ответа от OpenRouter API')
  }

  const firstMessage = responseContent.trim()

  // Создаем или получаем чат
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

  // Удаляем все старые сообщения в базе данных (если чат уже существовал)
  await prisma.message.deleteMany({
    where: {
      chatId: chat.id,
    },
  })

  // Сохраняем первое сообщение в базу
  await prisma.message.create({
    data: {
      chatId: chat.id,
      role: 'assistant',
      content: firstMessage,
    },
  })

  return firstMessage
}

// Функция для генерации ответа от девочки в формате ролевой игры (действие в звездочках + диалог)
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

КРИТИЧЕСКИ ВАЖНО - ФОРМАТ РОЛЕВОЙ ИГРЫ:
Это ролевая игра, где ты и пользователь находитесь рядом друг с другом в реальном времени.

Ты ОБЯЗАНА отвечать в формате ролевой игры:
1. Сначала опиши свое действие/реакцию/эмоцию в звездочках (например: *Я слегка наклоняю голову, мои глаза внимательно изучают его лицо*)
2. Затем пустая строка
3. Затем напиши свой диалог обычным текстом БЕЗ звездочек

Примеры правильных ответов:
*Я слегка наклоняю голову, мои глаза внимательно изучают его лицо, пытаясь уловить хоть какую-то эмоцию*

Ну, "ясно" — это не ответ. Ты же обычно не такой немногословный. Что-то случилось? Или просто устал?

*Улыбаюсь и подхожу ближе*

Привет! Как дела? Что нового?

ВАЖНО:
- ВСЕГДА используй этот формат: действие в звездочках, пустая строка, диалог
- Действия в звездочках описывают то, что ты делаешь, как реагируешь, что чувствуешь, как двигаешься
- Диалог - это то, что ты говоришь пользователю
- Представь, что вы находитесь рядом, видите друг друга, можете взаимодействовать физически
- Реагируй на действия и слова пользователя через действия в звездочках

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
  // Используем более высокую температуру для более креативных ответов в ролевой игре
  const completion = await openrouter.chat.completions.create({
    model: 'deepseek/deepseek-chat',
    messages: messages,
    temperature: 0.8, // Увеличено для более креативных ответов в ролевой игре
    max_tokens: 600, // Увеличено для действий в звездочках и диалога
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
    const user = await getOrCreateUser(
      telegramUserId,
      from.username,
      from.first_name,
      from.last_name
    )

    // Если пользователь уже выбрал девочку, проверяем, есть ли первое сообщение
    if (user.selectedGirlId && user.selectedGirl) {
      const chat = await prisma.chat.findUnique({
        where: {
          userId_girlId: {
            userId: user.id,
            girlId: user.selectedGirlId,
          },
        },
        include: {
          messages: {
            where: {
              role: 'assistant',
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      })

      // Если нет сообщений от девочки, отправляем первое сообщение
      if (!chat || chat.messages.length === 0) {
        try {
          await bot.sendChatAction(chatId, 'typing')
          const firstMessage = await generateFirstMessage(user.id, user.selectedGirlId)
          await bot.sendMessage(chatId, firstMessage)
          return
        } catch (error) {
          console.error('Ошибка отправки первого сообщения:', error)
        }
      } else {
        // Если первое сообщение уже было, просто приветствуем
        await bot.sendMessage(
          chatId,
          `Привет! Я ${user.selectedGirl.name}. Продолжим общение? 💬`
        )
        return
      }
    }

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
      console.log('Получены данные от WebApp:', msg.web_app_data.data)
      const data = JSON.parse(msg.web_app_data.data)
      console.log('Распарсенные данные:', data)
      if (data.action === 'girl_selected') {
        console.log('Обработка выбора девочки через WebApp, girlId:', data.girlId)
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
          console.log('Девочка выбрана:', girl.name, 'ID:', updatedUser.selectedGirlId)
          
          // Генерируем первое сообщение от девочки через ИИ в формате ролевой игры
          try {
            console.log('Начинаем генерацию первого сообщения...')
            // Показываем индикатор печати
            await bot.sendChatAction(chatId, 'typing')
            
            // Генерируем первое сообщение в формате ролевой игры (действие в звездочках + диалог)
            const firstMessage = await generateFirstMessage(
              updatedUser.id,
              updatedUser.selectedGirlId
            )
            console.log('Первое сообщение сгенерировано, отправляем...')
            
            // Отправляем первое сообщение от девочки (девочка ПЕРВАЯ начинает общение)
            await bot.sendMessage(chatId, firstMessage)
            console.log('Первое сообщение отправлено успешно')
          } catch (aiError) {
            console.error('Ошибка генерации первого сообщения:', aiError)
            // Если ошибка, отправляем стандартное приветствие
            if (girl) {
              await bot.sendMessage(
                chatId,
                `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
              )
            }
          }
          
          return // Не обрабатываем это сообщение дальше
        } else {
          console.log('Девочка не выбрана или не найдена')
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

    // Проверяем, есть ли первое сообщение от девочки
    const chat = await prisma.chat.findUnique({
      where: {
        userId_girlId: {
          userId: user.id,
          girlId: user.selectedGirlId,
        },
      },
      include: {
        messages: {
          where: {
            role: 'assistant',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    })

    // Если нет сообщений от девочки, отправляем первое сообщение
    if (!chat || chat.messages.length === 0) {
      console.log('Первое сообщение от пользователя, но нет сообщений от девочки. Отправляем первое сообщение...')
      try {
        await bot.sendChatAction(chatId, 'typing')
        const firstMessage = await generateFirstMessage(user.id, user.selectedGirlId)
        console.log('Первое сообщение сгенерировано, отправляем пользователю...')
        await bot.sendMessage(chatId, firstMessage)
        console.log('Первое сообщение отправлено успешно')
        return
      } catch (error) {
        console.error('Ошибка отправки первого сообщения:', error)
        // Продолжаем обработку как обычное сообщение
      }
    } else {
      console.log('Уже есть сообщения от девочки, продолжаем обычный диалог')
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
          
          // Если это первое сообщение в чате, отправляем первое сообщение в формате ролевой игры
          if (!chat || chat.messages.length === 0) {
            try {
              // Показываем индикатор печати
              await bot.sendChatAction(chatId, 'typing')
              
              // Генерируем первое сообщение в формате ролевой игры (действие в звездочках + диалог)
              const firstMessage = await generateFirstMessage(
                user.id,
                user.selectedGirlId
              )
              
              // Отправляем первое сообщение от девочки
              await bot.sendMessage(chatId, firstMessage)
            } catch (aiError) {
              console.error('Ошибка генерации первого сообщения:', aiError)
              // Если ошибка, отправляем стандартное приветствие
              await bot.sendMessage(
                chatId,
                `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
              )
            }
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

