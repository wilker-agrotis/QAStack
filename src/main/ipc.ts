import { ipcMain } from 'electron'
import { IPC, type CodegenOptions, type EnvCheckItem, type RunOptions, type SyncRequest } from '@shared/types'
import { checkEnvironment, installBrowsers } from './services/env-check'
import { discover, markSeen } from './services/discovery'
import { listBranches, sync } from './services/git'
import { currentState } from './services/repo'
import { saveSettings } from './services/settings'
import { codegen, downloadReport, openReport, reportInfo, run, stop, stopAll } from './services/runner'
import { clearResults } from './services/results'
import { installEnvItem } from './services/installers'

export function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => currentState())
  ipcMain.handle(IPC.checkEnv, () => checkEnvironment())
  ipcMain.handle(IPC.installBrowsers, () => installBrowsers())
  ipcMain.handle(IPC.installEnvItem, (_e, id: EnvCheckItem['id']) => installEnvItem(id))
  ipcMain.handle(IPC.sync, (_e, req: SyncRequest) => sync(req))
  ipcMain.handle(IPC.listBranches, () => listBranches())
  ipcMain.handle(IPC.discover, () => discover())
  ipcMain.handle(IPC.markSeen, () => markSeen())
  ipcMain.handle(IPC.setShowEnvOnStartup, (_e, show: boolean) => {
    saveSettings({ showEnvOnStartup: !!show })
  })
  ipcMain.handle(IPC.run, (_e, opts: RunOptions) => run(opts))
  ipcMain.handle(IPC.stop, (_e, runId: string) => stop(runId))
  ipcMain.handle(IPC.stopAll, () => stopAll())
  ipcMain.handle(IPC.openReport, () => openReport())
  ipcMain.handle(IPC.downloadReport, () => downloadReport())
  ipcMain.handle(IPC.reportInfo, () => reportInfo())
  ipcMain.handle(IPC.clearResults, () => clearResults())
  ipcMain.handle(IPC.codegen, (_e, opts: CodegenOptions) => codegen(opts))
}
