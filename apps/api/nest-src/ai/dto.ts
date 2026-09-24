import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import type { AiProviderId } from './ai.providers'

export const AI_PROVIDER_IDS = ['gemini', 'openai', 'xai', 'anthropic', 'deepseek', 'experientiallabs'] as const

/** POST /ai/connections — KHÔNG bao giờ log apiKey. */
export class ConnectAiDto {
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider!: AiProviderId

  @IsString()
  @MinLength(8, { message: 'API key quá ngắn.' })
  @MaxLength(500, { message: 'API key quá dài.' })
  apiKey!: string
}

export class ChatMessageDto {
  @IsIn(['user', 'assistant', 'system'], { message: 'role phải là user | assistant | system.' })
  role!: 'user' | 'assistant' | 'system'

  @IsString()
  @MinLength(1, { message: 'Nội dung tin nhắn không được rỗng.' })
  @MaxLength(20000, { message: 'Tin nhắn quá dài (tối đa 20.000 ký tự).' })
  content!: string
}

/** POST /ai/chat — chat với model của provider đã kết nối. */
export class ChatDto {
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider!: AiProviderId

  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 tin nhắn.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 tin nhắn mỗi request.' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[]

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4096)
  maxTokens?: number
}

export const CHAT_MODES = ['chat', 'agent', 'rag'] as const
export const DEFAULT_SESSION_TITLE = 'Đoạn chat mới'

/** POST /ai/chat/sessions — tạo phiên chat mới. */
export class CreateChatSessionDto {
  @IsString()
  @IsIn(AI_PROVIDER_IDS as unknown as string[], { message: 'Provider không được hỗ trợ.' })
  provider!: AiProviderId

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  @IsOptional()
  @IsIn(CHAT_MODES as unknown as string[], { message: 'mode phải là chat | agent | rag.' })
  mode?: (typeof CHAT_MODES)[number]

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string
}

/** Tin nhắn lưu vào nhật ký — meta là metadata hiển thị, KHÔNG bao giờ chứa API key. */
export class ChatHistoryMessageDto {
  @IsIn(['user', 'assistant', 'system'], { message: 'role phải là user | assistant | system.' })
  role!: 'user' | 'assistant' | 'system'

  @IsString()
  @MinLength(1, { message: 'Nội dung tin nhắn không được rỗng.' })
  @MaxLength(20000, { message: 'Tin nhắn quá dài (tối đa 20.000 ký tự).' })
  content!: string

  @IsOptional()
  meta?: Record<string, unknown>
}

/** POST /ai/chat/sessions/:id/messages — lưu thêm tin nhắn vào phiên. */
export class AppendChatMessagesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 tin nhắn.' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 tin nhắn mỗi lần lưu.' })
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  messages!: ChatHistoryMessageDto[]
}

/** PATCH /ai/chat/sessions/:id — đổi tiêu đề phiên chat. */
export class RenameChatSessionDto {
  @IsString()
  @MinLength(1, { message: 'Tiêu đề không được rỗng.' })
  @MaxLength(120, { message: 'Tiêu đề tối đa 120 ký tự.' })
  title!: string
}
