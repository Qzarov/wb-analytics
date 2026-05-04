import 'dotenv/config'

export const config = {
  env: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'WB Analytics',
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  defaultCredits: Number(process.env.DEFAULT_CREDITS) || 100,
}
