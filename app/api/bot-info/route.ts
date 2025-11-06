import { NextResponse } from 'next/server'
import { bot } from '@/lib/telegram'

// Загружаем обработчики при первом запросе
try {
  require('@/lib/bot-handlers')
} catch (error) {
  console.error('Ошибка загрузки обработчиков:', error)
}

export async function GET() {
  try {
    // Получаем информацию о боте
    const botInfo = await bot.getMe()
    
    return NextResponse.json({
      username: botInfo.username,
      id: botInfo.id,
      first_name: botInfo.first_name,
    })
  } catch (error) {
    console.error('Ошибка получения информации о боте:', error)
    return NextResponse.json(
      { error: 'Ошибка получения информации о боте', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

