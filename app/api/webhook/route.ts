import { NextResponse } from 'next/server'
import { bot } from '@/lib/telegram'

// Webhook для Telegram бота (используется в production на Railway)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Обработка обновлений от Telegram
    await bot.processUpdate(body)
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Ошибка webhook:', error)
    return NextResponse.json(
      { error: 'Ошибка обработки webhook' },
      { status: 500 }
    )
  }
}

