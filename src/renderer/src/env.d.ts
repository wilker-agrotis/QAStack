/// <reference types="vite/client" />
import type { QAStackApi } from '../../shared/types'

declare global {
  interface Window {
    /** API exposta pelo preload (contextBridge). */
    qastack: QAStackApi
  }
}

export {}
