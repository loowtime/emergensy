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
          <span className="login-kicker"><span className="login-live-dot" /> LAGEZENTRUM · HAMBURG</span>
          <h1>Ein klarer Blick.<br />Wenn es darauf<br /><em>ankommt.</em></h1>
          <p>Ereignisse ordnen. Prioritäten erkennen. Maßnahmen im Blick behalten.</p>
        </div>
        <div className="login-story-footer"><span>53° 33′ N&nbsp;&nbsp; 9° 59′ E</span><span>LEITSTELLE HAMBURG</span></div>
      </section>
      <section className="login-side" id="login">
        <div className="login-panel">
          <span className="login-panel-index">ADMINISTRATIONSZUGANG <span>01 — 01</span></span>
          <div className="login-panel-icon"><LockKeyhole size={21} /></div>
          <h2>Willkommen zurück.</h2>
          <p className="login-intro">Melde dich an, um die Hamburger Ereignislage zu verwalten.</p>
          <form className="login-form" onSubmit={(submitEvent) => void handleSubmit(submitEvent)}>
            <label>Benutzername<input autoComplete="username" required value={username} onChange={(change) => setUsername(change.target.value)} placeholder="Benutzername" /></label>
            <label>Passwort<input autoComplete="current-password" required type="password" value={password} onChange={(change) => setPassword(change.target.value)} placeholder="Passwort" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Anmeldung läuft …' : 'Sicher anmelden'} <span>→</span>
            </button>
          </form>
          <div className="login-demo-note"><span className="login-demo-dot" /><span><strong>Lokaler Demo-Modus</strong><br />Standardzugang: admin / admin</span></div>
          <p className="login-security-note">Demo-Zugang ist nur lokal verfügbar. Nach fünf Fehlversuchen wird die Anmeldung für 15 Minuten gesperrt.</p>
        </div>
        <div className="login-side-footer"><span>RISKPILOT · EINSATZÜBERSICHT</span><span>VERSION 0.1</span></div>
      </section>
    </main>
  )
}
