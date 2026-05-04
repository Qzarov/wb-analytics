import { config } from '../config.js'
import { getAdminSetting } from '../db/core.js'

function getAlertConfig() {
  return {
    botToken: getAdminSetting('alert_bot_token'),
    chatId: getAdminSetting('alert_chat_id'),
    enabled: getAdminSetting('alert_enabled') === '1',
  }
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[alerter] Telegram API error:', res.status, body)
      return false
    }
    return true
  } catch (err: any) {
    console.error('[alerter] Failed to send Telegram message:', err.message)
    return false
  }
}

export async function sendAlert(product: string, error: string, extra?: Record<string, string>): Promise<boolean> {
  const cfg = getAlertConfig()
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return false

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  let text = `<b>ERROR</b>\n`
  text += `<b>Product:</b> ${escapeHtml(product)}\n`
  text += `<b>Env:</b> ${escapeHtml(config.env)}\n`
  text += `<b>Time:</b> ${now}\n\n`
  text += `<b>Error:</b>\n<code>${escapeHtml(truncate(error, 1000))}</code>`

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      text += `\n<b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`
    }
  }

  console.log(`[alerter] Sending error alert: product=${product}`)
  return sendTelegram(cfg.botToken, cfg.chatId, text)
}

export async function sendRestart(): Promise<boolean> {
  const cfg = getAlertConfig()
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return false

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  let text = `<b>SERVICE RESTARTED</b>\n`
  text += `<b>App:</b> ${escapeHtml(config.appName)}\n`
  text += `<b>Env:</b> ${escapeHtml(config.env)}\n`
  text += `<b>Time:</b> ${now}`

  console.log('[alerter] Sending restart alert')
  return sendTelegram(cfg.botToken, cfg.chatId, text)
}

export async function sendTestAlert(): Promise<boolean> {
  const cfg = getAlertConfig()
  if (!cfg.botToken || !cfg.chatId) return false

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  let text = `<b>TEST ALERT</b>\n`
  text += `<b>App:</b> ${escapeHtml(config.appName)}\n`
  text += `<b>Env:</b> ${escapeHtml(config.env)}\n`
  text += `<b>Time:</b> ${now}\n\n`
  text += `Alerts configured and working.`

  return sendTelegram(cfg.botToken, cfg.chatId, text)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}
