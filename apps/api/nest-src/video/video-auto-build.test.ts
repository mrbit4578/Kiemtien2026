import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VideoService } from './video.service'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

const GOOD_JSON = JSON.stringify({
  topic: 'Người dùng băn khoăn có nên mua máy lọc không khí',
  source_analysis: 'Hook: câu hỏi sức khỏe; claim chính: giảm bụi mịn; format: review ngắn; khán giả comment hỏi giá nhiều.',
  angles: [
    'Góc 1: checklist 3 điều kiện phòng thật sự cần máy lọc',
    'Góc 2: so sánh chi phí máy lọc vs vệ sinh điều hòa định kỳ',
    'Góc 3: 5 dấu hiệu phòng bạn đang ô nhiễm mà không biết',
  ],
  chosen_angle: 'Góc 1: checklist 3 điều kiện phòng thật sự cần máy lọc',
  originality: { o1: true, o2: true, o3: true, o4: true, o5: true },
  hook: 'Phòng bạn có thật sự cần máy lọc không khí? Kiểm chứng 3 điều này trước khi mua.',
  body: 'Cảnh 1 (0-3s): text "Đừng mua máy lọc vội" + voice-over hook. Cảnh 2 (3-20s): 3 điều kiện...',
  caption: 'Đừng mua máy lọc không khí vội!\nKiểm chứng 3 điều này trước nhé.\n\nLink tham khảo trong bio.\n#maylockhongkhi #suckhoe #kiemchung #mmo',
  claims: [
    { text: 'Bụi mịn PM2.5 có thể xâm nhập sâu vào phổi', claim_type: 'fact', risk_level: 'medium', confidence: 'probable' },
  ],
  disclosure: { affiliate: true, sponsored: false, ai_voice: false, ai_visual: false, music_source: '' },
  risk: { c: 0, p: 0, l: 1, a: 1, m: 1, h: 0 },
  ai_voice_used: false,
})

function makeService(prisma: any, aiChat: (content: string) => Promise<{ content: string }>) {
  const ai = { chat: async (_ws: string, dto: any) => aiChat(dto.messages[1].content) } as any
  return new VideoService(prisma, { log: async () => ({}) } as any, ai)
}

function basePrisma() {
  const store: any = { claims: [], aiEntries: [] }
  return {
    store,
    aiConnection: {
      findMany: async () => [{ id: 'c1', provider: 'apmix', status: 'active' }],
    },
    videoProject: {
      create: async (args: any) => ({ id: 'p1', workspaceId: 'ws1', title: args.data.title, stage: 'intake' }),
      findFirst: async () => ({ id: 'p1', workspaceId: 'ws1' }),
      update: async (args: any) => ({ id: 'p1', ...args.data }),
    },
    videoClaim: {
      create: async (args: any) => { store.claims.push(args.data); return { id: `cl${store.claims.length}` } },
    },
    videoAiEntry: {
      create: async (args: any) => { store.aiEntries.push(args.data); return { id: 'e1' } },
    },
  }
}

describe('video auto-build', () => {
  it('nội dung hợp lệ → project đầy đủ: brief, script, claim ledger, AI register, risk score', async () => {
    const prisma = basePrisma()
    const svc = makeService(prisma, async () => ({ content: GOOD_JSON }))
    const res = await svc.autoBuildFromSource('ws1', {
      content: 'Xem video này nhé https://tiktok.com/@x/video/123 — review máy lọc không khí',
    } as any)
    assert.equal(res.projectId, 'p1')
    assert.equal(res.claimCount, 1)
    assert.equal(res.riskScore, 3)
    assert.equal(prisma.store.claims.length, 1)
    assert.equal(prisma.store.aiEntries.length, 1)
    assert.equal(prisma.store.aiEntries[0].category, 'A1')
    assert.ok(res.title.length > 0)
  })

  it('G0 FAIL → từ chối, không tạo project', async () => {
    const prisma = basePrisma()
    let created = 0
    prisma.videoProject.create = async () => { created++; return { id: 'p1' } }
    const bad = JSON.parse(GOOD_JSON)
    bad.originality.o2 = false
    const svc = makeService(prisma, async () => ({ content: JSON.stringify(bad) }))
    await assert.rejects(() => svc.autoBuildFromSource('ws1', { content: 'nguồn test' } as any), /G0 FAIL/)
    assert.equal(created, 0)
  })

  it('claim high/critical unverified → tool từ chối', async () => {
    const prisma = basePrisma()
    const bad = JSON.parse(GOOD_JSON)
    bad.claims = [{ text: 'Uống nước này chữa khỏi ung thư', claim_type: 'fact', risk_level: 'critical', confidence: 'unverified' }]
    const svc = makeService(prisma, async () => ({ content: JSON.stringify(bad) }))
    await assert.rejects(() => svc.autoBuildFromSource('ws1', { content: 'nguồn test' } as any), /TỪ CHỐI/)
  })

  it('chưa kết nối AI Pro → báo rõ', async () => {
    const prisma = basePrisma()
    prisma.aiConnection.findMany = async () => []
    const svc = makeService(prisma, async () => ({ content: GOOD_JSON }))
    await assert.rejects(() => svc.autoBuildFromSource('ws1', { content: 'nguồn test' } as any), /Chưa kết nối AI Pro/)
  })

  it('AI không trả JSON → báo thử lại', async () => {
    const prisma = basePrisma()
    const svc = makeService(prisma, async () => ({ content: 'xin chào, tôi không trả JSON' }))
    await assert.rejects(() => svc.autoBuildFromSource('ws1', { content: 'nguồn test' } as any), /JSON hợp lệ/)
  })
})
