import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type QAStackApi } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Só estas funções ficam visíveis para a tela: nada de Node ou ipcRenderer cru.
const api: QAStackApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  checkEnv: () => ipcRenderer.invoke(IPC.checkEnv),
  installBrowsers: () => ipcRenderer.invoke(IPC.installBrowsers),
  sync: (req) => ipcRenderer.invoke(IPC.sync, req),
  listBranches: () => ipcRenderer.invoke(IPC.listBranches),
  discover: () => ipcRenderer.invoke(IPC.discover),
  markSeen: () => ipcRenderer.invoke(IPC.markSeen),
  setShowEnvOnStartup: (show) => ipcRenderer.invoke(IPC.setShowEnvOnStartup, show),
  run: (opts) => ipcRenderer.invoke(IPC.run, opts),
  stop: (runId) => ipcRenderer.invoke(IPC.stop, runId),
  stopAll: () => ipcRenderer.invoke(IPC.stopAll),
  openReport: () => ipcRenderer.invoke(IPC.openReport),
  downloadReport: () => ipcRenderer.invoke(IPC.downloadReport),
  clearResults: () => ipcRenderer.invoke(IPC.clearResults),
  codegen: (opts) => ipcRenderer.invoke(IPC.codegen, opts),
  onLog: (cb) => subscribe(IPC.log, cb),
  onTestEvent: (cb) => subscribe(IPC.testEvent, cb),
  onRunFinished: (cb) => subscribe(IPC.runFinished, cb)
}

contextBridge.exposeInMainWorld('qastack', api)
