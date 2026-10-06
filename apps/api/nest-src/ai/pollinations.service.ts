import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { fetchTimeout } from '../common/safe-fetch'
import { AiService } from './ai.service'

/**
 * PollinationsService — text-to-image API miễn phí KHÔNG GIỚI HẠN (model FLUX schnell).
 *
 * - Generate: GET https://gen.pollinations.ai/image/{prompt}?model=flux&width=..&height=..&nologo=true
 *   header Authorization: Bearer <key> → bytes ảnh trực tiếp (content-type image/*)
 * - Key miễn phí tại https://enter.pollinations.ai (không cần thẻ).
 * - 9:16 native qua width/height tùy ý.
 *
 * Key của user được lưu mã hóa qua AI Pro (provider 'pollinations'),
 * KHÔNG bao giờ log hay trả về client.
 */
export interface PollinationsImageOpts {
  width?: number
  height?: number
  model?: string
}

export interface PollinationsImageOut {
  buffer: Buffer
  mime: string
  model: string
}

const GEN_URL = 'https://gen.pollinations.ai/image'
const DEFAULT_MODEL = 'flux'
const IMAGE_TIMEOUT_MS = 180_000

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(Math.max(Math.round(n), min), max)
}

@Injectable()
export class PollinationsService {
  constructor(private readonly aiService: AiService) {}

  /**
   * Lấy API key Pollinations đã giải mã của workspace, hoặc null khi chưa kết nối.
   */
  async getApiKey(workspaceId: string): Promise<string | null> {
    try {
      const { apiKey } = await this.aiService.getChatKey(workspaceId, 'pollinations')
      return apiKey
    } catch {
      return null
    }
  }

  /** Che key nếu chẳng may lọt vào message lỗi. */
  private sanitize(message: string, apiKey: string): string {
    return message.split(apiKey).join('[redacted]')
  }

  private apiError(resStatus: number, body: string, apiKey: string): HttpException {
    // Message giữ nguyên "429"/"quota" để VideogenService.is429ish nhận ra → thử provider tiếp.
    const hint =
      resStatus === 401 || resStatus === 403
        ? 'Key Pollinations bị từ chối — hãy kiểm tra lại key ở Cài đặt → AI Pro.'
        : resStatus === 429
          ? 'Pollinations báo 429 (hết quota/giới hạn tạm thời).'
          : `Pollinations tạo ảnh thất bại (HTTP ${resStatus}).`
    return new HttpException(
      `${hint} Chi tiết: ${this.sanitize(body.slice(0, 300), apiKey)}`,
      HttpStatus.BAD_GATEWAY,
    )
  }

  async generateImage(
    apiKey: string,
    prompt: string,
    opts?: PollinationsImageOpts,
  ): Promise<PollinationsImageOut> {
    const cleanPrompt = prompt.trim().slice(0, 2000)
    if (!cleanPrompt) {
      throw new HttpException('Prompt tạo ảnh trống.', HttpStatus.BAD_REQUEST)
    }
    const model = (opts?.model ?? '').trim() || DEFAULT_MODEL
    const width = clamp(opts?.width ?? 768, 64, 2048)
    const height = clamp(opts?.height ?? 1344, 64, 2048)
    const params = new URLSearchParams({
      model,
      width: String(width),
      height: String(height),
      nologo: 'true',
    })
    const url = `${GEN_URL}/${encodeURIComponent(cleanPrompt)}?${params.toString()}`
    const res = await fetchTimeout(
      url,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      IMAGE_TIMEOUT_MS,
    )
    const buf = Buffer.from(await res.arrayBuffer())
    if (!res.ok) throw this.apiError(res.status, buf.toString('utf8'), apiKey)
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim() || 'image/jpeg'
    if (!mime.startsWith('image/') || buf.length === 0) {
      throw new HttpException(
        'Pollinations không trả về ảnh hợp lệ. Hãy thử lại với prompt khác.',
        HttpStatus.BAD_GATEWAY,
      )
    }
    return { buffer: buf, mime, model }
  }
}
