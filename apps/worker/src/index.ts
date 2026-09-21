import { Worker, Queue } from 'bullmq'
import { REDIS_CONNECTION } from './redis'
import { publishHandler } from './jobs/publish'
import { refreshTokenHandler } from './jobs/refresh-token'

console.log('[worker] Starting...'
)

// Publish queue
new Worker('publish', publishHandler, {
  connection: REDIS_CONNECTION,
  concurrency: 5,
})

// Refresh token queue
new Worker('refresh-token', refreshTokenHandler, {
  connection: REDIS_CONNECTION,
  concurrency: 10,
})

console.log('[worker] Ready.'
)
