import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <p><Link to="/dashboard">Go to dashboard</Link></p>
    </div>
  )
}
