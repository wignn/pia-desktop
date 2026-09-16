import { TerminalAPI } from '../shared/contracts'

declare global {
  interface Window {
    api: TerminalAPI
  }
}
