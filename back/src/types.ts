export interface UserRow {
  id: number
  name: string
  email: string
  password: string
  role: 'user' | 'admin' | 'superadmin'
  credits: number
  plan_id: number | null
  plan_expires_at: string | null
  created_at: string
  advanced_settings: number
  visible_products: string
}

export interface JwtPayload {
  id: number
  email: string
  role: 'user' | 'admin' | 'superadmin'
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}
