import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDefaultGirls } from '@/lib/default-girls'

export async function GET() {
  try {
    await ensureDefaultGirls()

    const girls = await prisma.girl.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    })

    return NextResponse.json(girls)
  } catch (error) {
    console.error('Ошибка получения девушек:', error)
    return NextResponse.json(
      { error: 'Ошибка получения девушек' },
      { status: 500 }
    )
  }
}

