import { PrismaClient } from '@prisma/client'

// Singleton для Prisma Client (избегаем множественных подключений)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Сохраняем в global для переиспользования в development
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

