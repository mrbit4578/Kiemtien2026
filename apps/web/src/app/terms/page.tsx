import Link from 'next/link'

export const metadata = {
  title: 'Điều khoản sử dụng | Kiemtien2026',
  description: 'Điều khoản sử dụng nền tảng Kiemtien2026.',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-dark-950 text-slate-200">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-extrabold text-white">Điều khoản sử dụng</h1>
        <p className="mt-2 text-sm text-slate-400">Cập nhật lần cuối: 23/09/2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white">1. Giới thiệu dịch vụ</h2>
            <p className="mt-2">
              Kiemtien2026 là nền tảng hỗ trợ cá nhân sáng tạo nội dung, quản lý lịch đăng bài và
              kết nối các tài khoản mạng xã hội (TikTok, Instagram, Facebook...) thông qua OAuth
              chính thức của từng nền tảng.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">2. Tài khoản và kết nối</h2>
            <p className="mt-2">
              Bạn đăng nhập bằng tài khoản của chính mình và tự nguyện kết nối các tài khoản mạng
              xã hội. Bạn có thể thu hồi quyền truy cập bất cứ lúc nào từ trang Cài đặt của
              Kiemtien2026 hoặc từ chính nền tảng mạng xã hội đó.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">3. Nội dung của bạn</h2>
            <p className="mt-2">
              Bạn hoàn toàn chịu trách nhiệm về nội dung mình tạo, lên lịch và đăng tải qua
              Kiemtien2026, bao gồm việc tuân thủ điều khoản và chính sách cộng đồng của từng
              nền tảng. Chúng tôi không đăng nội dung khi chưa có sự phê duyệt của bạn.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">4. Thu nhập và tiếp thị liên kết</h2>
            <p className="mt-2">
              Kiemtien2026 là công cụ hỗ trợ, không phải chương trình đầu tư hay cam kết thu nhập.
              Mọi con số hoa hồng, ví dụ doanh thu trong nền tảng chỉ mang tính minh họa; kết quả
              thực tế phụ thuộc vào nỗ lực và điều kiện của từng chương trình tiếp thị liên kết.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">5. Giới hạn trách nhiệm</h2>
            <p className="mt-2">
              Dịch vụ được cung cấp &ldquo;nguyên trạng&rdquo;. Chúng tôi không chịu trách nhiệm về
              gián đoạn do bên thứ ba (API của mạng xã hội, nhà cung cấp hạ tầng) gây ra.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white">6. Liên hệ</h2>
            <p className="mt-2">
              Mọi thắc mắc về điều khoản, vui lòng liên hệ qua trang{' '}
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
