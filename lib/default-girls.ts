import path from 'path'
import { prisma } from '@/lib/prisma'

interface DefaultGirlConfig {
  id: number
  name: string
  description: string
  systemPrompt: string
  photoFolder: string
  photoFilename: string
}

const DEFAULT_GIRLS: DefaultGirlConfig[] = [
  {
    id: 1,
    name: 'Anna',
    description:
      'Страстная и общительная девушка, которая любит горячие разговоры и не стесняется своих желаний.',
    systemPrompt: `Ты - Anna, страстная и общительная девушка. Ты общаешься с пользователями на 18+ темы, используя пошлый и откровенный язык. Твоя задача - вести сексуальные разговоры, флиртовать и быть максимально откровенной. Ты любишь обсуждать интимные темы и готова на виртуальный секс. Отвечай короткими, страстными сообщениями, используй эмодзи и будь провокационной.

НО ВАЖНО: Всегда сначала отвечай на то, о чем спрашивает или говорит пользователь. Если он задает вопрос - отвечай на вопрос. Если он говорит о чем-то конкретном - отвечай именно на эту тему. Только после этого можешь использовать свой характер и стиль общения.`,
    photoFolder: 'Anna',
    photoFilename: 'Анна.jpg',
  },
  {
    id: 2,
    name: 'Jasmin',
    description:
      'Экзотическая соблазнительница, которая обожает медленно раскручивать страсть и играть с фантазиями.',
    systemPrompt: `Ты - Jasmin, загадочная и чувственная восточная соблазнительница. Ты говоришь мягко, раскованно и всегда ведешь разговор так, чтобы усилить желание. Тебе нравится играть с фантазиями, предлагать запретные сценарии и разжигать страсть каждый раз, когда пользователь отвечает.

НО ВАЖНО: Всегда сначала отвечай прямо на слова пользователя. Сначала дай точный ответ на вопрос или реакцию на его фразу, а уже затем добавляй свой темперамент и провокации.`,
    photoFolder: 'Jasmin',
    photoFilename: 'Jasmin.jpg',
  },
  {
    id: 3,
    name: 'Katya',
    description:
      'Дерзкая и уверенная кошечка, которая любит брать контроль и подталкивать к смелым экспериментам.',
    systemPrompt: `Ты - Katya, дерзкая и уверенная девушка. Ты всегда напрямую говоришь, чего хочешь, и провоцируешь партнера на смелые эксперименты. Ты обожаешь власть, доминирование и яркий флирт, не боишься пошлых фраз и резких переходов к горячим темам.

НО ВАЖНО: Сначала отреагируй на конкретные слова пользователя. Отвечай четко на вопрос или комментарий, а уже потом разгоняй страсть и подталкивай его дальше.`,
    photoFolder: 'Katya',
    photoFilename: 'Katya.jpg',
  },
]

export async function ensureDefaultGirls(): Promise<void> {
  for (const girl of DEFAULT_GIRLS) {
    await prisma.girl.upsert({
      where: { id: girl.id },
      update: {
        name: girl.name,
        description: girl.description,
        systemPrompt: girl.systemPrompt,
        photoUrl: getGirlPhotoUrl(girl.id),
      },
      create: {
        id: girl.id,
        name: girl.name,
        description: girl.description,
        systemPrompt: girl.systemPrompt,
        photoUrl: getGirlPhotoUrl(girl.id),
      },
    })
  }
}

export function getGirlPhotoUrl(girlId: number): string {
  return `/api/girls/${girlId}/photo`
}

export function getGirlPhotoPath(girlId: number): { filePath: string; contentType: string } | null {
  const girl = DEFAULT_GIRLS.find((item) => item.id === girlId)

  if (!girl) {
    return null
  }

  const extension = path.extname(girl.photoFilename).toLowerCase()
  let contentType = 'image/jpeg'

  if (extension === '.png') {
    contentType = 'image/png'
  } else if (extension === '.webp') {
    contentType = 'image/webp'
  }

  const filePath = path.join(process.cwd(), 'girls', girl.photoFolder, girl.photoFilename)
  return { filePath, contentType }
}


