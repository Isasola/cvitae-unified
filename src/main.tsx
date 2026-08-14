import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { CookiePreferences } from './components/cv/CookiePreferences'
import { initializeConsentMode, loadAllowedGoogleServices } from './lib/consent'
import './index.css'

initializeConsentMode()
void loadAllowedGoogleServices()

function Root() {
  useEffect(() => {
    document.body.style.opacity = '1'
  }, [])
  return (
    <HelmetProvider>
      <App />
      <CookiePreferences />
    </HelmetProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
