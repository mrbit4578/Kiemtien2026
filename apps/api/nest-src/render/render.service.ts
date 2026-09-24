/**
 * RenderService — pipeline "kịch bản → video MP4" dùng Concat engine headless.
 *
 * Luồng một job:
 *  1. Tải asset (URL qua SSRF guard, hoặc file local trong CONCAT_ASSETS_DIR)
 *  2. media.probe → độ dài từng clip (để xếp timeline)
 *  3. project.create → media.import từng file (lấy media id "m…")
 *  4. edit.apply Batch: xếp clip nối tiếp + caption (AddTextClip) + lớp hiệu ứng
 *  5. export.run → chờ event export.done / export.failed (tiến độ → DB)
 *  6. File MP4 nằm ở CONCAT_WORK_DIR/exports/<jobId>.mp4
 *
 * Concat chỉ chạy 1 export tại một thời điểm (export thứ hai bị từ chối Busy),
 * nên service serialize toàn bộ job qua một hàng đợi promise nội bộ.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common'
import { createWriteStream, existsSync, promises as fs } from 'fs'
import { join, resolve, basename, extname } from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { assertSafeUrl, fetchTimeout, redactUrlSecrets } from '../common/safe-fetch'
import { ConcatClient } from './concat-client'
import { ConcatApiError } from './concat-protocol'

export interface RenderClipInput {
  /** URL http(s) công khai, hoặc đường dẫn file tuyệt đối (khi CONCAT_ASSETS_DIR cho phép). */
  source: string
  /** Vị trí giây trên timeline; bỏ qua = nối tiếp clip trước. */
  start?: number
  /** Ghi đè độ dài giây; bỏ qua = độ dài probe được. */
  duration?: number
}

export interface RenderCaption {
  text: string
  start: number
  duration: number
}

export interface RenderSpec {
  name: string
  clips: RenderClipInput[]
  captions?: RenderCaption[]
  /** Package id hiệu ứng phủ toàn video, vd "concat.warm". Bỏ qua = không phủ. */
  effectId?: string
  width?: number
  height?: number
  rateNum?: number
  rateDen?: number
  crf?: number
  preset?: string
  codec?: 'h264' | 'hevc' | 'av1'
}

export interface RenderJobView {
  id: string
  workspaceId: string
  name: string
  status: string
  progress: number
  concatJob: string | null
  outputPath: string | null
  hasFile: boolean
  error: string | null
  createdAt: Date
  updatedAt: Date
}

type TimelineCommand = Record<string, unknown>

export interface TimelineLayoutInput {
  mediaIds: string[]
  durations: number[]
  starts: Array<number | undefined>
  captions: RenderCaption[]
  effectId?: string
}

/**
 * Dựng Batch command cho edit.apply — PURE, test được không cần engine.
 * Clip xếp nối tiếp theo cursor trừ khi start được chỉ định rõ.
 */
export function buildTimelineCommands(input: TimelineLayoutInput): {
  commands: TimelineCommand[]
  totalDuration: number
} {
  const commands: TimelineCommand[] = []
  let cursor = 0
  for (let i = 0; i < input.mediaIds.length; i++) {
    const start = input.starts[i] ?? cursor
    const safeStart = Math.max(0, start)
    commands.push({ op: 'addClipAtFirstFree', mediaId: input.mediaIds[i], start: safeStart })
    cursor = safeStart + Math.max(0.1, input.durations[i] ?? 5)
  }
  const totalDuration = cursor
  for (const cap of input.captions) {
    const text = cap.text.trim()
    if (!text) continue
    commands.push({
      op: 'addTextClip',
      trackId: null,
      above: true, // caption nằm TRÊN video, không đè xuống đáy như title thường
      start: Math.max(0, cap.start),
      duration: Math.max(0.5, cap.duration),
      style: { content: text.slice(0, 280) },
      offsetY: 0.36, // lower-third
    })
  }
  if (input.effectId) {
    commands.push({
      op: 'addLayerClip',
      trackId: null,
      start: 0,
      duration: totalDuration,
      effectId: input.effectId,
    })
  }
  return { commands, totalDuration }
}

const MAX_ASSET_BYTES = 500 * 1024 * 1024 // 500MB
const ASSET_TIMEOUT_MS = 120_000
const EXPORT_TIMEOUT_MS = parseInt(process.env['CONCAT_EXPORT_TIMEOUT_MS'] ?? '', 10) || 6 * 3600 * 1000

