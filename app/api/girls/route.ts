import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
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

