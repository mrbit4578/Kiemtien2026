import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Session,
  Req,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Throttle } from '@nestjs/throttler'
import { RagService } from './rag.service'
import { IngestJsonDto, QueryDto } from './dto'
import { requireWorkspaceId } from '../common/session'
import type { Request } from 'express'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = /\.(txt|md|markdown|pdf|png|jpe?g|csv)$/i

/**
 * RAG — Kho tri thức + 5 kiến trúc truy hồi.
 *
 * GET    /rag/strategies            → metadata 5 kiến trúc (public)
 * GET    /rag/documents             → danh sách tài liệu
 * POST   /rag/documents             → nạp tài liệu (multipart `file` | JSON {text,title} | JSON {url,title?})
 * DELETE /rag/documents/:id         → xóa tài liệu (+ chunks/entities cascade)
 * POST   /rag/query                 → hỏi AI: {query, strategy, provider?, model?, topK?}
 */
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Get('strategies')
  getStrategies() {
    return this.ragService.getStrategies()
  }

  @Get('documents')
  async list(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.ragService.listDocuments(workspaceId)
  }

  @Post('documents')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // ingest tốn embedding + LLM — siết riêng
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_EXT.test(file.originalname)) {
          cb(null, true)
        } else {
          cb(
            new BadRequestException(
              'Định dạng file không hỗ trợ. Chỉ nhận: .txt, .md, .pdf, .png, .jpg, .csv (tối đa 10MB).',
            ),
            false,
          )
        }
      },
    }),
  )
  @HttpCode(200)
  async ingest(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: IngestJsonDto,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.ragService.ingest(workspaceId, file, body, req.ip)
  }

  @Delete('documents/:id')
  async remove(
    @Param('id') id: string,
    @Session() session: any,
    @Req() req: Request,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.ragService.deleteDocument(workspaceId, id, req.ip)
  }

  @Post('query')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // query gọi nhiều LLM — giới hạn 20 req/phút
  @HttpCode(200)
  async query(@Body() dto: QueryDto, @Session() session: any, @Req() req: Request) {
    const workspaceId = requireWorkspaceId(session)
    return this.ragService.query(workspaceId, dto, req.ip)
  }
}
