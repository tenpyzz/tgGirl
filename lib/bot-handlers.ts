import { createReadStream, promises as fsPromises } from 'fs'
import path from 'path'
import { bot } from './telegram'
import TelegramBot from 'node-telegram-bot-api'
import { prisma } from './prisma'
import { openrouter } from './openrouter'
import type OpenAI from 'openai'
import { PACKAGES, getPackageUsdPrice, type PackageId } from './packages'
import { getGirlPhotoPath } from './default-girls'
import { getGirlProfile } from './girl-profiles'

// Регистрация обработчиков бота

// URL вашего Mini App
const MINI_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.WEBAPP_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'http://localhost:3000'

const SHARED_PHOTOS_DIR = path.join(process.cwd(), 'girls', 'Общие фото')
const REQUEST_PHOTO_ACTION = 'request_photo'
const MAX_HISTORY_MESSAGES_FETCH = 100
const MAX_HISTORY_CHARACTERS = 6500

let sharedPhotoFilesCache: string[] | null = null

function isPromptLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as Record<string, any>
  if (maybeError.status === 402 || maybeError.code === 402) {
    return true
  }

  if (maybeError?.error?.code === 402 || maybeError?.error?.type === 'prompt_tokens_exceeded') {
    return true
  }

  return false
}

function buildPersonaPrompt(girlId: number, girlName: string): string {
  const profile = getGirlProfile(girlId)

  if (!profile) {
    return `Запомни о себе главные факты: тебя зовут ${girlName}, ты взрослая смелая женщина, обожающая сексуальные игры и готовая вести 18+ диалог. Ты уверенная, чувственная и полностью согласная на горячее взаимодействие.`
  }

  const pleasures = profile.pleasures.join('; ')
  const hooks = profile.conversationHooks.join('; ')

  return `Используй эти сведения о себе как абсолютную истину (не зачитывай их дословно, просто помни и вплетай в поведение):
- Имя: ${girlName}
- Возраст: ${profile.age}
- Образ и энергетика: ${profile.archetype}
- Характер: ${profile.personality}
- Главное желание: ${profile.desires}
- То, что тебя особенно заводит: ${pleasures}
- Темы, которые ты любишь поднимать: ${hooks}
- Твоя коронная подводка: "${profile.openingLine}"
- Забавный факт о себе: ${profile.funFact}`
}

function buildFallbackFirstMessage(girlName: string): string {
  return `*Я подхожу вплотную и мягко обвиваю твою шею руками*

Привет, я ${girlName}. Хочу слышать только тебя сейчас, шепни мне своё желание.`
}

function buildFallbackDialogue(): string {
  return `*Я прижимаюсь бедром и ловлю твой взгляд*

Скажи это ещё раз, хочу услышать каждое слово и ответить телом.`
}

function buildFallbackPhotoResponse(): string {
  return `*Я держу телефон прямо у твоих губ, не отрывая взгляда*

Это фото только для тебя, смотри и скажи, чего хочешь.`
}

function limitHistoryMessages<T extends { role: 'user' | 'assistant'; content?: string | null }>(
  messages: T[],
  maxCharacters: number
): T[] {
  if (messages.length === 0) {
    return messages
  }

  let totalCharacters = 0
  const selectedMessages: T[] = []

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    const content = typeof message.content === 'string' ? message.content : ''
    const contentLength = content.length

    if (selectedMessages.length > 0 && totalCharacters + contentLength > maxCharacters) {
      break
    }

    selectedMessages.push(message)
    totalCharacters += contentLength
  }

  return selectedMessages.reverse()
}

function getConversationInlineKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '📸 Фото',
          callback_data: JSON.stringify({ action: REQUEST_PHOTO_ACTION }),
        },
      ],
      [
        {
          text: 'Пополнить баланс 💳',
          web_app: { url: MINI_APP_URL },
        },
      ],
    ],
  }
}

