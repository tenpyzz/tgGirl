# Telegram Mini App - ИИ Чат

Telegram Mini App для общения с ИИ-девушками на 18+ темы.

## Технологии

- **Next.js 15** - Frontend и Backend
- **TypeScript** - Типизация
- **PostgreSQL** - База данных
- **Prisma** - ORM
- **OpenAI API** - ИИ для генерации ответов
- **node-telegram-bot-api** - Telegram Bot API

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

3. Заполните переменные окружения:
   - `TELEGRAM_BOT_TOKEN` - получите у [@BotFather](https://t.me/BotFather)
   - `OPENAI_API_KEY` - получите на [OpenAI Platform](https://platform.openai.com/)
   - `DATABASE_URL` - URL вашей PostgreSQL базы данных (для Railway)

4. Настройте базу данных:
```bash
# Сгенерируйте Prisma Client
npm run db:generate

# Примените схему к базе данных
npm run db:push

# Заполните базу данных начальными данными
npx tsx scripts/seed.ts
```

5. Запустите приложение:
```bash
npm run dev
```

Приложение будет доступно на `http://localhost:3000`

## Настройка Telegram Bot

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Получите токен бота
3. Добавьте токен в `.env` файл
4. Настройте Mini App:
   - Отправьте `/newapp` боту @BotFather
   - Укажите название и описание
   - Для development: `http://localhost:3000` (нужно использовать ngrok или подобный сервис)
   - Для production: URL вашего Railway приложения

## Деплой на Railway

1. Создайте проект на [Railway](https://railway.app/)
2. Подключите PostgreSQL базу данных
3. Добавьте переменные окружения:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
   - `DATABASE_URL` (Railway автоматически создаст)
   - `NEXT_PUBLIC_APP_URL` - URL вашего приложения на Railway
   - `WEBHOOK_URL` - `https://your-app.railway.app/api/webhook`
4. Деплойте код
5. Запустите миграции и seed:
   ```bash
   npm run db:push
   npx tsx scripts/seed.ts
   ```

## Структура проекта

```
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   ├── chat/              # Страница чата
│   └── page.tsx           # Главная страница
├── lib/                   # Утилиты
│   ├── prisma.ts          # Prisma Client
│   ├── openai.ts          # OpenAI Client
│   ├── telegram.ts        # Telegram Bot
│   └── bot-handlers.ts    # Обработчики бота
├── prisma/                # Prisma schema
└── scripts/               # Скрипты
```

## API Endpoints

- `GET /api/girls` - Получить список девушек
- `GET /api/girls/[girlId]` - Получить конкретную девушку
- `GET /api/chat/[girlId]/messages` - Получить сообщения чата
- `POST /api/chat/[girlId]/send` - Отправить сообщение
- `POST /api/webhook` - Webhook для Telegram бота

## Важные замечания

1. **Тестирование на localhost**: Для тестирования Mini App на localhost нужно использовать ngrok или подобный сервис, так как Telegram требует HTTPS для Mini Apps.

2. **Telegram User ID**: В development режиме используется дефолтный user ID (123456789). В production это должно приходить из Telegram WebApp initData.

3. **OpenAI API**: Используется модель `gpt-4o-mini` для экономии. Можете изменить на `gpt-4` или другую модель в `app/api/chat/[girlId]/send/route.ts`.

4. **Системный промпт**: Настройте системный промпт для девушки в `scripts/seed.ts` для изменения поведения ИИ.

## Лицензия

MIT

