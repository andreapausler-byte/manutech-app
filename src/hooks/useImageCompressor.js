/**
 * useImageCompressor — Compressione automatica immagini prima dell'upload
 * 
 * Ridimensiona le immagini a maxWidth mantenendo l'aspect ratio,
 * e le comprime in JPEG con qualità configurabile.
 * Riduce drasticamente peso e tempo di upload su rete mobile.
 * 
 * Uso:
 *   const { compress } = useImageCompressor()
 *   const { file, wasCompressed, originalSize, compressedSize } = await compress(originalFile)
 */

const DEFAULT_OPTIONS = {
  maxWidth: 1920,       // px — più che sufficiente per display mobile/tablet
  maxHeight: 1920,
  quality: 0.82,        // 0-1, bilanciamento qualità/peso
  mimeType: 'image/jpeg',
}

export function useImageCompressor(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }

  const compress = (file) => {
    return new Promise((resolve, _reject) => {
      // Skip se non è un'immagine
      if (!file.type.startsWith('image/')) {
        resolve({ file, wasCompressed: false, originalSize: file.size, compressedSize: file.size })
        return
      }

      // Skip se è una GIF (mantieni animazione)
      if (file.type === 'image/gif') {
        resolve({ file, wasCompressed: false, originalSize: file.size, compressedSize: file.size })
        return
      }

      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(url)

        let { width, height } = img

        // Calcola nuove dimensioni mantenendo aspect ratio
        if (width > config.maxWidth || height > config.maxHeight) {
          const ratio = Math.min(config.maxWidth / width, config.maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        // Se l'immagine è già piccola e leggera (<500KB), skip
        if (width === img.width && height === img.height && file.size < 500000) {
          resolve({ file, wasCompressed: false, originalSize: file.size, compressedSize: file.size })
          return
        }

        // Comprimi via Canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        // Smooth scaling
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({ file, wasCompressed: false, originalSize: file.size, compressedSize: file.size })
              return
            }

            // Se la compressione non ha ridotto significativamente, usa l'originale
            if (blob.size >= file.size * 0.9) {
              resolve({ file, wasCompressed: false, originalSize: file.size, compressedSize: file.size })
              return
            }

            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: config.mimeType, lastModified: Date.now() }
            )

            resolve({
              file: compressedFile,
              wasCompressed: true,
              originalSize: file.size,
              compressedSize: compressedFile.size,
            })
          },
          config.mimeType,
          config.quality
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        // In caso di errore, usa il file originale
        resolve({ file, wasCompressed: false, originalSize: file.size, compressedSize: file.size })
      }

      img.src = url
    })
  }

  // Miniatura quadrata-ish per le griglie di galleria.
  //
  // Una foto compressa pesa 300-600KB: una griglia da 60 foto sono decine
  // di MB sulla rete di uno stabilimento. La miniatura si genera una volta
  // in fase di upload e costa ~15KB.
  //
  // Ritorna null se non è un'immagine o se qualcosa va storto: il
  // chiamante ricade sull'originale, non fallisce l'upload.
  const makeThumbnail = (file, { size = 400, quality = 0.7 } = {}) => {
    return new Promise((resolve) => {
      if (!file?.type?.startsWith('image/')) { resolve(null); return }

      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(url)
        const ratio = Math.min(size / img.width, size / img.height, 1)
        const width = Math.max(Math.round(img.width * ratio), 1)
        const height = Math.max(Math.round(img.height * ratio), 1)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(null); return }
            resolve(new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '') + '-thumb.jpg',
              { type: 'image/jpeg', lastModified: Date.now() }
            ))
          },
          'image/jpeg',
          quality
        )
      }

      img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      img.src = url
    })
  }

  // Formatta bytes in stringa leggibile
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return { compress, makeThumbnail, formatSize }
}
