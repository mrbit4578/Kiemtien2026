import Link from 'next/link'

export const metadata = {
  title: 'Chính sách bảo mật | Kiemtien2026',
  description: 'Chính sách bảo mật của nền tảng Kiemtien2026.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-dark-950 text-slate-200">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-extrabold text-white">Chính sách bảo mật</h1>
        <p className="mt-2 text-sm text-slate-400">Cập nhật lần cuối: 23/09/2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white">1. Dữ liệu chúng tôi thu thập</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Thông tin tài khoản cơ bản (tên, email) khi bạn đăng ký/đăng nhập.</li>
              <li>
                Token OAuth của các tài khoản mạng xã hội bạn kết nối (TikTok, Instagram,
                Facebook...), được lưu trữ <strong className="text-white">mã hóa</strong>.
              </li>
              <li>Nội dung, lịch đăng bài và nhật ký hoạt động bạn tạo trong nền tảng.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">2. Mục đích sử dụng</h2>
            <p className="mt-2">
              Dữ liệu chỉ được dùng để vận hành dịch vụ: hiển thị nội dung của bạn, thực hiện
              đăng bài theo lịch bạn đã phê duyệt, và duy trì kết nối OAuth. Chúng tôi{' '}
              <strong className="text-white">không bán</strong> dữ liệu của bạn cho bên thứ ba và
              không dùng dữ liệu cho quảng cáo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">3. Quyền của bạn</h2>
            <p className="mt-2">
              Bạn có thể ngắt kết nối bất kỳ tài khoản mạng xã hội nào bất cứ lúc nào; token tương
              ứng sẽ bị thu hồi và xóa khỏi hệ thống. Bạn cũng có thể yêu cầu xóa toàn bộ dữ liệu
              tài khoản của mình.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">4. Bảo mật</h2>
            <p className="mt-2">
              Token và khóa API được mã hóa khi lưu trữ. Chúng tôi không bao giờ yêu cầu bạn gửi
              mật khẩu hay khóa API qua chat, email hay bất kỳ kênh không an toàn nào.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">5. Liên hệ</h2>
            <p className="mt-2">
              Mọi thắc mắc về bảo mật dữ liệu, vui lòng liên hệ qua trang{' '}
              <Link href="/" className="text-brand-cyan underline">
                chủ Kiemtien2026
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
