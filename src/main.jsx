import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-center"
      gutter={8}
      containerStyle={{ bottom: 70 }}
      toastOptions={{
        duration: 3000,
        style: {
          background: 'var(--color-green)',
          color: '#000',
          borderRadius: 10,
          padding: '10px 20px',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'Outfit', sans-serif",
          maxWidth: '92vw',
          animation: 'toastIn 0.3s ease',
        },
        success: {
          iconTheme: { primary: '#000', secondary: 'var(--color-green)' },
        },
        error: {
          style: {
            background: 'var(--color-red)',
            color: '#fff',
          },
          iconTheme: { primary: '#fff', secondary: 'var(--color-red)' },
        },
      }}
    />
  </React.StrictMode>
)
