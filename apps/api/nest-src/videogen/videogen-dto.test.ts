import 'reflect-metadata'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validate } from 'class-validator'
import { ImageDto } from './dto'

process.env.TOKEN_ENCRYPTION_KEY = 'test-only-key-32-chars-xxxxxxxxx'

describe('ImageDto provider validation', () => {
  it("chấp nhận provider='pollinations' (từng bị 400 vì list cứng thiếu)", async () => {
    const dto = new ImageDto()
    dto.prompt = 'a cat'
    dto.provider = 'pollinations'
    const errors = await validate(dto)
    assert.equal(errors.length, 0, JSON.stringify(errors.map((e) => e.constraints)))
  })

  it('vẫn từ chối provider lạ', async () => {
    const dto = new ImageDto()
    dto.prompt = 'a cat'
    dto.provider = 'unknown-xyz'
    const errors = await validate(dto)
    assert.ok(errors.length > 0)
  })
})
