import { BadRequestException } from '@nestjs/common'
import type { SocialConnector } from '@orh/connectors'
import {
  GoogleConnector,
  MetaConnector,
  InstagramConnector,
  TikTokConnector,
  GitHubConnector,
} from '@orh/connectors'

const REGISTRY: Record<string, SocialConnector> = {
  google: new GoogleConnector(),
  facebook: new MetaConnector(),
  instagram: new InstagramConnector(),
  tiktok: new TikTokConnector(),
  github: new GitHubConnector(),
}

export function getConnector(provider: string): SocialConnector {
  const connector = REGISTRY[provider]
  if (!connector) throw new BadRequestException(`Provider không hỗ trợ: ${provider}`)
  return connector
}

export function supportedProviders(): string[] {
  return Object.keys(REGISTRY)
}
