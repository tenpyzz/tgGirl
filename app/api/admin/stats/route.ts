import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTelegramUserId } from '@/lib/telegram-utils'

// Проверка прав администратора
function isAdmin(telegramUserId: number | null): boolean {
  if (!telegramUserId) return false
  
  const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',').map(id => parseInt(id.trim())) || []
  const adminId = process.env.ADMIN_TELEGRAM_ID ? parseInt(process.env.ADMIN_TELEGRAM_ID) : null
  
  return adminIds.includes(telegramUserId) || adminId === telegramUserId
}

export async function GET(request: Request) {
  try {
    const telegramUserId = getTelegramUserId(request)

    if (!isAdmin(telegramUserId)) {
      return NextResponse.json(
        { error: 'Доступ запрещен' },
        { status: 403 }
      )
    }

    // Получаем все платежи
    const allPayments = await prisma.paymentHistory.findMany({
      select: {
        stars: true,
        usdAmount: true,
        paymentMethod: true,
        messages: true,
        createdAt: true,
      },
    })

    // Подсчитываем статистику
    const stats = {
      totalPayments: allPayments.length,
      totalStars: allPayments.reduce((sum, p) => sum + ((p as any).stars || 0), 0),
      totalUsd: allPayments.reduce((sum, p) => sum + ((p as any).usdAmount || 0), 0),
      totalMessages: allPayments.reduce((sum, p) => sum + p.messages, 0),
      starsPayments: allPayments.filter(p => (p as any).paymentMethod === 'stars').length,
      usdPayments: allPayments.filter(p => (p as any).paymentMethod === 'usd').length,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Ошибка получения статистики:', error)
    return NextResponse.json(
      { error: 'Ошибка получения статистики' },
      { status: 500 }
    )
  }
}

