import { ipcMain, shell, BrowserWindow } from 'electron'
import Store from 'electron-store'
import log from 'electron-log/main'

const store = new Store<{ authToken?: string; authEmail?: string; authState?: string }>({
  name: 'auth',
  encryptionKey: 'xyvault-auth-v1'
})

// ─── JWT Validation ─────────────────────────────────────────────────────────
// Strict format + payload check (signature is validated by auth-gateway)
function isValidJWTPayload(
  token: string
): { sub?: string; email?: string; userId?: string; exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // Base64url → base64 (replace - with + and _ with /)
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as {
      sub?: string
      email?: string
      exp?: number
    }
    if (!decoded.sub && !decoded.email) return null // must have identity
    if (decoded.exp !== undefined && decoded.exp < Date.now() / 1000) return null // expired
    return decoded
  } catch {
    return null
  }
}

export function handleAuthCallback(url: string): void {
  try {
    const parsed = new URL(url)
    const token = parsed.searchParams.get('token')
    const email = parsed.searchParams.get('email')
    if (token) {
      const payload = isValidJWTPayload(token)
      if (!payload) {
        log.error('[Auth] Invalid token received — format or payload check failed')
        return
      }
      store.set('authToken', token)
      store.set('authEmail', email ?? payload.email ?? null)
      log.info('[Auth] Token saved from OAuth callback')
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('auth:tokenReceived', { token, email: email ?? payload.email })
      })
    }
  } catch (err) {
    log.error('[Auth] Callback parse error:', err)
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────
export function registerAuthHandlers(): void {
  ipcMain.handle('auth:getToken', () => store.get('authToken') ?? null)
  ipcMain.handle('auth:getEmail', () => store.get('authEmail') ?? null)
  ipcMain.handle('auth:getState', () => store.get('authState') ?? null)
  ipcMain.handle('auth:saveState', (_, state: string) => {
    store.set('authState', state)
  })
  ipcMain.handle('auth:clear', () => {
    store.delete('authToken')
    store.delete('authEmail')
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('auth:cleared')
    })
  })
  ipcMain.handle('auth:openLogin', async (_, loginUrl?: string) => {
    const url =
      loginUrl ??
      (() => {
        const gw = process.env.AUTH_GATEWAY_URL ?? 'http://localhost:3000'
        return `${gw.replace(/\/+$/, '')}/auth/email/login`
      })()
    log.info('[Auth] Opening login URL:', url)
    await shell.openExternal(url)
  })

  // Debug login: direct API call to gateway (bypasses OAuth custom protocol)
  ipcMain.handle('auth:debugLogin', async (_, email: string, code: string) => {
    const gw = process.env.AUTH_GATEWAY_URL ?? 'http://localhost:3000'
    log.info('[Auth] Debug login for:', email)

    const res = await fetch(`${gw}/auth/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    })
    const data = (await res.json()) as { token?: string; user?: { email?: string }; error?: string }
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? `API error: ${res.status}`)
    }

    const payload = isValidJWTPayload(data.token)
    if (!payload) {
      throw new Error('Token 验证失败')
    }

    const userEmail = email ?? data.user?.email ?? payload.email ?? null
    store.set('authToken', data.token)
    store.set('authEmail', userEmail)
    log.info('[Auth] Debug login success:', userEmail)

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('auth:tokenReceived', { token: data.token, email: userEmail })
    })

    return { ok: true, email: userEmail }
  })
}

/** Get the current auth token (for downstream use without async IPC) */
export function getAuthToken(): string | null {
  return store.get('authToken') ?? null
}
