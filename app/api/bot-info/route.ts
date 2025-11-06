import { NextResponse } from 'next/server'
import { bot } from '@/lib/telegram'

export async function GET() {
  try {
    // Получаем информацию о боте
    const botInfo = await bot.getMe()
    
    return NextResponse.json({
      username: botInfo.username,
    })
  } catch (error) {
    console.error('Ошибка получения информации о боте:', error)
    return NextResponse.json(
      { error: 'Ошибка получения информации о боте' },
      { status: 500 }
    )
  }
}

