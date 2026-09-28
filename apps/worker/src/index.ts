import { Worker, Queue } from 'bullmq'
import { createRedisConnection } from './redis'
import { publishHandler } from './jobs/publish'
import { refreshTokenHandler } from './jobs/refresh-token'

console.log('[worker] Starting...'
)

// Publish queue
new Worker('publish', publishHandler, {
  connection: createRedisConnection(),
  concurrency: 5,
})

// Refresh token queue
new Worker('refresh-token', refreshTokenHandler, {
  connection: createRedisConnection(),
  concurrency: 10,
})

console.log('[worker] Ready.'
)
