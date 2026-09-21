import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/** POST /auth/register — KHÔNG bao giờ log password. */
export class RegisterDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự.' })
  @MaxLength(128)
  password!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string
}

/** POST /auth/login — message lỗi chung để không lộ user có tồn tại hay không. */
export class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu.' })
  @MaxLength(128)
  password!: string
}
