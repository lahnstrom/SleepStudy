type Status = 'complete' | 'in-progress' | 'new' | 'not-started'

const labels: Record<Status, string> = {
  'complete': 'Complete',
  'in-progress': 'In Progress',
  'new': 'New',
  'not-started': 'Not Started',
}

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>
}
