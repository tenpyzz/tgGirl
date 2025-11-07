import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { getGirlPhotoPath } from '@/lib/default-girls'

export async function GET(_request: Request, { params }: { params: { girlId: string } }) {
  const girlId = Number(params.girlId)

  if (!Number.isInteger(girlId)) {
    return NextResponse.json({ error: 'Некорректный ID' }, { status: 400 })
  }

  const photoInfo = getGirlPhotoPath(girlId)

  if (!photoInfo) {
    return NextResponse.json({ error: 'Фото не найдено' }, { status: 404 })
  }

  try {
    const fileBuffer = await fs.readFile(photoInfo.filePath)
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': photoInfo.contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Ошибка чтения файла фото:', error)
    return NextResponse.json({ error: 'Не удалось загрузить фото' }, { status: 500 })
  }
}


