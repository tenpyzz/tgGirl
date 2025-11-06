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

    // Проверяем минимальную сумму для USD (минимум 1 цент = 1)
    if (paymentMethod === 'usd' && amount < 1) {
      console.error('Сумма USD слишком мала:', amount)
      return NextResponse.json(
        { error: 'Сумма платежа слишком мала' },
        { status: 400 }
      )
    }

    // Формируем тело запроса
    const invoiceBody: any = {
      title: `Пополнение баланса - ${pkg.name}`,
      description: `Пополнение баланса на ${pkg.messages} сообщений`,
      payload: JSON.stringify({
        packageId,
        userId: telegramUserId,
        messages: pkg.messages,
        paymentMethod, // Сохраняем метод оплаты в payload
      }),
      currency: currency,
      prices: [
        {
          label: `${pkg.messages} сообщений`,
          amount: amount,
        },
      ],
    }

    // Для USD платежей может потребоваться provider_token или другие параметры
    // Для Stars provider_token не нужен
    if (paymentMethod === 'usd') {
      // Для USD платежей через Telegram Payments provider_token может быть пустым
      // или нужно использовать специальный токен провайдера
      invoiceBody.provider_token = '' // Пустой для Telegram Payments
    }

    console.log('Создание инвойса:', {
      currency,
      amount,
      paymentMethod,
      packageId,
    })

    // Создаем инвойс через прямой HTTP запрос к Telegram Bot API
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoiceBody),
    })

    const responseText = await response.text()
    let errorData: any = {}
    
    try {
      errorData = JSON.parse(responseText)
    } catch (e) {
      console.error('Не удалось распарсить ответ Telegram API:', responseText)
    }

    if (!response.ok) {
      console.error('Ошибка Telegram API:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        requestBody: invoiceBody,
      })
      
      // Возвращаем более детальное сообщение об ошибке
      const errorMessage = errorData.description || errorData.error_code || `Ошибка ${response.status}`
      return NextResponse.json(
        { 
          error: 'Ошибка создания инвойса',
          details: errorMessage,
          telegramError: errorData,
        },
        { status: 500 }
      )
    }

    const data = errorData

    if (!data.ok || !data.result) {
      console.error('Неверный формат ответа от Telegram API:', data)
      return NextResponse.json(
        { 
          error: 'Не удалось создать инвойс',
          details: 'Неверный формат ответа от Telegram',
        },
        { status: 500 }
      )
    }

    const usdPrice = getPackageUsdPrice(packageId as PackageId)

    return NextResponse.json({
      invoiceUrl: data.result,
      packageId,
      messages: pkg.messages,
      stars: paymentMethod === 'stars' ? pkg.stars : null,
      usdAmount: paymentMethod === 'usd' ? usdPrice : null,
      paymentMethod,
    })
  } catch (error) {
    console.error('Ошибка создания инвойса:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        error: 'Ошибка создания инвойса',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}

