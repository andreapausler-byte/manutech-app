import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-center"
      gutter={10}
      containerStyle={{ top: 16 }}
      toastOptions={{
        style: {
          background: 'var(--color-surface-1)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px',
          padding: '14px 20px',
          fontSize: '15px',
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: 'var(--shadow-lg)',
          maxWidth: '92vw',
          transition: 'background 0.4s ease, color 0.4s ease',
        },
        success: {
          iconTheme: { primary: 'var(--color-success)', secondary: 'var(--color-surface-1)' },
        },
        error: {
          iconTheme: { primary: 'var(--color-danger)', secondary: 'var(--color-surface-1)' },
        },
      }}
    />
  </React.StrictMode>
)
