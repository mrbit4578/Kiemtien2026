/**
 * Re-encrypt toàn bộ token/key đã lưu sang TOKEN_ENCRYPTION_KEY mới.
 *
 * Dùng trong BƯỚC 3 của quy trình xoay key (docs/key-rotation.md).
 *
 * Cách chạy:
 *   # Dry-run trước — chỉ đọc + giải mã, KHÔNG ghi DB:
 *   pnpm --filter @orh/api exec tsx scripts/re-encrypt-tokens.ts --dry-run
 *
 *   # Chạy thật:
 *   pnpm --filter @orh/api exec tsx scripts/re-encrypt-tokens.ts
 *
 * Yêu cầu env:
 *   DATABASE_URL / DIRECT_DATABASE_URL — Prisma kết nối DB
 *   TOKEN_ENCRYPTION_KEY            — key MỚI (encrypt luôn dùng key này)
 *   TOKEN_ENCRYPTION_KEY_PREVIOUS   — key CŨ (để decrypt bản ghi chưa xoay)
 *
 * Đặc tính an toàn:
 * - Chỉ UPDATE bản ghi nào decrypt() thành công (tự fallback key cũ).
 * - Bản ghi đã dùng key mới (decrypt được bằng key chính đơn độc) được BỎ QUA
 *   → chạy lại nhiều lần an toàn (idempotent), và lần chạy thứ 2 báo
 *   needsRotation=0 là tín hiệu "đã xoay xong toàn bộ".
 * - KHÔNG ném giữa chừng: lỗi từng bản ghi được gom lại, in báo cáo cuối,
 *   exit code 1 nếu có lỗi.
 */
import { PrismaClient } from '@prisma/client'
// Import TRỰC TIẾP source TS (không qua @orh/crypto đã build) để script luôn
// dùng đúng logic decrypt() mới nhất (fallback TOKEN_ENCRYPTION_KEY_PREVIOUS),
// kể cả khi packages chưa được build lại.
import { decrypt, encrypt, TokenDecryptError } from '../../../packages/crypto/src/envelope'

const DRY_RUN = process.argv.includes('--dry-run')
const PROGRESS_EVERY = 100

interface TableConfig {
  /** Tên delegate trên PrismaClient, ví dụ prisma.connection */
  model: 'connection' | 'aiConnection' | 'wooStore'
  label: string
  /** Đúng tên field trong schema.prisma */
  fields: string[]
}

const TABLES: TableConfig[] = [
  {
    model: 'connection',
    label: 'connections',
    fields: ['encryptedAccessToken', 'encryptedRefreshToken'],
  },
  { model: 'aiConnection', label: 'ai_connections', fields: ['keyCipher'] },
  {
    model: 'wooStore',
    label: 'woo_stores',
    fields: ['encryptedConsumerKey', 'encryptedConsumerSecret'],
  },
]

interface RowError {
  table: string
  id: string
  field: string
  error: string
}

/**
 * Giải mã CHỈ bằng key chính (tạm gỡ PREVIOUS khỏi env trong lúc gọi).
 * Dùng để phân biệt bản ghi "đã sang key mới" (bỏ qua) với bản ghi "cần xoay".
 */
function decryptPrimaryOnly(ciphertext: string): string {
  const saved = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS
  try {
    return decrypt(ciphertext)
  } finally {
    if (saved !== undefined) process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = saved
  }
}

async function main() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error('[re-encrypt] Thiếu TOKEN_ENCRYPTION_KEY — dừng lại (không đoán key).')
    process.exit(2)
  }

  console.info(
    `[re-encrypt] Bắt đầu (mode: ${DRY_RUN ? 'DRY-RUN — không ghi DB' : 'THẬT — sẽ UPDATE DB'}).`,
  )
  if (!process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS) {
    console.info('[re-encrypt] Không có TOKEN_ENCRYPTION_KEY_PREVIOUS — chỉ xử lý bản ghi dùng key chính.')
  }

  const prisma = new PrismaClient()
  const errors: RowError[] = []
  const totals = { scanned: 0, alreadyNew: 0, rotated: 0, skippedNull: 0 }

  try {
    for (const cfg of TABLES) {
      const delegate = prisma[cfg.model] as {
        findMany: (args: unknown) => Promise<Array<{ id: string } & Record<string, unknown>>>
        update: (args: unknown) => Promise<unknown>
      }
      const select: Record<string, boolean> = { id: true }
      for (const f of cfg.fields) select[f] = true

      const rows = await delegate.findMany({ select })
      let done = 0
      for (const row of rows) {
        for (const field of cfg.fields) {
          totals.scanned += 1
          const cipher = row[field] as string | null | undefined
          if (!cipher) {
            totals.skippedNull += 1
            continue
          }

          // 1. Đã dùng key mới? → bỏ qua.
          try {
            decryptPrimaryOnly(cipher)
            totals.alreadyNew += 1
            continue
          } catch (e) {
            if (!(e instanceof TokenDecryptError)) {
              errors.push({ table: cfg.label, id: row.id, field, error: `primary-decrypt: ${(e as Error).message}` })
              continue
            }
            // TokenDecryptError → có thể là bản ghi key cũ, thử fallback ở bước 2.
          }

          // 2. Giải mã (tự fallback PREVIOUS) rồi mã hóa lại bằng key mới.
          let plaintext: string
          try {
            plaintext = decrypt(cipher)
          } catch (e) {
            errors.push({ table: cfg.label, id: row.id, field, error: `decrypt: ${(e as Error).message}` })
            continue
          }

          const newCipher = encrypt(plaintext)
          if (!DRY_RUN) {
            try {
              await delegate.update({ where: { id: row.id }, data: { [field]: newCipher } })
            } catch (e) {
              errors.push({ table: cfg.label, id: row.id, field, error: `update: ${(e as Error).message}` })
              continue
            }
          }
          totals.rotated += 1
        }

        done += 1
        if (done % PROGRESS_EVERY === 0) {
          console.info(`[re-encrypt] ${cfg.label}: ${done}/${rows.length} bản ghi...`)
        }
      }
      console.info(`[re-encrypt] ${cfg.label}: xong ${rows.length} bản ghi.`)
    }
  } finally {
    await prisma.$disconnect()
  }

  console.info('──────── Báo cáo ────────')
  console.info(`  field đã quét : ${totals.scanned}`)
  console.info(`  đã dùng key mới (bỏ qua): ${totals.alreadyNew}`)
  console.info(`  ${DRY_RUN ? 'CẦN xoay' : 'đã xoay'}: ${totals.rotated}`)
  console.info(`  null/rỗng (bỏ qua): ${totals.skippedNull}`)
  console.info(`  lỗi            : ${errors.length}`)
  for (const e of errors.slice(0, 20)) {
    console.error(`  [LỖI] ${e.table}#${e.id} field=${e.field}: ${e.error}`)
  }
  if (errors.length > 20) console.error(`  ... và ${errors.length - 20} lỗi khác`)

  if (DRY_RUN) {
    console.info('[re-encrypt] DRY-RUN xong — không có gì được ghi vào DB.')
  } else if (errors.length === 0 && totals.rotated > 0) {
    console.info('[re-encrypt] Xong. Hãy verify rồi sang BƯỚC 4 (gỡ PREVIOUS) theo docs/key-rotation.md.')
  }

  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[re-encrypt] Lỗi nghiêm trọng ngoài vòng lặp:', e)
  process.exit(2)
})
