import { bot } from './telegram'
import TelegramBot from 'node-telegram-bot-api'
import { prisma } from './prisma'
import { openrouter } from './openrouter'
import type OpenAI from 'openai'

// Убеждаемся, что бот инициализирован перед регистрацией обработчиков
console.log('🔄 Начинаем регистрацию обработчиков бота...')

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
  const savedMessage = await prisma.message.create({
    data: {
      chatId: chat.id,
      role: 'user',
      content: userMessageContent,
    },
  })

  console.log('💬 Сообщение пользователя сохранено:', userMessageContent)
  console.log('💾 ID сохраненного сообщения:', savedMessage.id)

  // Получаем ВСЕ сообщения для контекста (без ограничения, чтобы убедиться, что новое сообщение попало)
  const allMessages = await prisma.message.findMany({
    where: {
      chatId: chat.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  // Берем последние 20 сообщений (включая только что сохраненное)
  let chatHistory = allMessages.slice(-20)

  console.log('📜 Всего сообщений в чате:', allMessages.length)
  console.log('📜 История сообщений (последние 20):', chatHistory.length, 'сообщений')
  
  // Проверяем, что последнее сообщение пользователя точно в истории
  const lastUserMessage = chatHistory[chatHistory.length - 1]
  if (lastUserMessage && lastUserMessage.role === 'user' && lastUserMessage.content === userMessageContent) {
    console.log('✅ Последнее сообщение пользователя найдено в истории!')
  } else {
    console.error('❌ ОШИБКА: Последнее сообщение пользователя НЕ найдено в истории!')
    console.error('   Ожидалось:', userMessageContent)
    console.error('   Найдено:', lastUserMessage?.content)
    console.error('   ⚠️ Добавляем сообщение вручную в историю!')
    
    // Добавляем сообщение вручную, если его нет в истории
    // Проверяем, есть ли оно вообще в истории
    const messageInHistory = chatHistory.find(m => m.id === savedMessage.id)
    if (!messageInHistory) {
      // Если сообщения нет в истории, добавляем его вручную
      chatHistory = [...chatHistory, savedMessage].slice(-20)
      console.log('✅ Сообщение добавлено в историю вручную!')
    }
  }

  chatHistory.forEach((msg: { role: string; content: string }, idx: number) => {
    const isLast = idx === chatHistory.length - 1
    console.log(`  ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...${isLast ? ' ⬅ ПОСЛЕДНЕЕ' : ''}`)
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
  const historyMessages = chatHistory.map((message: { role: string; content: string }) => {
    // Убеждаемся, что роль правильная
    const role = message.role === 'user' ? 'user' : 'assistant'
    return {
      role: role as 'user' | 'assistant',
      content: message.content,
    }
  })

  // Проверяем, что последнее сообщение пользователя точно в истории
  const lastHistoryMessage = historyMessages[historyMessages.length - 1]
  if (!lastHistoryMessage || lastHistoryMessage.role !== 'user' || lastHistoryMessage.content !== userMessageContent) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Последнее сообщение пользователя НЕ в истории!')
    console.error('   Добавляем сообщение вручную в массив для ИИ!')
    // Добавляем сообщение пользователя вручную
    historyMessages.push({
      role: 'user',
      content: userMessageContent,
    })
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: enhancedSystemPrompt,
    },
    ...historyMessages,
  ]

  console.log('📤 Отправляем в ИИ:', messages.length, 'сообщений')
  console.log('📝 Последнее сообщение пользователя:', userMessageContent)
  
  // Проверяем, что последнее сообщение пользователя точно в массиве для ИИ
  const lastUserMessageInArray = messages.filter(m => m.role === 'user').pop()
  if (lastUserMessageInArray && lastUserMessageInArray.content === userMessageContent) {
    console.log('✅ Последнее сообщение пользователя найдено в массиве для ИИ!')
  } else {
    console.error('❌ ОШИБКА: Последнее сообщение пользователя НЕ найдено в массиве для ИИ!')
    console.error('   Ожидалось:', userMessageContent)
    console.error('   Найдено в массиве:', lastUserMessageInArray?.content)
  }
  
  console.log('📋 Все сообщения для ИИ:')
  messages.forEach((msg, idx) => {
    if (msg.role === 'system') {
      console.log(`  ${idx + 1}. [SYSTEM]: ${(msg.content as string).substring(0, 100)}...`)
    } else {
      const isLastUserMessage = msg.role === 'user' && msg.content === userMessageContent
      console.log(`  ${idx + 1}. [${msg.role}]: ${(msg.content as string)}${isLastUserMessage ? ' ⬅ ПОСЛЕДНЕЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ' : ''}`)
    }
  })

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

  console.log('🤖 Ответ ИИ:', aiResponse.substring(0, 100) + '...')

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
  console.log('🔵 Обработчик /start вызван!', { chatId: msg.chat.id, userId: msg.from?.id })
  
  const chatId = msg.chat.id
  const from = msg.from
  const telegramUserId = from?.id

  if (!telegramUserId || !from) {
    console.error('❌ Не удалось определить пользователя')
    await bot.sendMessage(chatId, 'Ошибка: не удалось определить пользователя')
    return
  }

  try {
    console.log('📝 Получаем или создаем пользователя:', telegramUserId)
    
    // Получаем или создаем пользователя
    const user = await getOrCreateUser(
      telegramUserId,
      from.username,
      from.first_name,
      from.last_name
    )

    console.log('✅ Пользователь получен/создан:', user.id)

    // Всегда показываем приветствие и предлагаем открыть Mini App
    console.log('📤 Отправляем приветственное сообщение...')
    
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
    
    console.log('✅ Приветственное сообщение отправлено')
  } catch (error) {
    console.error('❌ Ошибка в обработчике /start:', error)
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
  console.log('🔵 Обработчик message вызван!', { 
    chatId: msg.chat.id, 
    userId: msg.from?.id,
    text: msg.text,
    hasWebAppData: !!msg.web_app_data
  })
  
  const chatId = msg.chat.id
  const from = msg.from
  const telegramUserId = from?.id

  if (!telegramUserId || !from) {
    console.error('❌ Не удалось определить пользователя в обработчике message')
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

console.log('✅ Telegram бот инициализирован')
console.log('📋 Зарегистрированные обработчики:')
console.log('  - /start команда')
console.log('  - /help команда')
console.log('  - Все сообщения (message event)')
console.log('  - Callback queries')
console.log('  - Polling errors')

// Проверяем, что бот доступен
try {
  bot.getMe().then((info) => {
    console.log('✅ Бот доступен:', info.username, info.id)
  }).catch((error) => {
    console.error('❌ Ошибка получения информации о боте:', error)
  })
} catch (error) {
  console.error('❌ Ошибка при проверке бота:', error)
}

