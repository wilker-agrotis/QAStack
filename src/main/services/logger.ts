import type { BrowserWindow } from 'electron'
import { IPC, type LogLine } from '@shared/types'

let win: BrowserWindow | null = null

export function attachWindow(w: BrowserWindow): void {
  win = w
}

export function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function log(text: string, level: LogLine['level'] = 'default'): void {
  const line: LogLine = { text, level, at: new Date().toISOString() }
  send(IPC.log, line)
}
