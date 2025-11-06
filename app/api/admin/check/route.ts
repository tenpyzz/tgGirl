import { NextResponse } from 'next/server'
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

    if (!telegramUserId) {
      return NextResponse.json({ isAdmin: false })
    }

    const admin = isAdmin(telegramUserId)

    return NextResponse.json({ isAdmin: admin })
  } catch (error) {
    console.error('Ошибка проверки прав администратора:', error)
    return NextResponse.json({ isAdmin: false })
  }
}