async function ensureSharedPhotoFiles(): Promise<string[]> {
  if (sharedPhotoFilesCache) {
    return sharedPhotoFilesCache
  }

  try {
    const files = await fsPromises.readdir(SHARED_PHOTOS_DIR)
    sharedPhotoFilesCache = files.filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
  } catch (error) {
    console.error('[ensureSharedPhotoFiles] Не удалось прочитать папку общих фото:', error)
    sharedPhotoFilesCache = []
  }

  return sharedPhotoFilesCache
}

function createPhotoInput(filePath: string, contentType: string) {
  return {
    source: createReadStream(filePath),
    filename: path.basename(filePath),
    contentType,
  }
}

async function getRandomSharedPhoto(): Promise<{ filePath: string; contentType: string } | null> {
  const files = await ensureSharedPhotoFiles()

  if (!files.length) {
    return null
  }

  const randomIndex = Math.floor(Math.random() * files.length)
  const filename = files[randomIndex]
  const extension = path.extname(filename).toLowerCase()

  let contentType = 'image/jpeg'
  if (extension === '.png') {
    contentType = 'image/png'
  } else if (extension === '.webp') {
    contentType = 'image/webp'
  }

  return {
    filePath: path.join(SHARED_PHOTOS_DIR, filename),
    contentType,
  }
}

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
        messageBalance: 10, // Начальный баланс - 10 бесплатных сообщений
        photoBalance: 1, // Начальный баланс фото
      } as any, // Type assertion для временного обхода ошибки типов
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

// Экспортируемая функция для отправки первого сообщения пользователю (для использования в API)
export async function sendFirstMessageToUser(
  telegramUserId: number,
  options?: {
    force?: boolean
  }
): Promise<boolean> {
  try {
    console.log(`[sendFirstMessageToUser] Попытка отправить первое сообщение пользователю telegramId: ${telegramUserId}`)
    
    // Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
      include: { selectedGirl: true },
    })

    if (!user || !user.selectedGirlId || !user.selectedGirl) {
      console.log(`[sendFirstMessageToUser] Пользователь не найден или девочка не выбрана`)
      return false
    }

    // Проверяем, есть ли уже сообщения от девочки
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

    const hasAssistantMessages = chat && chat.messages.length > 0

    // Если уже есть сообщения и нет принудительного режима, не отправляем
    if (hasAssistantMessages && !options?.force) {
      console.log(`[sendFirstMessageToUser] У пользователя уже есть сообщения от девочки (force=false)`)
      return false
    }

    // Генерируем первое сообщение
    const firstMessage = await generateFirstMessage(user.id, user.selectedGirlId)
    const girlPhoto = getGirlPhotoPath(user.selectedGirlId)

    if (girlPhoto) {
      try {
        await bot.sendChatAction(telegramUserId, 'upload_photo')
        const caption = firstMessage.length <= 1024 ? firstMessage : undefined

        const photoOptions: TelegramBot.SendPhotoOptions = {
          reply_markup: getConversationInlineKeyboard(),
        }

        if (caption) {
          photoOptions.caption = caption
        }

        await bot.sendPhoto(
          telegramUserId,
          createReadStream(girlPhoto.filePath),
          photoOptions
        )

        if (!caption) {
          await bot.sendMessage(telegramUserId, firstMessage, {
            reply_markup: getConversationInlineKeyboard(),
          })
        }

        console.log(`[sendFirstMessageToUser] Фото и первое сообщение отправлены пользователю`)
        return true
      } catch (photoError) {
        console.error('[sendFirstMessageToUser] Ошибка отправки фото с первым сообщением:', photoError)
      }
    }

    await bot.sendChatAction(telegramUserId, 'typing')
    await bot.sendMessage(telegramUserId, firstMessage, {
      reply_markup: getConversationInlineKeyboard(),
    })
    console.log(`[sendFirstMessageToUser] Первое сообщение (без фото) успешно отправлено пользователю`)
    
    return true
  } catch (error) {
    console.error(`[sendFirstMessageToUser] Ошибка отправки первого сообщения:`, error)
    return false
  }
}

