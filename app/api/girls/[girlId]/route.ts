import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ girlId: string }> }
) {
  try {
    const { girlId } = await params
    const girl = await prisma.girl.findUnique({
      where: {
        id: parseInt(girlId),
      },
    })

    if (!girl) {
      return NextResponse.json(
        { error: 'Девушка не найдена' },
        { status: 404 }
      )
    }

    return NextResponse.json(girl)
  } catch (error) {
    console.error('Ошибка получения девушки:', error)
    return NextResponse.json(
      { error: 'Ошибка получения девушки' },
      { status: 500 }
    )
  }
}

