import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ServiceUnavailableException, BadRequestException } from '@nestjs/common'
import { buildTimelineCommands, RenderService } from './render.service'

describe('buildTimelineCommands', () => {
  it('clip xếp nối tiếp theo cursor, total = tổng độ dài', () => {
    const { commands, totalDuration } = buildTimelineCommands({
      mediaIds: ['m1', 'm2', 'm3'],
      durations: [10, 20, 5],
      starts: [undefined, undefined, undefined],
      captions: [],
    })
    assert.equal(commands.length, 3)
    assert.deepEqual(commands[0], { op: 'addClipAtFirstFree', mediaId: 'm1', start: 0 })
    assert.deepEqual(commands[1], { op: 'addClipAtFirstFree', mediaId: 'm2', start: 10 })
    assert.deepEqual(commands[2], { op: 'addClipAtFirstFree', mediaId: 'm3', start: 30 })
    assert.equal(totalDuration, 35)
  })

  it('start chỉ định được tôn trọng, cursor tiếp tục sau đó', () => {
    const { commands, totalDuration } = buildTimelineCommands({
      mediaIds: ['m1', 'm2'],
      durations: [10, 10],
      starts: [100, undefined],
      captions: [],
    })
    assert.equal((commands[0] as { start: number }).start, 100)
    assert.equal((commands[1] as { start: number }).start, 110)
    assert.equal(totalDuration, 120)
  })

  it('start âm bị kẹp về 0', () => {
    const { commands } = buildTimelineCommands({
      mediaIds: ['m1'],
      durations: [5],
      starts: [-3],
      captions: [],
    })
    assert.equal((commands[0] as { start: number }).start, 0)
  })

  it('caption → addTextClip above:true, style.content, bỏ caption rỗng', () => {
    const { commands } = buildTimelineCommands({
      mediaIds: ['m1'],
      durations: [10],
      starts: [undefined],
      captions: [
        { text: 'Hook mở đầu', start: 0, duration: 3 },
        { text: '   ', start: 3, duration: 3 },
        { text: 'CTA cuối', start: 7, duration: 3 },
      ],
    })
    const caps = commands.filter((c) => c['op'] === 'addTextClip')
    assert.equal(caps.length, 2)
    assert.equal(caps[0]!['above'], true)
    assert.equal(caps[0]!['trackId'], null)
    assert.deepEqual(caps[0]!['style'], { content: 'Hook mở đầu' })
    assert.equal(caps[0]!['offsetY'], 0.36)
    assert.equal(caps[1]!['start'], 7)
  })

  it('effectId → addLayerClip phủ toàn bộ totalDuration', () => {
    const { commands, totalDuration } = buildTimelineCommands({
      mediaIds: ['m1', 'm2'],
      durations: [10, 10],
      starts: [undefined, undefined],
      captions: [],
      effectId: 'concat.warm',
    })
    const layer = commands.find((c) => c['op'] === 'addLayerClip') as Record<string, unknown>
    assert.ok(layer)
    assert.equal(layer['effectId'], 'concat.warm')
    assert.equal(layer['start'], 0)
    assert.equal(layer['duration'], totalDuration)
  })

  it('không effectId → không có layer', () => {
    const { commands } = buildTimelineCommands({
      mediaIds: ['m1'],
      durations: [5],
      starts: [undefined],
      captions: [],
    })
    assert.ok(!commands.some((c) => c['op'] === 'addLayerClip'))
  })
})

function stubService(enabled: boolean, prisma: unknown): RenderService {
  const concatStub = {
    enabled,
    workDir: '/tmp/kt-concat-test',
    assetsDir: '',
    call: async () => {
      throw new Error('không gọi engine trong test validate')
    },
    waitForEvent: async () => {
      throw new Error('không gọi engine trong test validate')
    },
    onEvent: () => () => undefined,
  }
  return new RenderService(concatStub as never, prisma as never)
}

describe('RenderService.createJob validate', () => {
  it('renderer tắt → ServiceUnavailableException', async () => {
    const svc = stubService(false, {})
    await assert.rejects(
      () => svc.createJob('ws1', { name: 'x', clips: [{ source: 'https://example.com/a.mp4' }] }),
      ServiceUnavailableException,
    )
  })

  it('thiếu clips → BadRequestException', async () => {
    const svc = stubService(true, {})
    await assert.rejects(() => svc.createJob('ws1', { name: 'x', clips: [] }), BadRequestException)
  })

  it('quá 20 clip → BadRequestException', async () => {
    const svc = stubService(true, {})
    const clips = Array.from({ length: 21 }, (_, i) => ({ source: `https://example.com/${i}.mp4` }))
    await assert.rejects(() => svc.createJob('ws1', { name: 'x', clips }), BadRequestException)
  })

  it('caption không duration → BadRequestException', async () => {
    const svc = stubService(true, {})
    await assert.rejects(
      () =>
        svc.createJob('ws1', {
          name: 'x',
          clips: [{ source: 'https://example.com/a.mp4' }],
          captions: [{ text: 'hi', start: 0, duration: 0 }],
        }),
      BadRequestException,
    )
  })

  it('spec hợp lệ → tạo row queued và trả job view', async () => {
    const now = new Date()
    const row = {
      id: 'job1',
      workspaceId: 'ws1',
      name: 'video test',
      status: 'queued',
      progress: 0,
      concatJob: null,
      outputPath: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    const prismaStub = {
      renderJob: {
        create: async (args: { data: Record<string, unknown> }) => {
          assert.equal(args.data['workspaceId'], 'ws1')
          assert.equal(args.data['status'], 'queued')
          assert.ok(typeof args.data['specJson'] === 'string')
          return row
        },
        findUnique: async () => null, // runJob nền thấy null → bỏ qua
        update: async () => row,
      },
    }
    const svc = stubService(true, prismaStub)
    const job = await svc.createJob('ws1', {
      name: 'video test',
      clips: [{ source: 'https://example.com/a.mp4' }],
      captions: [{ text: 'Xin chào', start: 0, duration: 2 }],
    })
    assert.equal(job.id, 'job1')
    assert.equal(job.status, 'queued')
    assert.equal(job.hasFile, false)
    // đợi tick cho runJob nền (findUnique → null → return)
    await new Promise((r) => setTimeout(r, 50))
  })
})
