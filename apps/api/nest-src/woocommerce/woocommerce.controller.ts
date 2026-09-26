import { Body, Controller, Delete, Get, Param, Post, Query, Session } from '@nestjs/common'
import { WooCommerceService, type ConnectWooStoreDto } from './woocommerce.service'
import { requireWorkspaceId } from '../common/session'

@Controller('woocommerce')
export class WooCommerceController {
  constructor(private readonly woo: WooCommerceService) {}

  /** POST /woocommerce/connect — kết nối cửa hàng (key/secret chỉ đi 1 chiều vào, không bao giờ trả ra) */
  @Post('connect')
  connect(@Session() session: any, @Body() dto: ConnectWooStoreDto) {
    const workspaceId = requireWorkspaceId(session)
    return this.woo.connect(workspaceId, dto)
  }

  /** GET /woocommerce — danh sách cửa hàng (không kèm key) */
  @Get()
  list(@Session() session: any) {
    return this.woo.list(requireWorkspaceId(session))
  }

  /** POST /woocommerce/:id/test — kiểm tra lại kết nối */
  @Post(':id/test')
  test(@Session() session: any, @Param('id') id: string) {
    return this.woo.test(requireWorkspaceId(session), id)
  }

  /** GET /woocommerce/:id/products — duyệt/tìm sản phẩm */
  @Get(':id/products')
  products(
    @Session() session: any,
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('category') category?: string,
    @Query('orderby') orderby?: 'date' | 'popularity' | 'rating' | 'price' | 'title',
    @Query('order') order?: 'asc' | 'desc',
    @Query('onSale') onSale?: string,
  ) {
    return this.woo.products(requireWorkspaceId(session), id, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
      category,
      orderby,
      order,
      onSale: onSale === 'true' ? true : onSale === 'false' ? false : undefined,
    })
  }

  /** GET /woocommerce/:id/products/:productId — chi tiết 1 sản phẩm */
  @Get(':id/products/:productId')
  product(@Session() session: any, @Param('id') id: string, @Param('productId') productId: string) {
    return this.woo.product(requireWorkspaceId(session), id, parseInt(productId, 10))
  }

  /** DELETE /woocommerce/:id — ngắt kết nối (xóa key mã hóa) */
  @Delete(':id')
  remove(@Session() session: any, @Param('id') id: string) {
    return this.woo.remove(requireWorkspaceId(session), id)
  }
}
