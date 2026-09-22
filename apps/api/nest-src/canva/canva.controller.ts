import { Controller, Get, Post, Param, Body, Session, HttpCode } from '@nestjs/common'
import { CanvaService } from './canva.service'
import { requireWorkspaceId } from '../common/session'

@Controller('canva')
export class CanvaController {
  constructor(private readonly canva: CanvaService) {}

  /** GET /canva/templates — liệt kê brand template trên Canva */
  @Get('templates')
  async templates(@Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return { templates: await this.canva.listTemplates(workspaceId) }
  }

  /** GET /canva/templates/:id/dataset — các trường điền được của mẫu */
  @Get('templates/:id/dataset')
  async dataset(@Param('id') id: string, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return { fields: await this.canva.getDataset(workspaceId, id) }
  }

  /**
   * POST /canva/autofill — chạy autofill + export, trả về URL file để xem trước.
   * Body: { brandTemplateId, data: { field: value }, format?: 'png'|'jpg'|'mp4'|'gif' }
   */
  @Post('autofill')
  @HttpCode(200)
  async autofill(@Body() body: { brandTemplateId: string; data: Record<string, string>; format?: 'png' | 'jpg' | 'mp4' | 'gif' }, @Session() session: any) {
    const workspaceId = requireWorkspaceId(session)
    return this.canva.runAutofill(workspaceId, body.brandTemplateId, body.data ?? {}, body.format ?? 'png')
  }

  /**
   * POST /canva/autofill-to-content — pipeline đầy đủ: autofill → export →
   * upload imgbb → tạo ContentItem draft chờ duyệt (Quy trình Duyệt An Toàn).
   * Body: { brandTemplateId, data: { field: value }, caption, format? }
   */
  @Post('autofill-to-content')
  @HttpCode(200)
  async autofillToContent(
    @Body() body: { brandTemplateId: string; data: Record<string, string>; caption: string; format?: 'png' | 'jpg' | 'mp4' | 'gif' },
    @Session() session: any,
  ) {
    const workspaceId = requireWorkspaceId(session)
    return this.canva.autofillToContent(workspaceId, body.brandTemplateId, body.data ?? {}, body.caption ?? '', body.format ?? 'png')
  }
}
