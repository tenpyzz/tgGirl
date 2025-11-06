import { NextResponse } from 'next/server'
import { getTelegramUserId } from '@/lib/telegram-utils'

// Пакеты пополнения
const PACKAGES = {
  1: { messages: 200, stars: 299, name: 'Базовый' },
  2: { messages: 1000, stars: 999, name: 'Стандартный' },
  3: { messages: 3000, stars: 2499, name: 'Премиум' },
} as const

export async function POST(request: Request) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!telegramUserId) {
      return NextResponse.json(
        { error: 'Пользователь не авторизован' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { packageId } = body

    if (!packageId || !PACKAGES[packageId as keyof typeof PACKAGES]) {
      return NextResponse.json(
        { error: 'Неверный ID пакета' },
        { status: 400 }
      )
    }

    const pkg = PACKAGES[packageId as keyof typeof PACKAGES]
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN

    if (!botToken) {
      return NextResponse.json(
        { error: 'Bot token не настроен' },
        { status: 500 }
      )
    }

    // Создаем инвойс через прямой HTTP запрос к Telegram Bot API
    // Для Telegram Stars используем валюту "XTR"
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Пополнение баланса - ${pkg.name}`,
        description: `Пополнение баланса на ${pkg.messages} сообщений`,
        payload: JSON.stringify({
          packageId,
          userId: telegramUserId,
          messages: pkg.messages,
        }),
        provider_token: '', // Не требуется для Telegram Stars
        currency: 'XTR', // Telegram Stars
        prices: [
          {
            label: `${pkg.messages} сообщений`,
            amount: pkg.stars, // Количество Telegram Stars
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Ошибка Telegram API:', errorData)
      throw new Error(`Telegram API error: ${response.status}`)
    }

    const data = await response.json()

    if (!data.ok || !data.result) {
      throw new Error('Не удалось создать инвойс')
    }

    return NextResponse.json({
      invoiceUrl: data.result,
      packageId,
      messages: pkg.messages,
      stars: pkg.stars,
    })
  } catch (error) {
    console.error('Ошибка создания инвойса:', error)
    return NextResponse.json(
      { error: 'Ошибка создания инвойса' },
      { status: 500 }
    )
  }
}

