import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import 'halfmoon/css/halfmoon.min.css'
import 'halfmoon/css/cores/halfmoon.modern.css'
import './index.css'
import App from './App.tsx'
import './research-theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
