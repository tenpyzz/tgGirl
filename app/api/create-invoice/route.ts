import { NextResponse } from 'next/server'
import { getTelegramUserId } from '@/lib/telegram-utils'
import { PACKAGES, getPackageUsdPrice, getPackageCentsPrice, type PackageId } from '@/lib/packages'

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
    const { packageId, paymentMethod = 'stars' } = body

    if (!packageId || !PACKAGES[packageId as PackageId]) {
      return NextResponse.json(
        { error: 'Неверный ID пакета' },
        { status: 400 }
      )
    }

    if (paymentMethod !== 'stars' && paymentMethod !== 'usd') {
      return NextResponse.json(
        { error: 'Неверный метод оплаты. Используйте "stars" или "usd"' },
        { status: 400 }
      )
    }

    const pkg = PACKAGES[packageId as PackageId]
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN

    if (!botToken) {
      return NextResponse.json(
        { error: 'Bot token не настроен' },
        { status: 500 }
      )
    }

    // Определяем валюту и сумму в зависимости от метода оплаты
    const currency = paymentMethod === 'stars' ? 'XTR' : 'USD'
    const amount = paymentMethod === 'stars' 
      ? pkg.stars 
      : getPackageCentsPrice(packageId as PackageId) // Для USD используем центы

    // Создаем инвойс через прямой HTTP запрос к Telegram Bot API
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Пополнение баланса - ${pkg.name}`,
        description: `Пополнение баланса: +${pkg.messages} сообщений и +${pkg.photos} фото`,
        payload: JSON.stringify({
          packageId,
          userId: telegramUserId,
          messages: pkg.messages,
          photos: pkg.photos,
          paymentMethod, // Сохраняем метод оплаты в payload
        }),
        provider_token: '', // Не требуется для Telegram Stars и USD
        currency: currency,
        prices: [
          {
            label: `${pkg.messages} сообщений`,
            amount: amount,
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

    const usdPrice = getPackageUsdPrice(packageId as PackageId)

    return NextResponse.json({
      invoiceUrl: data.result,
      packageId,
      messages: pkg.messages,
      photos: pkg.photos,
      stars: paymentMethod === 'stars' ? pkg.stars : null,
      usdAmount: paymentMethod === 'usd' ? usdPrice : null,
      paymentMethod,
    })
  } catch (error) {
    console.error('Ошибка создания инвойса:', error)
    return NextResponse.json(
      { error: 'Ошибка создания инвойса' },
      { status: 500 }
    )
  }
}