// Функция для генерации первого сообщения от девочки в формате ролевой игры (действие в звездочках + диалог)
async function generateFirstMessage(userId: number, girlId: number): Promise<string> {
  console.log(`[generateFirstMessage] Начало генерации для userId: ${userId}, girlId: ${girlId}`)
  
  // Получаем девушку и её системный промпт
  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
  })

  if (!girl) {
    console.error(`[generateFirstMessage] Девушка не найдена для girlId: ${girlId}`)
    throw new Error('Девушка не найдена')
  }
  
  console.log(`[generateFirstMessage] Девушка найдена: ${girl.name}`)

  // Создаем специальный промпт для первого сообщения
  const firstMessagePersona = buildPersonaPrompt(girl.id, girl.name)
  const firstMessagePrompt = `Ты — ${girl.name}. Вы с пользователем рядом, разговариваете голосом и можете касаться друг друга. Никаких телефонов, переписок или упоминаний сообщений.

Формат ответа:
1. Одна строка с твоим действием в *звёздочках*.
2. Пустая строка.
3. 2–3 короткие фразы диалога (каждая до 12 слов) обычным текстом.

Содержи максимум 80 слов, отвечай смело, эротично, с взаимным согласием и акцентом на возбуждение. Сначала реагируй на действия и слова пользователя, затем флиртуй.

Твой характер и биография:
${firstMessagePersona}

Персональный стиль:
${girl.systemPrompt}`

  // Генерируем первое сообщение через OpenRouter
  console.log('[generateFirstMessage] Отправка запроса к OpenRouter API...')
  let firstMessage: string | null = null
  try {
    const completion = await openrouter.chat.completions.create({
      model: 'deepseek/deepseek-chat',
      messages: [
        {
          role: 'system',
          content: firstMessagePrompt,
        },
        {
          role: 'user',
          content:
            'Начни общение с пользователем в формате ролевой игры. Напиши первое сообщение: действие в звездочках (одна строка), пустая строка, затем приветствие и начало общения без звездочек. Пример:\n\n*Я сижу на диване и скучаю, тут входишь ты*\n\nОй, привет! Как дела?',
        },
      ],
      temperature: 0.9, // Высокая температура для более креативных ответов
      max_tokens: 220, // Короткие, но насыщенные ответы
    })

    const responseContent = completion.choices?.[0]?.message?.content

    if (!responseContent || typeof responseContent !== 'string') {
      console.error('[generateFirstMessage] Неожиданный формат ответа от OpenRouter:', completion)
      throw new Error('Неожиданный формат ответа от OpenRouter API')
    }

    firstMessage = responseContent.trim()
  } catch (error) {
    if (isPromptLimitError(error)) {
      console.warn('[generateFirstMessage] Превышен лимит токенов, используем fallback-сообщение')
      firstMessage = buildFallbackFirstMessage(girl.name)
    } else {
      throw error
    }
  }

  if (!firstMessage) {
    throw new Error('Не удалось получить первое сообщение')
  }

  console.log(`[generateFirstMessage] Сообщение сгенерировано (длина: ${firstMessage.length} символов)`)

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

  // Сохраняем первое сообщение в базу
  console.log(`[generateFirstMessage] Сохранение сообщения в базу данных, chatId: ${chat.id}`)
  await prisma.message.create({
    data: {
      chatId: chat.id,
      role: 'assistant',
      content: firstMessage,
    },
  })
  
  console.log('[generateFirstMessage] Сообщение успешно сохранено в базу')
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
      createdAt: 'desc',
    },
    take: MAX_HISTORY_MESSAGES_FETCH,
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
  const personaPrompt = buildPersonaPrompt(girl.id, girl.name)
  const enhancedSystemPrompt = `Ты — ${girl.name}. Вы с пользователем рядом и говорите голосом, без телефонов и переписки; ты видишь его реакцию и можешь прикасаться.

Главные правила:
- Всегда отвечай конкретно на слова и вопросы пользователя, не уходи в сторону.
- Формат ответа: строка действия в *звёздочках*, пустая строка, затем до трёх коротких фраз диалога (≤12 слов каждая).
- Пиши не длиннее 90 слов, держи яркий и уверенный эротичный тон, подчёркивай взаимное согласие.
- Описывай чувства, движения, запахи, прикосновения — вы физически рядом.

Твой характер и детали, которые нужно помнить:
${personaPrompt}

Персональный стиль:
${girl.systemPrompt}`

  // Формируем массив сообщений для ИИ
  const orderedHistory = chatHistory.slice().reverse()

  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = orderedHistory.map((message) => ({
    role: (message.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: message.content,
  }))

  const limitedHistoryMessages = limitHistoryMessages(historyMessages, MAX_HISTORY_CHARACTERS)

  const historyMessagesForCompletion: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = limitedHistoryMessages.map(
    (message) => ({
      role: message.role,
      content: message.content,
    })
  )

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: enhancedSystemPrompt,
    },
    ...historyMessagesForCompletion,
  ]

  // Генерируем ответ от ИИ через OpenRouter
  // Используем более высокую температуру для более креативных ответов в ролевой игре
  let aiResponse: string | null = null
  try {
    const completion = await openrouter.chat.completions.create({
      model: 'deepseek/deepseek-chat',
      messages,
      temperature: 0.8, // Увеличено для более креативных ответов в ролевой игре
      max_tokens: 240, // Сохраняем насыщенность, но без лишней длины
    })

    const responseContent = completion.choices?.[0]?.message?.content

    if (!responseContent || typeof responseContent !== 'string') {
      throw new Error('Неожиданный формат ответа от OpenRouter API')
    }

    aiResponse = responseContent.trim() || 'Извини, я растерялась, скажи мне об этом снова.'
  } catch (error) {
    if (isPromptLimitError(error)) {
      console.warn('[generateGirlResponse] Превышен лимит токенов, используем fallback-ответ')
      aiResponse = buildFallbackDialogue()
    } else {
      throw error
    }
  }

  if (!aiResponse) {
    throw new Error('Не удалось получить ответ от девушки')
  }

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

