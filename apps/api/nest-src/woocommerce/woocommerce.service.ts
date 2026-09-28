import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { encrypt, decrypt } from '@orh/crypto'
import { WooCommerceClient, type WooProductsQuery } from '@orh/connectors'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit/audit.service'

export interface ConnectWooStoreDto {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
}

/** Field an toàn trả ra API — KHÔNG bao giờ gồm key/secret (kể cả đã mã hóa). */
const SAFE_SELECT = {
  id: true,
  storeUrl: true,
  storeName: true,
  currency: true,
  wcVersion: true,
  status: true,
  lastError: true,
  productCount: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
} as const

@Injectable()
export class WooCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private buildClient(storeUrl: string, keyCipher: string, secretCipher: string): WooCommerceClient {
    let consumerKey: string
    let consumerSecret: string
    try {
      consumerKey = decrypt(keyCipher)
      consumerSecret = decrypt(secretCipher)
    } catch {
      throw new InternalServerErrorException(
        'Lỗi giải mã key: TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng.',
      )
    }
    return new WooCommerceClient({ storeUrl, consumerKey, consumerSecret })
  }

  private normalizeUrl(raw: string): string {
    const t = (raw || '').trim().replace(/\/+$/, '')
    if (!/^https:\/\/[^/]+/.test(t)) {
      throw new BadRequestException('URL cửa hàng phải bắt đầu bằng https:// (WooCommerce yêu cầu HTTPS cho REST API).')
    }
    return t
  }

  /** Kết nối (hoặc cập nhật) cửa hàng: test trước, lưu sau. */
  async connect(workspaceId: string, dto: ConnectWooStoreDto) {
    const storeUrl = this.normalizeUrl(dto.storeUrl)
    if (!dto.consumerKey?.trim() || !dto.consumerSecret?.trim()) {
      throw new BadRequestException('Thiếu Consumer Key hoặc Consumer Secret.')
    }
    const client = new WooCommerceClient({
      storeUrl,
      consumerKey: dto.consumerKey.trim(),
      consumerSecret: dto.consumerSecret.trim(),
    })
    let info: { storeName: string; version: string; currency: string }
    try {
      info = await client.testConnection()
    } catch (e: any) {
      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'woo_connect_failed',
        entityType: 'woo_store',
        result: 'failure',
        metadata: { storeUrl, error: e?.message },
      })
      throw new BadRequestException(`Không kết nối được tới cửa hàng: ${e?.message || e}`)
    }

    // Đếm nhanh tổng sản phẩm để hiển thị (1 request nhẹ).
    let productCount = 0
    try {
      const r = await client.listProducts({ perPage: 1 })
      productCount = r.total
    } catch {
      /* không chặn connect vì lỗi đếm */
    }

    let keyCipher: string
    let secretCipher: string
    try {
      keyCipher = encrypt(dto.consumerKey.trim())
      secretCipher = encrypt(dto.consumerSecret.trim())
    } catch {
      throw new InternalServerErrorException('Lỗi mã hóa: TOKEN_ENCRYPTION_KEY chưa được cấu hình đúng.')
    }

    const saved = await this.prisma.wooStore.upsert({
      where: { workspaceId_storeUrl: { workspaceId, storeUrl } },
      update: {
        encryptedConsumerKey: keyCipher,
        encryptedConsumerSecret: secretCipher,
        storeName: info.storeName,
        currency: info.currency,
        wcVersion: info.version,
        status: 'connected',
        lastError: null,
        productCount,
        lastSyncAt: new Date(),
      },
      create: {
        workspaceId,
        storeUrl,
        encryptedConsumerKey: keyCipher,
        encryptedConsumerSecret: secretCipher,
        storeName: info.storeName,
        currency: info.currency,
        wcVersion: info.version,
        status: 'connected',
        productCount,
        lastSyncAt: new Date(),
      },
      select: SAFE_SELECT,
    })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'woo_connected',
      entityType: 'woo_store',
      targetId: saved.id,
      result: 'success',
      metadata: { storeUrl },
    })
    return saved
  }

  list(workspaceId: string) {
    return this.prisma.wooStore.findMany({ where: { workspaceId }, select: SAFE_SELECT, orderBy: { createdAt: 'desc' } })
  }

  private async getOwned(workspaceId: string, id: string) {
    const row = await this.prisma.wooStore.findFirst({ where: { id, workspaceId } })
    if (!row) throw new NotFoundException('Không tìm thấy cửa hàng đã kết nối.')
    return row
  }

  /** Test lại kết nối và cập nhật trạng thái. */
  async test(workspaceId: string, id: string) {
    const row = await this.getOwned(workspaceId, id)
    const client = this.buildClient(row.storeUrl, row.encryptedConsumerKey, row.encryptedConsumerSecret)
    try {
      const info = await client.testConnection()
      return this.prisma.wooStore.update({
        where: { id },
        data: {
          status: 'connected',
          lastError: null,
          storeName: info.storeName,
          currency: info.currency,
          wcVersion: info.version,
          lastSyncAt: new Date(),
        },
        select: SAFE_SELECT,
      })
    } catch (e: any) {
      const updated = await this.prisma.wooStore.update({
        where: { id },
        data: { status: 'error', lastError: e?.message || 'Lỗi không xác định' },
        select: SAFE_SELECT,
      })
      await this.audit.log({
        workspaceId,
        actorId: workspaceId,
        action: 'woo_test_failed',
        entityType: 'woo_store',
        targetId: id,
        result: 'failure',
        metadata: { error: e?.message },
      })
      return updated
    }
  }

  async products(workspaceId: string, id: string, query: WooProductsQuery) {
    const row = await this.getOwned(workspaceId, id)
    if (row.status !== 'connected') {
      throw new BadRequestException('Cửa hàng đang ở trạng thái lỗi — hãy kiểm tra lại kết nối.')
    }
    const client = this.buildClient(row.storeUrl, row.encryptedConsumerKey, row.encryptedConsumerSecret)
    try {
      return await client.listProducts(query)
    } catch (e: any) {
      await this.prisma.wooStore.update({
        where: { id },
        data: { status: 'error', lastError: e?.message || 'Lỗi không xác định' },
      })
      throw new BadRequestException(`Không đọc được sản phẩm: ${e?.message || e}`)
    }
  }

  async product(workspaceId: string, id: string, productId: number) {
    const row = await this.getOwned(workspaceId, id)
    const client = this.buildClient(row.storeUrl, row.encryptedConsumerKey, row.encryptedConsumerSecret)
    try {
      return await client.getProduct(productId)
    } catch (e: any) {
      throw new BadRequestException(`Không đọc được sản phẩm: ${e?.message || e}`)
    }
  }

  async remove(workspaceId: string, id: string) {
    const row = await this.getOwned(workspaceId, id)
    await this.prisma.wooStore.delete({ where: { id } })
    await this.audit.log({
      workspaceId,
      actorId: workspaceId,
      action: 'woo_disconnected',
      entityType: 'woo_store',
      targetId: id,
      result: 'success',
      metadata: { storeUrl: row.storeUrl },
    })
    return { ok: true }
  }

  /** Store connected đầu tiên của workspace — dùng cho agent tool. */
  async findFirstConnected(workspaceId: string) {
    return this.prisma.wooStore.findFirst({ where: { workspaceId, status: 'connected' } })
  }

  /** Search sản phẩm cho agent (trả gọn để nhét vào context). */
  async searchForAgent(workspaceId: string, keyword: string, limit = 8) {
    const row = await this.findFirstConnected(workspaceId)
    if (!row) return { connected: false as const, products: [] as any[] }
    const client = this.buildClient(row.storeUrl, row.encryptedConsumerKey, row.encryptedConsumerSecret)
    const r = await client.listProducts({ search: keyword, perPage: Math.min(Math.max(limit, 1), 12) })
    return {
      connected: true as const,
      storeUrl: row.storeUrl,
      products: r.products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        regularPrice: p.regularPrice,
        onSale: p.onSale,
        permalink: p.permalink,
        image: p.images[0]?.src || '',
        categories: p.categories.map((c) => c.name).join(', '),
        shortDescription: p.shortDescription,
        rating: p.averageRating,
      })),
      total: r.total,
    }
  }
}
