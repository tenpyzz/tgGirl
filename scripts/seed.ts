// Скрипт для заполнения базы данных начальными данными
import { PrismaClient } from '@prisma/client'
import { ensureDefaultGirls } from '@/lib/default-girls'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Начинаем заполнение базы данных...')

  await ensureDefaultGirls()

  const girlsCount = await prisma.girl.count()
  console.log(`✅ Доступные девушки: ${girlsCount}`)
  console.log('🎉 База данных успешно заполнена!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