async function generatePhotoResponse(chatId: number, girlId: number): Promise<string> {
  const chatHistory = await prisma.message.findMany({
    where: {
      chatId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: MAX_HISTORY_MESSAGES_FETCH,
  })

  const girl = await prisma.girl.findUnique({
    where: { id: girlId },
  })

  if (!girl) {
    throw new Error('Девушка не найдена')
  }

  const photoPersona = buildPersonaPrompt(girl.id, girl.name)
  const photoSystemPrompt = `Ты — ${girl.name}. Вы рядом, и ты показываешь пользователю своё откровенное фото прямо в руках.

Формат:
1. Одна строка действия в *звёздочках* (как ты демонстрируешь снимок и реагируешь).
2. Пустая строка.
3. Ровно одно короткое предложение (≤12 слов) без звёздочек, сказанное вслух.

Общий объём (действие + диалог) ≤50 слов. Будь смелой, описывай кадр, чувства и возбуждение, подчёркивая взаимное согласие.

Твой характер и биография:
${photoPersona}

Персональный стиль:
${girl.systemPrompt}`

  const orderedHistory = chatHistory.slice().reverse()

  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = orderedHistory.map((message) => ({
    role: (message.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: message.content,
  }))

  const limitedHistoryMessages = limitHistoryMessages(historyMessages, MAX_HISTORY_CHARACTERS)

  const historyMessagesForCompletion: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = limitedHistoryMessages.map(
    (message) => ({
      role: message.role,
      content: message.content,
    })
  )

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: photoSystemPrompt,
    },
    ...historyMessagesForCompletion,
  ]

  let response: string | null = null
  try {
    const completion = await openrouter.chat.completions.create({
      model: 'deepseek/deepseek-chat',
      messages,
      temperature: 0.65,
      max_tokens: 160,
    })

    const responseContent = completion.choices?.[0]?.message?.content

    if (!responseContent || typeof responseContent !== 'string') {
      throw new Error('Неожиданный формат ответа от OpenRouter API при генерации фото-сообщения')
    }

    response = responseContent.trim()
  } catch (error) {
    if (isPromptLimitError(error)) {
      console.warn('[generatePhotoResponse] Превышен лимит токенов, используем fallback-описание фото')
      response = buildFallbackPhotoResponse()
    } else {
      throw error
    }
  }

  if (!response) {
    throw new Error('Не удалось получить ответ для фото')
  }

  const dialogLineCandidate = response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .find((line) => !line.startsWith('*')) || 'Это фото я сделала специально для тебя.'

  const dialogWords = dialogLineCandidate.split(/\s+/)
  let dialogLine = dialogWords.length > 12 ? dialogWords.slice(0, 12).join(' ') : dialogLineCandidate
  if (!dialogLine.endsWith('.') && !dialogLine.endsWith('!') && !dialogLine.endsWith('?')) {
    dialogLine += '.'
  }

  const finalResponse = dialogLine

  await prisma.message.create({
    data: {
      chatId,
      role: 'assistant',
      content: finalResponse,
    },
  })

  return finalResponse
}