@Injectable()
export class RenderService implements OnModuleInit {
  private readonly logger = new Logger(RenderService.name)
  /** Hàng đợi serialize: Concat từ chối export thứ hai khi đang bận (Busy). */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly concat: ConcatClient,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Startup recovery: job nào kẹt ở 'running' do API restart/deploy giữa
   * chừng (hàng đợi trong bộ nhớ mất, DB vẫn ghi running) thì đưa về
   * 'queued' để chạy lại từ đầu. Không có bước này, job kẹt vĩnh viễn.
   */
  async onModuleInit(): Promise<void> {
    try {
      const stuck = await this.prisma.renderJob.findMany({ where: { status: 'running' } })
      for (const job of stuck) {
        await this.prisma.renderJob.update({
          where: { id: job.id },
          data: { status: 'queued', progress: 0, error: null },
        })
        this.enqueue(job.id)
        this.logger.warn(`Render job ${job.id} kẹt ở 'running' lúc restart — đã đưa về hàng đợi.`)
      }
      if (stuck.length > 0) this.logger.log(`Đã phục hồi ${stuck.length} render job kẹt.`)
    } catch (err) {
      this.logger.error(`Startup recovery render jobs thất bại: ${(err as Error).message}`)
    }
  }

  // ─── public API ──────────────────────────────────────────────────────────

  async health(): Promise<Record<string, unknown>> {
    if (!this.concat.enabled) {
      return { enabled: false, connected: false, message: 'Concat renderer đang tắt (CONCAT_ENABLED != true).' }
    }
    try {
      const v = (await this.concat.call('version')) as Record<string, unknown>
      return {
        enabled: true,
        connected: true,
        apiVersion: v['apiVersion'],
        concat: v['concat'],
        capabilities: v['capabilities'],
      }
    } catch (err) {
      return { enabled: true, connected: false, error: (err as Error).message }
    }
  }

  /** GET /render/catalogue — liệt kê effect package để chọn effectId. */
  async catalogue(kind?: string): Promise<unknown> {
    this.requireEnabled()
    return this.concat.call('catalogue.list', { kind: kind || null })
  }

  /** POST /render/jobs — tạo job, trả về ngay (202); render chạy nền theo hàng đợi. */
  async createJob(workspaceId: string, spec: RenderSpec): Promise<RenderJobView> {
    this.requireEnabled()
    this.validateSpec(spec)
    const row = await this.prisma.renderJob.create({
      data: {
        workspaceId,
        name: spec.name.slice(0, 120),
        status: 'queued',
        specJson: JSON.stringify(spec),
      },
    })
    // Chạy nền — lỗi đã được ghi vào row bên trong runJob.
    this.enqueue(row.id)
    return this.toView(row)
  }

  async getJob(workspaceId: string, id: string): Promise<RenderJobView> {
    const row = await this.prisma.renderJob.findFirst({ where: { id, workspaceId } })
    if (!row) throw new NotFoundException('Không tìm thấy render job.')
    return this.toView(row)
  }

