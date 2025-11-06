# Telegram Mini App - ИИ Чат

Telegram Mini App для общения с ИИ-девушками.

## 🚀 Технологии

- **Next.js 15** - Frontend и Backend
- **TypeScript** - Типизация
- **PostgreSQL** - База данных
- **Prisma** - ORM
- **OpenRouter AI** - ИИ для генерации ответов (доступ к различным моделям через единый API)
- **node-telegram-bot-api** - Telegram Bot API

## 📦 Установка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` и заполните переменные окружения:
   - `TELEGRAM_BOT_TOKEN` - получите у [@BotFather](https://t.me/BotFather)
   - `OPENROUTER_API_KEY` - получите на [OpenRouter](https://openrouter.ai/)
   - `DATABASE_URL` - URL вашей PostgreSQL базы данных

3. Настройте базу данных:
```bash
npm run db:generate
npm run db:push
npm run seed
```

4. Запустите приложение:
```bash
npm run dev
```

## 🚢 Деплой на Railway

См. инструкции:
- [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md) - подробная инструкция
- [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - быстрая шпаргалка

## 📚 Документация

- [SETUP.md](./SETUP.md) - инструкция по локальной установке
- [GITHUB_DESKTOP_SETUP.md](./GITHUB_DESKTOP_SETUP.md) - загрузка на GitHub через GitHub Desktop
- [БЫСТРЫЙ_СТАРТ_GITHUB_DESKTOP.md](./БЫСТРЫЙ_СТАРТ_GITHUB_DESKTOP.md) - быстрый старт с GitHub Desktop

## 📝 Команды

- `npm run dev` - запуск в development режиме
- `npm run build` - сборка для production
- `npm start` - запуск production версии
- `npm run db:push` - применить схему к базе данных
- `npm run db:studio` - открыть Prisma Studio
- `npm run seed` - заполнить базу данных начальными данными

## 📄 Лицензия

MIT