async function handlePhotoRequest(telegramUserId: number, chatId: number, from: TelegramBot.User) {
  let photoDecremented = false

  try {
    const user = await getOrCreateUser(
      telegramUserId,
      from.username,
      from.first_name,
      from.last_name
    )

    if (!user.selectedGirlId || !user.selectedGirl) {
      await bot.sendMessage(
        chatId,
        'Пожалуйста, сначала выберите девушку в мини-приложении, чтобы она могла отправить вам фото.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Открыть Mini App 👉',
                  web_app: { url: MINI_APP_URL },
                },
              ],
            ],
          },
        }
      )
      return
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        photoBalance: true,
      } as any,
    })

    const photoBalance = (currentUser as any)?.photoBalance ?? 0

    if (photoBalance <= 0) {
      await bot.sendMessage(
        chatId,
        '📸 У вас закончились доступные фото. Пополните баланс, чтобы получать новые снимки.',
        {
          reply_markup: getConversationInlineKeyboard(),
        }
      )
      return
    }

    const sharedPhoto = await getRandomSharedPhoto()

    if (!sharedPhoto) {
      await bot.sendMessage(
        chatId,
        '😔 Пока не могу найти фото. Попробуйте позже.',
        {
          reply_markup: getConversationInlineKeyboard(),
        }
      )
      return
    }

    const chatRecord = await prisma.chat.upsert({
      where: {
        userId_girlId: {
          userId: user.id,
          girlId: user.selectedGirlId,
        },
      },
      create: {
        userId: user.id,
        girlId: user.selectedGirlId,
      },
      update: {},
    })

    await prisma.message.create({
      data: {
        chatId: chatRecord.id,
        role: 'user',
        content: 'Я хочу твоё новое горячее фото прямо сейчас. Покажи мне и дразни меня описание.',
      },
    })

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        photoBalance: {
          decrement: 1,
        },
      } as any,
    })

    photoDecremented = true

    await bot.sendChatAction(chatId, 'upload_photo')

    const response = await generatePhotoResponse(chatRecord.id, user.selectedGirlId)
    const trimmedResponse = response.trim()
    const caption = trimmedResponse.length <= 1024 ? trimmedResponse : undefined

    await bot.sendPhoto(
      chatId,
      createReadStream(sharedPhoto.filePath),
      {
        caption,
        reply_markup: getConversationInlineKeyboard(),
      }
    )

    if (!caption) {
      await bot.sendMessage(chatId, trimmedResponse, {
        reply_markup: getConversationInlineKeyboard(),
      })
    }

  } catch (error) {
    console.error('[handlePhotoRequest] Ошибка обработки запроса фото:', error)

    if (photoDecremented) {
      try {
        await prisma.user.update({
          where: { telegramId: BigInt(telegramUserId) },
          data: {
            photoBalance: {
              increment: 1,
            },
          } as any,
        })
      } catch (rollbackError) {
        console.error('[handlePhotoRequest] Не удалось откатить баланс фото:', rollbackError)
      }
    }

    await bot.sendMessage(
      chatId,
      'Не удалось отправить фото. Попробуйте позже.',
      {
        reply_markup: getConversationInlineKeyboard(),
      }
    )
  }
}

