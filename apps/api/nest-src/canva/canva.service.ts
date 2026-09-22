import { Injectable, NotFoundException, ServiceUnavailableException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'
import { getConnector } from '../common/provider-registry'
import { CanvaConnector } from '@orh/connectors'
import { fetchTimeout } from '../common/safe-fetch'
import type { Connection as SharedConnection } from '@orh/shared'

/**
 * Pipeline "Agent → Canva Autofill → Content Studio":
 * 1. Liệt kê brand template của user trên Canva
 * 2. Đọc dataset (các trường điền được) của template
 * 3. Autofill: điền dữ liệu kịch bản vào template → design mới
 * 4. Export design → URL file (PNG/JPG/MP4)
 * 5. Tải file về → upload lên imgbb (host ảnh ổn định cho Instagram)
 * 6. Tạo ContentItem draft (approvalStatus=pending) → user duyệt trong
 *    Content Studio như luồng an toàn hiện tại → approve → queue → publish
 */
@Injectable()
export class CanvaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private getCanvaConnector(): CanvaConnector {
    const c = getConnector('canva')
    if (!(c instanceof CanvaConnector)) throw new BadRequestException('Connector Canva chưa sẵn sàng.')
    return c
  }

  private async getActiveConnection(workspaceId: string) {
    const row = await this.prisma.connection.findFirst({
      where: { workspaceId, provider: 'canva', status: 'active' },
      orderBy: { createdAt: 'desc' },
    })
    if (!row) {
      throw new NotFoundException(
        'Chưa kết nối tài khoản Canva. Vào Kết nối & Bảo mật → Canva → bấm Kết nối trước.',
      )
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      provider: row.provider as SharedConnection['provider'],
      providerUserId: row.providerUserId,
      encryptedAccessToken: row.encryptedAccessToken,
      encryptedRefreshToken: row.encryptedRefreshToken ?? undefined,
      expiresAt: row.expiresAt,
      scopesJson: row.scopesJson as string[],
      status: row.status as SharedConnection['status'],
      lastError: row.lastError ?? undefined,
      createdAt: row.createdAt,
    } satisfies SharedConnection
  }

  async listTemplates(workspaceId: string) {
    const conn = await this.getActiveConnection(workspaceId)
    return this.getCanvaConnector().listBrandTemplates(conn)
  }

  async getDataset(workspaceId: string, templateId: string) {
    const conn = await this.getActiveConnection(workspaceId)
    return this.getCanvaConnector().getTemplateDataset(conn, templateId)
  }

  /**
   * Chạy autofill + export, trả về designId và URL file.
   * Không tạo content — để frontend cho user xem trước rồi mới quyết định.
   */
  async runAutofill(
    workspaceId: string,
    brandTemplateId: string,
    data: Record<string, string>,
    format: 'png' | 'jpg' | 'mp4' | 'gif' = 'png',
  ): Promise<{ designId: string; urls: string[] }> {
    const conn = await this.getActiveConnection(workspaceId)
    const connector = this.getCanvaConnector()
    const jobId = await connector.createAutofill(conn, brandTemplateId, data)
    const designId = await connector.waitAutofill(conn, jobId)
    const exportJobId = await connector.createExport(conn, designId, format)
    const urls = await connector.waitExport(conn, exportJobId)
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'canva_autofill_completed',
      provider: 'canva',
      entityType: 'design',
      targetId: designId,
      result: 'success',
      metadata: { brandTemplateId, format },
    })
    return { designId, urls }
  }

  /**
   * Pipeline đầy đủ: autofill → export → tải file → upload imgbb →
   * tạo ContentItem draft chờ duyệt (Quy trình Duyệt An Toàn).
   */
  async autofillToContent(
    workspaceId: string,
    brandTemplateId: string,
    data: Record<string, string>,
    caption: string,
    format: 'png' | 'jpg' | 'mp4' | 'gif' = 'png',
  ) {
    const { designId, urls } = await this.runAutofill(workspaceId, brandTemplateId, data, format)

    // Tải file export về rồi host lại lên imgbb để có URL ổn định cho Instagram
    const apiKey = process.env.IMGBB_API_KEY?.trim()
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Thiếu biến môi trường IMGBB_API_KEY trên server — cần để host file từ Canva. ' +
          'Thêm key vào Environment Variables của API service và deploy lại.',
      )
    }
    const assetUrls: string[] = []
    for (const url of urls) {
      let buf: Buffer
      try {
        const res = await fetchTimeout(url, {}, 60000)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        buf = Buffer.from(await res.arrayBuffer())
      } catch (err) {
        throw new BadRequestException(
          `Không tải được file export từ Canva (${err instanceof Error ? err.message : String(err)}). URL export hết hạn sau ~24h — hãy chạy lại autofill.`,
        )
      }
      const form = new FormData()
      form.append('key', apiKey)
      form.append('image', buf.toString('base64'))
      const up = await fetchTimeout('https://api.imgbb.com/1/upload', { method: 'POST', body: form }, 60000)
      const upData = (await up.json().catch(() => null)) as { data?: { url?: string } } | null
      if (!up.ok || !upData?.data?.url) {
        throw new BadRequestException('imgbb từ chối upload file từ Canva. Kiểm tra lại IMGBB_API_KEY.')
      }
      assetUrls.push(upData.data.url)
    }

    const item = await this.prisma.contentItem.create({
      data: {
        workspaceId,
        caption,
        assetUrl: assetUrls.join('\n'),
        status: 'draft',
        approvalStatus: 'pending',
      },
    })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'content_created',
      provider: 'canva',
      entityType: 'content',
      targetId: item.id,
      result: 'success',
      metadata: { designId, source: 'canva_autofill', brandTemplateId },
    })
    return { contentId: item.id, designId, assetUrls }
  }
}
