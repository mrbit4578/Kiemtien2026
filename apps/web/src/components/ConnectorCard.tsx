import { api } from '../lib/api'

export type ReviewStatus = 'approved' | 'pending_review' | 'not_supported'

interface Props {
  provider: string
  label: string
  status: ReviewStatus
  description: string
}

const STATUS_LABELS: Record<ReviewStatus, string> = {
  approved: '✅ Sẵn sàng',
  pending_review: '⏳ Cần review',
  not_supported: '🚫 Chưa hỗ trợ',
}

const STATUS_COLORS: Record<ReviewStatus, string> = {
  approved: '#16a34a',
  pending_review: '#d97706',
  not_supported: '#6b7280',
}

export function ConnectorCard({ provider, label, status, description }: Props) {
  const canConnect = status === 'approved'

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <strong>{label}</strong>
        <span
          style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: STATUS_COLORS[status] }}
        >
          {STATUS_LABELS[status]}
        </span>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: '#6b7280' }}>
          {description}
        </p>
      </div>
      {canConnect ? (
        <a href={api.oauthStartUrl(provider)}>
          <button style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Kết nối</button>
        </a>
      ) : (
        <button disabled style={{ padding: '0.5rem 1rem', opacity: 0.5 }}>
          {status === 'not_supported' ? 'Không hỗ trợ' : 'Chưa sẵn sàng'}
        </button>
      )}
    </div>
  )
}