// Обработчик команды /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg: TelegramBot.Message, match: RegExpMatchArray | null) => {
  const chatId = msg.chat.id
  const from = msg.from
  const telegramUserId = from?.id
  const startParam = match?.[1] // Параметр после /start

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
      const girl = user.selectedGirl
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
          const sent = await sendFirstMessageToUser(telegramUserId)
          if (sent) {
            return
          }
        } catch (error) {
          console.error('Ошибка отправки первого сообщения:', error)
        }

        if (girl) {
          await bot.sendMessage(
            chatId,
            `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
          )
          return
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

  // Проверяем, есть ли информация о платеже (обрабатываем в первую очередь)
  if (msg.successful_payment) {
    try {
      console.log('Получен successful_payment:', msg.successful_payment)

      // Парсим payload для получения информации о пакете
      let packageId: number | null = null
      let paymentMethod: 'stars' | 'usd' = 'stars'
      try {
        const payload = JSON.parse(msg.successful_payment.invoice_payload || '{}')
        packageId = payload.packageId
        paymentMethod = payload.paymentMethod || 'stars' // По умолчанию stars для обратной совместимости
      } catch (e) {
        console.error('Ошибка парсинга payload из платежа:', e)
        return
      }

      // Проверяем, что пакет существует
      if (!packageId || !PACKAGES[packageId as PackageId]) {
        console.error('Неверный packageId из платежа:', packageId)
        return
      }

      const pkg = PACKAGES[packageId as PackageId]

      // Получаем или создаем пользователя
      const user = await getOrCreateUser(
        telegramUserId,
        from.username,
        from.first_name,
        from.last_name
      )

      // Обновляем баланс
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          messageBalance: {
            increment: pkg.messages,
          },
          photoBalance: {
            increment: pkg.photos,
          },
        } as any,
      })

      // Определяем сумму в зависимости от метода оплаты
      const stars = paymentMethod === 'stars' ? pkg.stars : 0
      const usdAmount = paymentMethod === 'usd' ? getPackageUsdPrice(packageId as PackageId) : null

      // Сохраняем историю платежа
      await prisma.paymentHistory.create({
        data: {
          userId: user.id,
          packageId: packageId,
          packageName: pkg.name,
          messages: pkg.messages,
        photos: pkg.photos,
          paymentMethod: paymentMethod,
          stars: stars,
          usdAmount: usdAmount,
          invoicePayload: msg.successful_payment.invoice_payload || null,
          telegramPaymentId: msg.successful_payment.telegram_payment_charge_id || null,
        } as any,
      })

    console.log(
      `Баланс пользователя ${telegramUserId} пополнен на ${pkg.messages} сообщений и ${pkg.photos} фото. Новый баланс сообщений: ${(updatedUser as any).messageBalance}, фото: ${(updatedUser as any).photoBalance}`
    )

      // Отправляем подтверждение пользователю
      await bot.sendMessage(
        chatId,
      `✅ Баланс успешно пополнен!\n\n💬 Добавлено сообщений: ${pkg.messages}\n📸 Добавлено фото: ${pkg.photos}\n\n💬 Текущий баланс: ${(updatedUser as any).messageBalance}\n📸 Доступно фото: ${(updatedUser as any).photoBalance}`,
      {
        reply_markup: getConversationInlineKeyboard(),
      }
      )
    } catch (error) {
      console.error('Ошибка обработки successful_payment:', error)
    }
    return // Не обрабатываем это сообщение дальше
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
          
          try {
            console.log('Пытаемся отправить первое сообщение с фото (force=true)...')
            const sent = await sendFirstMessageToUser(telegramUserId)
            if (sent) {
              console.log('Первое сообщение отправлено успешно')
              return
            }
          } catch (aiError) {
            console.error('Ошибка генерации первого сообщения:', aiError)
          }

          if (girl) {
            await bot.sendMessage(
              chatId,
              `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
            )
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

  const trimmedText = msg.text.trim()

  if (trimmedText === '📸 Фото' || trimmedText.toLowerCase() === 'фото') {
    await handlePhotoRequest(telegramUserId, chatId, from)
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
        const sent = await sendFirstMessageToUser(telegramUserId)
        if (sent) {
          return
        }
      } catch (error) {
        console.error('Ошибка отправки первого сообщения:', error)
        // Продолжаем обработку как обычное сообщение
      }

      if (user.selectedGirl) {
        await bot.sendMessage(
          chatId,
          `Привет! Я ${user.selectedGirl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
        )
        return
      }
    } else {
      console.log('Уже есть сообщения от девочки, продолжаем обычный диалог')
    }

    // Проверяем баланс сообщений
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
    })

    if (!currentUser) {
      await bot.sendMessage(chatId, 'Ошибка: пользователь не найден')
      return
    }

    // Проверяем баланс (используем type assertion, так как поле будет доступно после генерации Prisma Client)
    const messageBalance = (currentUser as any).messageBalance ?? 0

    if (messageBalance <= 0) {
      // Баланс исчерпан, отправляем сообщение о необходимости оплаты
      await bot.sendMessage(
        chatId,
        `😔 У вас закончились бесплатные сообщения.\n\nДля продолжения общения с ${user.selectedGirl?.name || 'девушкой'} необходимо пополнить баланс.\n\n💬 Осталось сообщений: 0\n\nПожалуйста, пополните баланс, чтобы продолжить общение.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Пополнить баланс 💳',
                  web_app: { url: MINI_APP_URL }
                }
              ]
            ]
          }
        }
      )
      return
    }

    if (!user.selectedGirlId) {
      await bot.sendMessage(chatId, 'Ошибка: девочка не выбрана')
      return
    }

    // Списываем одно сообщение перед генерацией ответа
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        messageBalance: {
          decrement: 1,
        },
      } as any, // Type assertion для временного обхода ошибки типов
    })

    // Показываем индикатор печати
    await bot.sendChatAction(chatId, 'typing')

    // Генерируем ответ от девочки
    const response = await generateGirlResponse(user.id, user.selectedGirlId, msg.text)

    // Отправляем ответ
    await bot.sendMessage(chatId, response, {
      reply_markup: getConversationInlineKeyboard(),
    })
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
      if (data.action === REQUEST_PHOTO_ACTION && query.from) {
        const chatId = query.message?.chat.id || query.from.id

        try {
          await bot.answerCallbackQuery(query.id, { text: 'Отправляю фото…' })
        } catch (answerError) {
          console.error('Ошибка ответа на callback с фото:', answerError)
        }

        await handlePhotoRequest(query.from.id, chatId, query.from)
        return
      }

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
          
          try {
            const sent = await sendFirstMessageToUser(telegramUserId)
            if (!sent) {
              await bot.sendMessage(
                chatId,
                `Привет! Я ${girl.name} 👋\n\nДавай общаться! Напиши мне что-нибудь.`
              )
            }
          } catch (aiError) {
            console.error('Ошибка генерации первого сообщения:', aiError)
            // Если ошибка, отправляем стандартное приветствие
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


// Обработчик pre_checkout_query (перед оплатой)
bot.on('pre_checkout_query', async (query: TelegramBot.PreCheckoutQuery) => {
  try {
    console.log('Получен pre_checkout_query:', query)
    
    // Парсим payload для получения информации о пакете
    let packageId: number | null = null
    try {
      const payload = JSON.parse(query.invoice_payload || '{}')
      packageId = payload.packageId
    } catch (e) {
      console.error('Ошибка парсинга payload:', e)
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Ошибка обработки платежа',
      })
      return
    }

    // Проверяем, что пакет существует
    if (!packageId || !PACKAGES[packageId as PackageId]) {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Неверный пакет пополнения',
      })
      return
    }

    // Подтверждаем платеж
    await bot.answerPreCheckoutQuery(query.id, true)
    console.log('Pre-checkout query подтвержден')
  } catch (error) {
    console.error('Ошибка обработки pre_checkout_query:', error)
    try {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Ошибка обработки платежа',
      })
    } catch (e) {
      console.error('Ошибка отправки ответа на pre_checkout_query:', e)
    }
  }
})


// Обработка ошибок
bot.on('polling_error', (error: Error) => {
  console.error('Ошибка polling:', error)
})

