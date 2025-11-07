import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'
import { PACKAGES, getPackageUsdPrice, type PackageId } from '@/lib/packages'

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

    // Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 404 }
      )
    }

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
    const stars = paymentMethod === 'stars' ? pkg.stars : null
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
        invoicePayload: JSON.stringify({ 
          packageId, 
          userId: telegramUserId, 
          messages: pkg.messages,
          photos: pkg.photos,
          paymentMethod 
        }),
      },
    })

    return NextResponse.json({
      success: true,
      balance: (updatedUser as any).messageBalance,
      photoBalance: (updatedUser as any).photoBalance,
      addedMessages: pkg.messages,
      addedPhotos: pkg.photos,
    })
  } catch (error) {
    console.error('Ошибка обработки платежа:', error)
    return NextResponse.json(
      { error: 'Ошибка обработки платежа' },
      { status: 500 }
    )
  }
}

