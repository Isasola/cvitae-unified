import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { CookiePreferences } from './components/cv/CookiePreferences'
import { initializeConsentMode, loadAllowedGoogleServices } from './lib/consent'
import './index.css'

initializeConsentMode()
void loadAllowedGoogleServices()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
      <CookiePreferences />
    </HelmetProvider>
  </React.StrictMode>
)
