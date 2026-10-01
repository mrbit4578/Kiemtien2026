import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMBEDDING_DIMS,
  assertValidEmbeddingVector,
  buildEmbeddingSpace,
  isSameEmbeddingSpace,
  makeProvenance,
  parseEmbeddingSpace,
} from './embedding-provenance'

describe('embedding-provenance', () => {
  it('tạo namespace ổn định embedding-v1:<provider>:<model>:1536', () => {
    assert.equal(
      buildEmbeddingSpace('openai', 'text-embedding-3-small'),
      'embedding-v1:openai:text-embedding-3-small:1536',
    )
    assert.equal(
      buildEmbeddingSpace('gemini', 'gemini-embedding-001'),
      'embedding-v1:gemini:gemini-embedding-001:1536',
    )
  })

  it('model khác nhau → namespace khác nhau (không trộn vector)', () => {
    const a = buildEmbeddingSpace('openai', 'text-embedding-3-small')
    const b = buildEmbeddingSpace('gemini', 'gemini-embedding-001')
    assert.notEqual(a, b)
    assert.equal(isSameEmbeddingSpace(a, b), false)
    assert.equal(isSameEmbeddingSpace(a, a), true)
  })

  it('legacy null không tương thích với bất kỳ namespace nào', () => {
    const a = buildEmbeddingSpace('openai', 'text-embedding-3-small')
    assert.equal(isSameEmbeddingSpace(a, null), false)
    assert.equal(isSameEmbeddingSpace(null, a), false)
    assert.equal(isSameEmbeddingSpace(null, null), false)
    assert.equal(isSameEmbeddingSpace(a, undefined), false)
    assert.equal(isSameEmbeddingSpace(a, ''), false)
  })

  it('parse round-trip giữ nguyên provider/model/dims', () => {
    const space = buildEmbeddingSpace('openai', 'text-embedding-3-small')
    assert.deepEqual(parseEmbeddingSpace(space), {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dims: 1536,
      space,
    })
  })

  it('parse trả null khi sai format — không đoán mò', () => {
    assert.equal(parseEmbeddingSpace('bogus'), null)
    assert.equal(parseEmbeddingSpace('embedding-v1:openai::1536'), null)
    assert.equal(parseEmbeddingSpace('embedding-v2:openai:text-embedding-3-small:1536'), null)
    assert.equal(parseEmbeddingSpace('embedding-v1:openai:text-embedding-3-small:abc'), null)
    assert.equal(parseEmbeddingSpace('embedding-v1:openai:text-embedding-3-small:1536:extra'), null)
  })

  it('từ chối provider/model chứa dấu ":" (fail-closed)', () => {
    assert.throws(() => buildEmbeddingSpace('open:ai', 'm'))
    assert.throws(() => buildEmbeddingSpace('openai', 'a:b'))
    assert.throws(() => buildEmbeddingSpace('', 'm'))
    assert.throws(() => buildEmbeddingSpace('openai', '  '))
  })

  it('chuẩn hoá provider về lowercase để namespace ổn định', () => {
    assert.equal(
      buildEmbeddingSpace('OpenAI', 'text-embedding-3-small'),
      buildEmbeddingSpace('openai', 'text-embedding-3-small'),
    )
  })

  it('makeProvenance trả đủ 4 trường', () => {
    const p = makeProvenance('gemini', 'gemini-embedding-001')
    assert.equal(p.provider, 'gemini')
    assert.equal(p.model, 'gemini-embedding-001')
    assert.equal(p.dims, EMBEDDING_DIMS)
    assert.equal(p.space, 'embedding-v1:gemini:gemini-embedding-001:1536')
  })

  it('assertValidEmbeddingVector: 1536 số finite thì pass', () => {
    assert.doesNotThrow(() =>
      assertValidEmbeddingVector(new Array(EMBEDDING_DIMS).fill(0.1)),
    )
  })

  it('assertValidEmbeddingVector: sai chiều / NaN / Infinity thì throw', () => {
    assert.throws(() => assertValidEmbeddingVector(new Array(100).fill(0)))
    assert.throws(() => assertValidEmbeddingVector('not-an-array'))
    const withNaN = new Array(EMBEDDING_DIMS).fill(0)
    withNaN[10] = NaN
    assert.throws(() => assertValidEmbeddingVector(withNaN))
    const withInf = new Array(EMBEDDING_DIMS).fill(0)
    withInf[11] = Infinity
    assert.throws(() => assertValidEmbeddingVector(withInf))
  })
})
