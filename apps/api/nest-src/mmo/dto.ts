import {
  IsString, IsInt, IsNumber, IsBoolean, IsOptional, Min, Max,
  MinLength, MaxLength,
} from 'class-validator'
import { isMonetizationModel } from './mmo-economics'
import { registerDecorator, ValidationOptions } from 'class-validator'

function IsMonetizationModel(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMonetizationModel',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isMonetizationModel(value),
        defaultMessage: () => 'model không hợp lệ (6 cơ chế thu nhập của playbook).',
      },
    })
  }
}

/** Đề nghị mua gắn với ngách/dự án — chọn cơ chế thu nhập TRƯỚC khi sản xuất. */
export class CreateOfferDto {
  @IsString()
  @IsOptional()
  projectId?: string

  @IsString()
  @IsOptional()
  nicheSlug?: string

  @IsString()
  @IsMonetizationModel()
  model!: string

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string

  @IsInt()
  @Min(0)
  @IsOptional()
  commissionAmount?: number

  @IsString()
  @IsOptional()
  commissionCurrency?: string

  @IsString()
  @IsOptional()
  payoutTerms?: string

  @IsBoolean()
  @IsOptional()
  verified?: boolean

  @IsString()
  @IsOptional()
  note?: string
}

export class UpdateOfferDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  title?: string

  @IsInt()
  @Min(0)
  @IsOptional()
  commissionAmount?: number

  @IsString()
  @IsOptional()
  payoutTerms?: string

  @IsBoolean()
  @IsOptional()
  verified?: boolean

  @IsString()
  @IsOptional()
  status?: string

  @IsString()
  @IsOptional()
  note?: string
}

/** Số liệu hiệu quả 1 video — tiền lấy từ sổ quyết toán, không suy từ view. */
export class UpsertEconomicsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  costCash?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  hoursWorked?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  views?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  watchTimeSec?: number

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  completionRate?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  saves?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  shares?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  clicks?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  orders?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  eligibleOrders?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  commissionReceived?: number

  @IsBoolean()
  @IsOptional()
  organic?: boolean

  @IsString()
  @IsOptional()
  postedAt?: string

  @IsString()
  @IsOptional()
  utm?: string

  @IsString()
  @IsOptional()
  note?: string
}

/** Mô phỏng affiliate với số GIẢ ĐỊNH — chỉ để thấy điểm hòa vốn. */
export class SimulateAffiliateDto {
  @IsInt()
  @Min(0)
  views!: number

  @IsNumber()
  @Min(0)
  @Max(1)
  clickThroughRate!: number

  @IsNumber()
  @Min(0)
  @Max(1)
  orderRateAfterClick!: number

  @IsNumber()
  @Min(0)
  @Max(1)
  eligibleRate!: number

  @IsInt()
  @Min(0)
  commissionPerOrder!: number

  @IsInt()
  @Min(0)
  @IsOptional()
  costCash?: number
}
