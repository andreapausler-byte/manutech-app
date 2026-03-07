/**
 * QRScanner — Scanner QR per identificazione macchinario
 * 
 * Usa la fotocamera per leggere QR code sui macchinari.
 * Supporta QR con testo semplice (nome macchina) o JSON ({id, name}).
 * Si chiude automaticamente dopo una scansione riuscita.
 * 
 * Uso:
 *   <QRScanner onScan={(machineData) => ...} onClose={() => ...} />
 */

import { useEffect, useRef, useState } from 'react'
import { useHaptic } from '../../hooks/useHaptic'
import { X, QrCode, Flashlight, SwitchCamera } from 'lucide-react'

export default function QRScanner({ onScan, onClose, machines = [] }) {
  const scannerRef = useRef(null)
  const html5QrRef = useRef(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const haptic = useHaptic()

  useEffect(() => {
    let scanner = null

    const startScanner = async () => {
      try {
        // Lazy load — la libreria viene scaricata solo quando lo scanner si apre
        const { Html5Qrcode } = await import('html5-qrcode')
        setLoading(false)
        const scannerId = 'manutech-qr-reader'
        scanner = new Html5Qrcode(scannerId)
        html5QrRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleScan(decodedText)
          },
          () => {
            // QR not found in frame — ignore
          }
        )

        setScanning(true)
      } catch (err) {
        console.error('QR Scanner error:', err)
        setError(
          err.toString().includes('Permission')
            ? 'Permesso fotocamera negato. Consenti l\'accesso nelle impostazioni.'
            : 'Impossibile avviare la fotocamera.'
        )
      }
    }

    startScanner()

    return () => {
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = (decodedText) => {
    haptic.success()

    // Tenta di parsare come JSON
    let machineData = null
    try {
      const parsed = JSON.parse(decodedText)
      if (parsed.name || parsed.id) {
        machineData = {
          name: parsed.name || '',
          id: parsed.id || '',
          raw: decodedText,
        }
      }
    } catch {
      // Non è JSON — tratta come testo semplice (nome macchina)
    }

    if (!machineData) {
      // Cerca corrispondenza nel catalogo macchine
      const match = machines.find(
        m => m.name.toLowerCase() === decodedText.toLowerCase() ||
             m.id === decodedText
      )

      machineData = {
        name: match ? match.name : decodedText.trim(),
        id: match ? match.id : null,
        raw: decodedText,
      }
    }

    // Stop scanner e notifica
    if (html5QrRef.current?.isScanning) {
      html5QrRef.current.stop().catch(() => {})
    }

    onScan(machineData)
  }

  const handleClose = () => {
    if (html5QrRef.current?.isScanning) {
      html5QrRef.current.stop().catch(() => {})
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 relative z-10">
        <div className="flex items-center gap-2">
          <QrCode size={20} className="text-blue-400" />
          <span className="text-base font-bold text-white">Scansiona QR</span>
        </div>
        <button
          onClick={handleClose}
          className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 press-scale"
        >
          <X size={22} className="text-white" />
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Camera viewport */}
        <div
          id="manutech-qr-reader"
          ref={scannerRef}
          className="w-full h-full"
          style={{ maxWidth: '100%' }}
        />

        {/* Scanning frame overlay */}
        {scanning && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 relative">
              {/* Corner markers */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-blue-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-blue-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-blue-400 rounded-br-lg" />

              {/* Scanning line animation */}
              <div className="absolute left-2 right-2 h-0.5 bg-blue-400/80 animate-scan-line rounded-full" />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-8">
            <div className="text-center space-y-4">
              <div className="text-5xl">📸</div>
              <p className="text-lg text-red-400 font-semibold">{error}</p>
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-surface-2 rounded-xl text-white font-bold active:bg-gray-700 press-scale"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-2 border-token border-t-blue-400 rounded-full animate-spin mx-auto" />
              <p className="text-base text-muted">Avvio fotocamera...</p>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="px-6 py-5 bg-black/80 text-center">
        <p className="text-base text-gray-300">
          Inquadra il codice QR sul macchinario
        </p>
        <p className="text-sm text-faint mt-1">
          Il macchinario verrà selezionato automaticamente
        </p>
      </div>
    </div>
  )
}