  async listJobs(workspaceId: string, limit = 20): Promise<RenderJobView[]> {
    const rows = await this.prisma.renderJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    })
    return rows.map((r) => this.toView(r))
  }

  /** DELETE /render/jobs/:id — hủy export đang chạy (hoặc job đang xếp hàng). */
  async cancelJob(workspaceId: string, id: string): Promise<RenderJobView> {
    const row = await this.prisma.renderJob.findFirst({ where: { id, workspaceId } })
    if (!row) throw new NotFoundException('Không tìm thấy render job.')
    if (row.status === 'done' || row.status === 'failed' || row.status === 'cancelled') {
      return this.toView(row)
    }
    if (row.concatJob) {
      try {
        await this.concat.call('export.cancel', { job: row.concatJob })
      } catch (err) {
        this.logger.warn(`export.cancel ${row.concatJob} lỗi: ${(err as Error).message}`)
      }
    }
    const updated = await this.prisma.renderJob.update({
      where: { id },
      data: { status: 'cancelled', error: 'Người dùng hủy.' },
    })
    return this.toView(updated)
  }

  // ─── pipeline ────────────────────────────────────────────────────────────

  private enqueue(jobId: string): void {
    this.queue = this.queue
      .then(() => this.runJob(jobId))
      .catch((err) => this.logger.error(`Render job ${jobId} lỗi ngoài dự kiến: ${(err as Error).message}`))
  }

  private async runJob(jobId: string): Promise<void> {
    const row = await this.prisma.renderJob.findUnique({ where: { id: jobId } })
    if (!row || row.status !== 'queued') return // đã bị hủy khi đang xếp hàng
    const spec = JSON.parse(row.specJson) as RenderSpec
    const jobDir = join(this.concat.workDir, 'jobs', jobId)
    const assetsDir = join(jobDir, 'assets')
    const projectsDir = join(jobDir, 'projects')
    const exportsDir = join(this.concat.workDir, 'exports')
    await this.prisma.renderJob.update({ where: { id: jobId }, data: { status: 'running', progress: 0 } })

    try {
      await fs.mkdir(assetsDir, { recursive: true })
      await fs.mkdir(projectsDir, { recursive: true })
      await fs.mkdir(exportsDir, { recursive: true })

      // 1. Asset + probe độ dài
      const files: string[] = []
      const durations: number[] = []
      for (let i = 0; i < spec.clips.length; i++) {
        const file = await this.resolveAsset(jobId, assetsDir, spec.clips[i]!.source, i)
        files.push(file)
        const probe = (await this.concat.call('media.probe', { path: file })) as {
          duration?: number | null
          kind?: string
        }
        const override = spec.clips[i]!.duration
        durations.push(
          override && override > 0 ? override : probe.duration && probe.duration > 0 ? probe.duration : 5,
        )
      }

      // 2. Project + import media
      const projectName = `kt-${jobId}`
      await this.concat.call('project.create', {
        location: projectsDir,
        name: projectName,
        video: {
          width: spec.width ?? 1080,
          height: spec.height ?? 1920, // mặc định dọc 9:16 cho TikTok/Reels
          rateNum: spec.rateNum ?? 30,
          rateDen: spec.rateDen ?? 1,
        },
      })
      const projectPath = join(projectsDir, projectName)
      const mediaIds: string[] = []
      for (const file of files) {
        const view = (await this.concat.call('media.import', { path: projectPath, file })) as {
          createdId?: string | null
        }
        if (!view.createdId) throw new ConcatApiError('no_media_id', `media.import không trả media id cho ${basename(file)}.`)
        mediaIds.push(view.createdId)
      }

      // 3. Dựng timeline: clip nối tiếp + caption + lớp hiệu ứng
      const { commands, totalDuration } = buildTimelineCommands({
        mediaIds,
        durations,
        starts: spec.clips.map((c) => c.start),
        captions: spec.captions ?? [],
        effectId: spec.effectId,
      })
      await this.concat.call('edit.apply', {
        path: projectPath,
        command: { op: 'batch', commands },
      })
      this.logger.log(`Job ${jobId}: timeline ${mediaIds.length} clip, ${totalDuration.toFixed(1)}s.`)

      // 4. Export — trả về ngay Started{job}, chờ event export.done
      const output = join(exportsDir, `${jobId}.mp4`)
      const started = (await this.concat.call('export.run', {
        path: projectPath,
        output,
        crf: spec.crf ?? 20,
        preset: spec.preset ?? 'medium',
        codec: spec.codec ?? 'h264',
        width: spec.width ?? 1080,
        height: spec.height ?? 1920,
        rateNum: spec.rateNum ?? 30,
        rateDen: spec.rateDen ?? 1,
      })) as { job: string }
      await this.prisma.renderJob.update({ where: { id: jobId }, data: { concatJob: started.job } })

      const terminal = await this.concat.waitForEvent(
        (method, params) =>
          (method === 'export.done' || method === 'export.failed') && params['job'] === started.job,
        {
          timeoutMs: EXPORT_TIMEOUT_MS,
          onEvent: (method, params) => {
            if (method === 'export.progress' && params['job'] === started.job) {
              const frame = Number(params['frame'] ?? 0)
              const total = Number(params['total'] ?? 0)
              const progress = total > 0 ? Math.min(0.99, frame / total) : 0
              void this.prisma.renderJob
                .update({ where: { id: jobId }, data: { progress } })
                .catch(() => undefined)
            }
          },
        },
      )
      if (terminal.method === 'export.failed') {
        const err = terminal.params['error'] as { code?: unknown; message?: string } | undefined
        throw new ConcatApiError(err?.code ?? 'export_failed', err?.message ?? 'Export thất bại không rõ lý do.')
      }
      if (!existsSync(output)) {
        throw new ConcatApiError('no_output', 'Concat báo export.done nhưng không thấy file MP4.')
      }
      await this.prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'done', progress: 1, outputPath: output },
      })
      this.logger.log(`Job ${jobId} xong: ${output}`)
    } catch (err) {
      const message = err instanceof ConcatApiError ? `[${String(err.code)}] ${err.message}` : (err as Error).message
      this.logger.error(`Job ${jobId} thất bại: ${message}`)
      await this.prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: message.slice(0, 1000) },
      })
    }
  }

  // ─── asset ───────────────────────────────────────────────────────────────

  /**
   * Biến source thành file local: URL → tải về (qua SSRF guard);
   * path tuyệt đối → chỉ chấp nhận trong CONCAT_ASSETS_DIR (chống traversal).
   */
  private async resolveAsset(jobId: string, assetsDir: string, source: string, index: number): Promise<string> {
    const ext = extname(source.split('?')[0]!).toLowerCase() || '.mp4'
    const dest = join(assetsDir, `clip-${index}${ext}`)
    if (/^https?:\/\//i.test(source)) {
      const safe = await assertSafeUrl(source) // ném SsrfBlockedError nếu URL nội bộ/nguy hiểm
      this.logger.log(`Job ${jobId}: tải asset ${redactUrlSecrets(source).slice(0, 120)}`)
      const res = await fetchTimeout(safe.toString(), {}, ASSET_TIMEOUT_MS)
      if (!res.ok || !res.body) {
        throw new BadRequestException(`Không tải được asset (HTTP ${res.status}).`)
      }
      const len = Number(res.headers.get('content-length') ?? 0)
      if (len > MAX_ASSET_BYTES) throw new BadRequestException('Asset vượt 500MB.')
      let received = 0
      const out = createWriteStream(dest)
      try {
        // Stream từng chunk: đếm byte để chặn file quá lớn giữa chừng.
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          received += chunk.byteLength
          if (received > MAX_ASSET_BYTES) throw new BadRequestException('Asset vượt 500MB.')
          if (!out.write(chunk)) {
            await new Promise<void>((r) => out.once('drain', r))
          }
        }
        await new Promise<void>((resolve, reject) => {
          out.once('finish', () => resolve())
          out.once('error', reject)
          out.end()
        })
      } catch (err) {
        out.destroy()
        await fs.rm(dest, { force: true })
        throw new BadRequestException(`Tải asset thất bại: ${(err as Error).message}`)
      }
      return dest
    }
    // File local: phải là tuyệt đối và nằm trong CONCAT_ASSETS_DIR.
    const allowRoot = this.concat.assetsDir
    if (!allowRoot) {
      throw new BadRequestException('Source local chỉ dùng được khi đặt CONCAT_ASSETS_DIR.')
    }
    const abs = resolve(source)
    const root = resolve(allowRoot)
    if (abs !== root && !abs.startsWith(root + '/')) {
      throw new BadRequestException('Đường dẫn source nằm ngoài CONCAT_ASSETS_DIR.')
    }
    if (!existsSync(abs)) throw new BadRequestException(`Không thấy file: ${basename(abs)}`)
    return abs
  }

  // ─── validate ────────────────────────────────────────────────────────────

  private validateSpec(spec: RenderSpec): void {
    if (!spec || typeof spec !== 'object') throw new BadRequestException('Thiếu spec render.')
    if (!spec.name || typeof spec.name !== 'string') throw new BadRequestException('spec.name bắt buộc.')
    if (!Array.isArray(spec.clips) || spec.clips.length === 0) {
      throw new BadRequestException('spec.clips cần ít nhất 1 clip.')
    }
    if (spec.clips.length > 20) throw new BadRequestException('Tối đa 20 clip một job.')
    for (const c of spec.clips) {
      if (!c || typeof c.source !== 'string' || !c.source) {
        throw new BadRequestException('Mỗi clip cần source (URL hoặc đường dẫn file).')
      }
    }
    for (const cap of spec.captions ?? []) {
      if (!cap || typeof cap.text !== 'string' || !cap.text.trim()) {
        throw new BadRequestException('Caption cần text.')
      }
      if (!(cap.duration > 0)) throw new BadRequestException('Caption cần duration > 0.')
    }
    for (const dim of [spec.width, spec.height]) {
      if (dim !== undefined && !(dim >= 144 && dim <= 4096)) {
        throw new BadRequestException('width/height phải trong khoảng 144–4096.')
      }
    }
  }

  private requireEnabled(): void {
    if (!this.concat.enabled) {
      throw new ServiceUnavailableException(
        'Concat renderer chưa được bật. Đặt CONCAT_ENABLED=true và cài concat-cli (xem docs/concat-render.md).',
      )
    }
  }

  private toView(row: {
    id: string
    workspaceId: string
    name: string
    status: string
    progress: number
    concatJob: string | null
    outputPath: string | null
    error: string | null
    createdAt: Date
    updatedAt: Date
  }): RenderJobView {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      status: row.status,
      progress: row.progress,
      concatJob: row.concatJob,
      outputPath: row.outputPath,
      hasFile: !!row.outputPath && existsSync(row.outputPath),
      error: row.error,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
