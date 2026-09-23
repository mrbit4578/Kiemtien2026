/**
 * ConcatClient — cầu nối JSON-RPC tới `concat-cli serve`.
 *
 * Hai chế độ:
 * 1. Tự quản (mặc định): spawn `concat-cli serve --json 127.0.0.1:PORT` như
 *    child process, token tự sinh và truyền qua env CONCAT_API_TOKEN
 *    (serve đọc env này cho --token). Tắt cùng API server.
 * 2. Ngoài (CONCAT_AUTOSTART=false): nối tới serve đang chạy sẵn,
 *    token lấy từ CONCAT_API_TOKEN (bắt buộc trong chế độ này).
 *
 * Toàn bộ module render TẮT khi CONCAT_ENABLED != 'true': health báo
 * unavailable, các endpoint khác 503 với message rõ ràng.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as net from 'net'
import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import {
  authLine,
  requestLine,
  parseLine,
  splitLines,
  ConcatApiError,
  ConcatProtocolError,
} from './concat-protocol'

export interface ConcatClientConfig {
  enabled: boolean
  cliPath: string
  host: string
  port: number // 0 = chọn port trống khi autostart
  socketPath?: string
  token?: string
  autostart: boolean
  requestTimeoutMs: number
  connectRetries: number
  workDir: string
  assetsDir: string
}

export function loadConcatConfig(env: NodeJS.ProcessEnv = process.env): ConcatClientConfig {
  const port = parseInt(env['CONCAT_PORT'] ?? '7420', 10)
  return {
    enabled: env['CONCAT_ENABLED'] === 'true',
    cliPath: env['CONCAT_CLI_PATH'] ?? 'concat-cli',
    host: env['CONCAT_HOST'] ?? '127.0.0.1',
    port: Number.isFinite(port) ? port : 7420,
    socketPath: env['CONCAT_SOCKET'] || undefined,
    token: env['CONCAT_API_TOKEN'] || undefined,
    autostart: env['CONCAT_AUTOSTART'] !== 'false',
    requestTimeoutMs: parseInt(env['CONCAT_REQUEST_TIMEOUT_MS'] ?? '30000', 10),
    connectRetries: parseInt(env['CONCAT_CONNECT_RETRIES'] ?? '30', 10),
    workDir:
      env['CONCAT_WORK_DIR'] ?? `${env['TMPDIR'] ?? '/tmp'}/kiemtien2026-concat`,
    assetsDir: env['CONCAT_ASSETS_DIR'] ?? '',
  }
}

interface PendingCall {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

type EventListener = (method: string, params: Record<string, unknown>) => void

const AUTH_ID = 0

@Injectable()
export class ConcatClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConcatClient.name)
  private readonly config: ConcatClientConfig = loadConcatConfig()

  private socket: net.Socket | null = null
  private child: ChildProcess | null = null
  private authed = false
  private nextId = 1 // 0 dành cho auth
  private pending = new Map<number, PendingCall>()
  private buffer = ''
  private listeners = new Set<EventListener>()
  private disconnectHooks = new Set<(err: Error) => void>()
  private connecting: Promise<void> | null = null
  private destroyed = false
  private activePort: number | null = null
  private activeToken: string | null = null

  get enabled(): boolean {
    return this.config.enabled
  }

  get connected(): boolean {
    return !!this.socket && !this.socket.destroyed && this.authed
  }

  get workDir(): string {
    return this.config.workDir
  }

  get assetsDir(): string {
    return this.config.assetsDir
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('CONCAT_ENABLED != true — Concat renderer đang TẮT.')
      return
    }
    // Kết nối lười: thử ngay để log sớm, thất bại thì lần gọi đầu sẽ thử lại.
    try {
      await this.ensureConnected()
      this.logger.log(`Đã nối Concat serve (${this.describeTarget()}).`)
    } catch (err) {
      this.logger.warn(
        `Chưa nối được Concat serve: ${(err as Error).message} — sẽ thử lại ở lần gọi đầu.`,
      )
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true
    this.closeSocket(new ConcatProtocolError('ConcatClient đang đóng.'))
    if (this.child) {
      this.logger.log('Dừng concat-cli serve (child process)...')
      this.child.kill('SIGTERM')
      this.child = null
    }
  }

  /** Đăng ký nhận event (export.progress / export.done / export.failed / cutout.progress). Trả về hàm hủy. */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Gọi một method Concat API, chờ response theo id. */
  async call(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    this.requireEnabled()
    await this.ensureConnected()
    const sock = this.socket
    if (!sock || !this.authed) {
      throw new ConcatProtocolError('Mất kết nối tới Concat serve.')
    }
    const id = this.nextId++
    const timeout = timeoutMs ?? this.config.requestTimeoutMs
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new ConcatApiError('timeout', `Concat không trả lời "${method}" sau ${timeout}ms.`))
      }, timeout)
      // unref để timer không giữ process sống khi idle
      timer.unref?.()
      this.pending.set(id, { resolve, reject, timer })
      sock.write(requestLine(id, method, params), (err) => {
        if (err) {
          const p = this.pending.get(id)
          if (p) {
            this.pending.delete(id)
            clearTimeout(p.timer)
            p.reject(err)
          }
        }
      })
    })
  }

  /**
   * Chờ một event thỏa predicate. Dùng cho export.done / export.failed.
   * onEvent nhận mọi event đi qua trong lúc chờ (để cập nhật progress).
   */
  async waitForEvent(
    predicate: (method: string, params: Record<string, unknown>) => boolean,
    opts: { timeoutMs: number; onEvent?: EventListener },
  ): Promise<{ method: string; params: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new ConcatApiError('timeout', 'Hết thời gian chờ event từ Concat.'))
      }, opts.timeoutMs)
      timer.unref?.()
      const onDisconnect = (err: Error) => {
        cleanup()
        reject(err)
      }
      const listener: EventListener = (method, params) => {
        try {
          opts.onEvent?.(method, params)
        } catch {
          // callback progress không được làm vỡ vòng chờ
        }
        if (predicate(method, params)) {
          cleanup()
          resolve({ method, params })
        }
      }
      const cleanup = () => {
        clearTimeout(timer)
        this.listeners.delete(listener)
        this.disconnectHooks.delete(onDisconnect)
      }
      this.listeners.add(listener)
      this.disconnectHooks.add(onDisconnect)
    })
  }

  // ─── nội bộ ──────────────────────────────────────────────────────────────

  private requireEnabled(): void {
    if (!this.config.enabled) {
      throw new ConcatApiError(
        'disabled',
        'Concat renderer chưa được bật. Đặt CONCAT_ENABLED=true và cài concat-cli (xem docs/concat-render.md).',
      )
    }
  }

  private describeTarget(): string {
    if (this.config.socketPath) return `unix:${this.config.socketPath}`
    return `${this.config.host}:${this.activePort ?? this.config.port}`
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return
    if (this.connecting) {
      await this.connecting
      return
    }
    this.connecting = this.connectWithRetry()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  private async connectWithRetry(): Promise<void> {
    let lastErr: Error = new Error('unknown')
    for (let attempt = 0; attempt < this.config.connectRetries; attempt++) {
      if (this.destroyed) throw new ConcatProtocolError('ConcatClient đã bị hủy.')
      try {
        await this.connectOnce()
        return
      } catch (err) {
        lastErr = err as Error
        if (this.config.autostart && !this.child && attempt === 0) {
          // Lần đầu thất bại → thử spawn serve rồi nối lại.
          await this.autostartServer()
        }
        await sleep(250)
      }
    }
    throw new ConcatApiError(
      'unreachable',
      `Không nối được Concat serve (${this.describeTarget()}) sau ${this.config.connectRetries} lần thử: ${lastErr.message}`,
    )
  }

  private async connectOnce(): Promise<void> {
    const token = this.activeToken ?? this.config.token
    if (!token) {
      throw new ConcatApiError(
        'no_token',
        'Thiếu CONCAT_API_TOKEN. Chế độ autostart tự sinh token; chế độ ngoài cần đặt token của `concat-cli serve`.',
      )
    }
    const sock = this.config.socketPath
      ? net.createConnection(this.config.socketPath)
      : net.createConnection(this.activePort ?? this.config.port, this.config.host)
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        sock.destroy()
        reject(err)
      }
      sock.once('error', onError)
      sock.once('connect', () => {
        sock.off('error', onError)
        resolve()
      })
    })

    this.socket = sock
    this.buffer = ''
    this.authed = false
    sock.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')))
    sock.on('error', (err) => this.onSocketDeath(err))
    sock.on('close', () => this.onSocketDeath(new ConcatProtocolError('Kết nối tới Concat serve bị đóng.')))

    // Handshake: dòng đầu tiên PHẢI là auth.
    const authed = await new Promise<boolean>((resolve) => {
      const onLine = (line: string) => {
        try {
          const parsed = parseLine(line)
          if (parsed.kind === 'response' && parsed.id === AUTH_ID) {
            resolve(!parsed.error)
            return true
          }
        } catch {
          // bỏ qua dòng lạ trong handshake
        }
        return false
      }
      this.handshakeHandler = onLine
      sock.write(authLine(AUTH_ID, token))
      setTimeout(() => resolve(false), 5000).unref?.()
    })
    this.handshakeHandler = null
    if (!authed) {
      sock.destroy()
      this.socket = null
      throw new ConcatApiError('unauthorized', 'Concat serve từ chối token (auth handshake thất bại).')
    }
    this.authed = true
  }

  private handshakeHandler: ((line: string) => boolean) | null = null

  private onData(chunk: string): void {
    this.buffer += chunk
    const { lines, rest } = splitLines(this.buffer)
    this.buffer = rest
    // Guard: buffer phình vô hạn khi server gửi dòng dở dang mãi.
    if (this.buffer.length > 8 * 1024 * 1024) {
      this.onSocketDeath(new ConcatProtocolError('Buffer dòng từ Concat serve vượt 8MiB — ngắt kết nối.'))
      return
    }
    for (const line of lines) {
      if (this.handshakeHandler) {
        if (this.handshakeHandler(line)) continue
      }
      this.dispatchLine(line)
    }
  }

  private dispatchLine(line: string): void {
    let parsed
    try {
      parsed = parseLine(line)
    } catch (err) {
      this.logger.warn(`Bỏ dòng lạ từ Concat: ${(err as Error).message}`)
      return
    }
    if (parsed.kind === 'response') {
      const p = this.pending.get(parsed.id)
      if (!p) return // response muộn sau timeout — bỏ
      this.pending.delete(parsed.id)
      clearTimeout(p.timer)
      if (parsed.error) p.reject(new ConcatApiError(parsed.error.code, parsed.error.message))
      else p.resolve(parsed.result)
      return
    }
    for (const l of this.listeners) {
      try {
        l(parsed.method, parsed.params)
      } catch (err) {
        this.logger.warn(`Event listener lỗi: ${(err as Error).message}`)
      }
    }
  }

  private onSocketDeath(err: Error): void {
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch {
        // bỏ qua
      }
      this.socket = null
    }
    this.authed = false
    // Từ chối mọi call đang chờ — caller sẽ ensureConnected() lại ở lần gọi sau.
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new ConcatProtocolError(`Mất kết nối tới Concat serve: ${err.message}`))
    }
    this.pending.clear()
    for (const hook of this.disconnectHooks) {
      try {
        hook(err)
      } catch {
        // bỏ qua
      }
    }
    this.disconnectHooks.clear()
    if (!this.destroyed) {
      this.logger.warn(`Mất kết nối Concat serve: ${err.message} — lần gọi tới sẽ nối lại.`)
    }
  }

  private closeSocket(err: Error): void {
    this.onSocketDeath(err)
  }

  /** Spawn `concat-cli serve` như child process được quản lý. */
  private async autostartServer(): Promise<void> {
    if (this.child || this.destroyed) return
    let port = this.config.port
    if (port === 0) port = await pickFreePort(this.config.host)
    const token = this.config.token ?? randomBytes(32).toString('hex')
    this.activePort = port
    this.activeToken = token
    this.logger.log(`Spawn ${this.config.cliPath} serve --json ${this.config.host}:${port} ...`)
    const child = spawn(this.config.cliPath, ['serve', '--json', `${this.config.host}:${port}`], {
      env: { ...process.env, CONCAT_API_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    child.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line) this.logger.debug(`[concat-cli] ${line.slice(0, 300)}`)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line) this.logger.warn(`[concat-cli] ${line.slice(0, 300)}`)
    })
    child.on('error', (err) => {
      this.logger.error(`Không spawn được ${this.config.cliPath}: ${err.message} — đã cài binary chưa?`)
      this.child = null
      this.activePort = null
      this.activeToken = null
    })
    child.on('exit', (code, signal) => {
      this.logger.warn(`concat-cli serve thoát (code=${code}, signal=${signal}).`)
      if (this.child === child) {
        this.child = null
        this.activePort = null
        this.activeToken = null
      }
      // Đừng để serve chết mà socket tưởng còn sống.
      this.onSocketDeath(new ConcatProtocolError('concat-cli serve đã thoát.'))
    })
    // Đợi tiến trình kịp bind — vòng retry ở connectWithRetry sẽ nối khi sẵn sàng.
    await sleep(500)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function pickFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, host, () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}
