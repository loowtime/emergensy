import { useState, type FormEvent } from 'react'
import { LockKeyhole, Shield } from 'lucide-react'
import './LoginPage.css'

type Props = {
  error: string
  onLogin: (username: string, password: string) => Promise<void>
}

export function LoginPage({ error, onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    setIsSubmitting(true)
    try {
      await onLogin(username, password)
    } finally {
      setIsSubmitting(false)
      setPassword('')
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="RiskPilot Hamburg">
        <a className="login-brand" href="#login" aria-label="RiskPilot">
          <span className="login-brand-mark"><Shield size={22} /><span>R</span></span>
          <span>RISKPILOT <small>HAMBURG</small></span>
        </a>
        <div className="login-story-copy">
          <span className="login-kicker">FORSCHUNGSPROTOTYP · 01</span>
          <h1>Lage- und<br />Ereignismanagement</h1>
          <p>Lokaler Prototyp zur strukturierten Erfassung und Auswertung von Ereignislagen in Hamburg.</p>
        </div>
        <div className="login-story-footer"><span>HAMBURG · 53.55° N, 9.99° E</span><span>LOKALE DEMONSTRATION</span></div>
      </section>
      <section className="login-side" id="login">
        <div className="login-panel card">
          <div className="card-body">
            <span className="login-panel-index">PROJEKTZUGANG <span>ADMIN</span></span>
            <div className="login-panel-icon"><LockKeyhole size={21} /></div>
            <h2>Anmeldung</h2>
            <p className="login-intro">Melde dich an, um Ereignisse und Stabsprotokolle aufzurufen.</p>
            <form className="login-form" onSubmit={(submitEvent) => void handleSubmit(submitEvent)}>
              <label className="form-label">Benutzername<input className="form-control" autoComplete="username" required value={username} onChange={(change) => setUsername(change.target.value)} placeholder="Benutzername" /></label>
              <label className="form-label">Passwort<input className="form-control" autoComplete="current-password" required type="password" value={password} onChange={(change) => setPassword(change.target.value)} placeholder="Passwort" /></label>
              {error && <p className="form-error alert alert-danger" role="alert">{error}</p>}
              <button className="login-submit btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Anmeldung läuft …' : 'Sicher anmelden'} <span>→</span>
              </button>
            </form>
            <div className="login-demo-note alert alert-secondary"><span className="login-demo-dot" /><span><strong>Lokaler Demo-Zugang</strong><br />Benutzername: admin · Passwort: admin</span></div>
            <p className="login-security-note">Demonstrationsbetrieb, nicht für den produktiven Einsatz vorgesehen. Nach fünf Fehlversuchen wird die Anmeldung vorübergehend gesperrt.</p>
          </div>
        </div>
        <div className="login-side-footer"><span>RISKPILOT · FORSCHUNGSPROTOTYP</span><span>VERSION 0.1</span></div>
      </section>
    </main>
  )
}
