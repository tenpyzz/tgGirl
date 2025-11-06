const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Указываем корневую директорию проекта для устранения предупреждения о lockfiles
  outputFileTracingRoot: path.join(__dirname),
  // Переменные окружения для Next.js
  env: {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.WEBAPP_URL || process.env.RAILWAY_PUBLIC_DOMAIN,
  },
}

module.exports = nextConfig

