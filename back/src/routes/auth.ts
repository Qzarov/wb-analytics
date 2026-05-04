import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { findUserByEmail, createUser, findUserById, updatePassword } from '../db.js'
import { auth as authMiddleware } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) {
    res.status(400).json({ error: 'name, email, password required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  if (findUserByEmail(email)) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const hash = await bcrypt.hash(password, 10)
  const user = createUser(name, email, hash)
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  })

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, credits: user.credits, advanced_settings: user.advanced_settings, visible_products: user.visible_products },
  })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'email, password required' })
    return
  }
  const user = findUserByEmail(email)
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const match = await bcrypt.compare(password, user.password)
  if (!match) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  })

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, credits: user.credits, advanced_settings: user.advanced_settings, visible_products: user.visible_products },
  })
})

// Get current user profile
router.get('/me', authMiddleware, (req, res) => {
  const user = findUserById(req.user!.id)
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  const { password, ...safe } = user
  res.json(safe)
})

// Change password
router.put('/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    res.status(400).json({ error: 'current_password and new_password required' }); return
  }
  if (new_password.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' }); return
  }
  const user = findUserById(req.user!.id)
  if (!user) { res.status(404).json({ error: 'User not found' }); return }

  const match = await bcrypt.compare(current_password, user.password)
  if (!match) { res.status(403).json({ error: 'Неверный текущий пароль' }); return }

  const hash = await bcrypt.hash(new_password, 10)
  updatePassword(user.id, hash)
  res.json({ ok: true })
})

export default router
