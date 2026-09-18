/**
 * PIA Terminal - SQLite Database Service via sql.js (WebAssembly)
 * Handles structured local persistence with schema migrations and debounced writebacks.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import type {
  DrawingItem,
  IndicatorConfig,
  WatchlistGroup,
  PriceAlert,
  PaperAccount,
  ChartLayoutData,
  Timeframe,
  ChartType
} from '@shared/types'

export class DatabaseService {
  private db: SqlJsDatabase | null = null
  private dbFilePath: string
  private saveTimeout: NodeJS.Timeout | null = null
  private isInitialized = false

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbFilePath = path.join(userDataPath, 'pia-terminal.db')
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return

    const SQL = await initSqlJs()

    if (fs.existsSync(this.dbFilePath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbFilePath)
        this.db = new SQL.Database(fileBuffer)
      } catch (err) {
        console.warn('Failed to load existing SQLite database, creating fresh one:', err)
        this.db = new SQL.Database()
      }
    } else {
      this.db = new SQL.Database()
    }

    this.runMigrations()
    this.isInitialized = true
  }

  private runMigrations(): void {
    if (!this.db) return

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `)

    const res = this.db.exec('SELECT version FROM schema_version LIMIT 1')
    const currentVersion =
      res.length > 0 && res[0].values.length > 0 ? (res[0].values[0][0] as number) : 0

    if (currentVersion < 1) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS drawings (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          symbol TEXT NOT NULL,
          timeframe TEXT,
          points_json TEXT NOT NULL,
          style_json TEXT NOT NULL,
          lock INTEGER DEFAULT 0,
          visible INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_drawings_symbol ON drawings (symbol);

        CREATE TABLE IF NOT EXISTS indicators (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          pane_id TEXT NOT NULL,
          calc_params_json TEXT NOT NULL,
          visible INTEGER DEFAULT 1,
          styles_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_indicators_symbol ON indicators (symbol);

        CREATE TABLE IF NOT EXISTS watchlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          symbols_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chart_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          target_price REAL NOT NULL,
          direction TEXT NOT NULL,
          triggered INTEGER DEFAULT 0,
          note TEXT,
          created_at INTEGER NOT NULL,
          triggered_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS paper_accounts (
          id TEXT PRIMARY KEY,
          data_json TEXT NOT NULL
        );

        INSERT OR REPLACE INTO schema_version (version) VALUES (1);
      `)

      // Keep the initial watchlist empty until live symbols are supplied by PIA.
      const wlCount = this.db.exec('SELECT count(*) FROM watchlists')
      if (wlCount.length > 0 && Number(wlCount[0].values[0][0]) === 0) {
        this.db.run('INSERT INTO watchlists (id, name, symbols_json) VALUES (?, ?, ?)', [
          'default',
          'My Watchlist',
          JSON.stringify([])
        ])
      }

      this.scheduleDiskWrite(0)
    }

    if (currentVersion < 2) {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS chart_layouts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          chart_type TEXT NOT NULL,
          indicators_json TEXT NOT NULL,
          active_panel TEXT,
          is_favorite INTEGER DEFAULT 0,
          description TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_chart_layouts_updated ON chart_layouts (updated_at DESC);

        INSERT OR REPLACE INTO schema_version (version) VALUES (2);
      `)

      // Seed starter layouts if empty
      const layoutCount = this.db.exec('SELECT count(*) FROM chart_layouts')
      if (layoutCount.length > 0 && Number(layoutCount[0].values[0][0]) === 0) {
        const now = Date.now()
        const defaultIndicators = JSON.stringify([
          {
            id: 'default_ema_20',
            name: 'EMA',
            paneId: 'candle_pane',
            calcParams: [20],
            visible: true
          },
          {
            id: 'default_rsi_14',
            name: 'RSI',
            paneId: 'pane_rsi',
            calcParams: [14],
            visible: true
          }
        ])

        this.db.run(
          `INSERT INTO chart_layouts (id, name, symbol, timeframe, chart_type, indicators_json, active_panel, is_favorite, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'layout_live_main',
            'Live Chart Setup',
            '',
            '1h',
            'candle_solid',
            defaultIndicators,
            'watchlist',
            1,
            'Live provider chart with EMA and RSI',
            now,
            now
          ]
        )
      }

      this.scheduleDiskWrite(0)
    }
  }

  private scheduleDiskWrite(delayMs = 1500): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.flushSync()
    }, delayMs)
  }

  public flushSync(): void {
    if (!this.db) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbFilePath, buffer)
    } catch (err) {
      console.error('Failed to flush SQLite database to disk:', err)
    }
  }

  // --- Drawings API ---

  public getDrawings(symbol: string, timeframe?: string): DrawingItem[] {
    if (!this.db) return []
    let query =
      'SELECT id, type, symbol, timeframe, points_json, style_json, lock, visible, created_at, updated_at FROM drawings WHERE symbol = ?'
    const params: (string | number)[] = [symbol]

    if (timeframe) {
      query += ' AND (timeframe IS NULL OR timeframe = ?)'
      params.push(timeframe)
    }

    const stmt = this.db.prepare(query)
    stmt.bind(params)
    const drawings: DrawingItem[] = []

    while (stmt.step()) {
      const row = stmt.getAsObject()
      drawings.push({
        id: row.id as string,
        type: row.type as string,
        symbol: row.symbol as string,
        timeframe: (row.timeframe as string) || undefined,
        points: JSON.parse(row.points_json as string),
        style: JSON.parse(row.style_json as string),
        lock: Boolean(row.lock),
        visible: Boolean(row.visible),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at)
      })
    }
    stmt.free()
    return drawings
  }

  public saveDrawing(drawing: DrawingItem): boolean {
    if (!this.db) return false
    try {
      this.db.run(
        `INSERT OR REPLACE INTO drawings (
          id, type, symbol, timeframe, points_json, style_json, lock, visible, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          drawing.id,
          drawing.type,
          drawing.symbol,
          drawing.timeframe || null,
          JSON.stringify(drawing.points),
          JSON.stringify(drawing.style),
          drawing.lock ? 1 : 0,
          drawing.visible !== false ? 1 : 0,
          drawing.createdAt,
          drawing.updatedAt
        ]
      )
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error saving drawing:', err)
      return false
    }
  }

  public deleteDrawing(id: string): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM drawings WHERE id = ?', [id])
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error deleting drawing:', err)
      return false
    }
  }

  public clearDrawings(symbol?: string): boolean {
    if (!this.db) return false
    try {
      if (symbol) {
        this.db.run('DELETE FROM drawings WHERE symbol = ?', [symbol])
      } else {
        this.db.run('DELETE FROM drawings')
      }
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error clearing drawings:', err)
      return false
    }
  }

  // --- Indicators API ---

  public getIndicators(symbol: string): IndicatorConfig[] {
    if (!this.db) return []
    const stmt = this.db.prepare(
      'SELECT id, symbol, name, pane_id, calc_params_json, visible, styles_json FROM indicators WHERE symbol = ?'
    )
    stmt.bind([symbol])
    const indicators: IndicatorConfig[] = []

    while (stmt.step()) {
      const row = stmt.getAsObject()
      indicators.push({
        id: row.id as string,
        name: row.name as string,
        paneId: row.pane_id as string,
        calcParams: JSON.parse(row.calc_params_json as string),
        visible: Boolean(row.visible),
        styles: row.styles_json ? JSON.parse(row.styles_json as string) : undefined
      })
    }
    stmt.free()
    return indicators
  }

  public saveIndicators(symbol: string, indicators: IndicatorConfig[]): boolean {
    if (!this.db) return false
    try {
      this.db.run('BEGIN TRANSACTION;')
      this.db.run('DELETE FROM indicators WHERE symbol = ?', [symbol])

      for (const ind of indicators) {
        this.db.run(
          'INSERT INTO indicators (id, symbol, name, pane_id, calc_params_json, visible, styles_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            ind.id,
            symbol,
            ind.name,
            ind.paneId,
            JSON.stringify(ind.calcParams),
            ind.visible ? 1 : 0,
            ind.styles ? JSON.stringify(ind.styles) : null
          ]
        )
      }

      this.db.run('COMMIT;')
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      this.db.run('ROLLBACK;')
      console.error('Error saving indicators:', err)
      return false
    }
  }

  // --- Watchlists API ---

  public getWatchlists(): WatchlistGroup[] {
    if (!this.db) return []
    const res = this.db.exec('SELECT id, name, symbols_json FROM watchlists')
    if (res.length === 0) return []

    return res[0].values.map((row) => ({
      id: row[0] as string,
      name: row[1] as string,
      symbols: JSON.parse(row[2] as string)
    }))
  }

  public saveWatchlist(watchlist: WatchlistGroup): boolean {
    if (!this.db) return false
    try {
      this.db.run('INSERT OR REPLACE INTO watchlists (id, name, symbols_json) VALUES (?, ?, ?)', [
        watchlist.id,
        watchlist.name,
        JSON.stringify(watchlist.symbols)
      ])
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error saving watchlist:', err)
      return false
    }
  }

  public deleteWatchlist(id: string): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM watchlists WHERE id = ?', [id])
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error deleting watchlist:', err)
      return false
    }
  }

  // --- Alerts API ---

  public getAlerts(): PriceAlert[] {
    if (!this.db) return []
    const stmt = this.db.prepare(
      'SELECT id, symbol, target_price, direction, triggered, note, created_at, triggered_at FROM alerts ORDER BY created_at DESC'
    )
    const alerts: PriceAlert[] = []

    while (stmt.step()) {
      const row = stmt.getAsObject()
      alerts.push({
        id: row.id as string,
        symbol: row.symbol as string,
        targetPrice: Number(row.target_price),
        direction: row.direction as 'above' | 'below' | 'cross',
        triggered: Boolean(row.triggered),
        note: (row.note as string) || undefined,
        createdAt: Number(row.created_at),
        triggeredAt: row.triggered_at ? Number(row.triggered_at) : undefined
      })
    }
    stmt.free()
    return alerts
  }

  public saveAlert(alert: PriceAlert): boolean {
    if (!this.db) return false
    try {
      this.db.run(
        `INSERT OR REPLACE INTO alerts (
          id, symbol, target_price, direction, triggered, note, created_at, triggered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          alert.id,
          alert.symbol,
          alert.targetPrice,
          alert.direction,
          alert.triggered ? 1 : 0,
          alert.note || null,
          alert.createdAt,
          alert.triggeredAt || null
        ]
      )
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error saving alert:', err)
      return false
    }
  }

  public deleteAlert(id: string): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM alerts WHERE id = ?', [id])
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error deleting alert:', err)
      return false
    }
  }

  // --- Paper Accounts API ---

  public getPaperAccount(): PaperAccount {
    const defaultAccount: PaperAccount = {
      balance: 100000,
      initialBalance: 100000,
      currency: 'USD',
      positions: [],
      updatedAt: Date.now()
    }
    if (!this.db) return defaultAccount

    const res = this.db.exec('SELECT data_json FROM paper_accounts WHERE id = "default" LIMIT 1')
    if (res.length > 0 && res[0].values.length > 0) {
      try {
        return JSON.parse(res[0].values[0][0] as string)
      } catch (err) {
        console.error('Failed to parse paper account json:', err)
      }
    }
    return defaultAccount
  }

  public savePaperAccount(account: PaperAccount): boolean {
    if (!this.db) return false
    try {
      this.db.run('INSERT OR REPLACE INTO paper_accounts (id, data_json) VALUES (?, ?)', [
        'default',
        JSON.stringify(account)
      ])
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error saving paper account:', err)
      return false
    }
  }

  // --- Chart Layouts API ---

  public getLayouts(): ChartLayoutData[] {
    if (!this.db) return []
    try {
      const res = this.db.exec(
        'SELECT id, name, symbol, timeframe, chart_type, indicators_json, active_panel, is_favorite, description, created_at, updated_at FROM chart_layouts ORDER BY is_favorite DESC, updated_at DESC'
      )
      if (res.length === 0) return []

      return res[0].values.map((row) => ({
        id: row[0] as string,
        name: row[1] as string,
        symbol: row[2] as string,
        timeframe: row[3] as Timeframe,
        chartType: row[4] as ChartType,
        indicators: JSON.parse((row[5] as string) || '[]'),
        activePanel: (row[6] as string) || undefined,
        isFavorite: Boolean(row[7]),
        description: (row[8] as string) || undefined,
        createdAt: Number(row[9]),
        updatedAt: Number(row[10])
      }))
    } catch (err) {
      console.error('Error fetching chart layouts:', err)
      return []
    }
  }

  public getLayout(id: string): ChartLayoutData | null {
    if (!this.db) return null
    try {
      const stmt = this.db.prepare(
        'SELECT id, name, symbol, timeframe, chart_type, indicators_json, active_panel, is_favorite, description, created_at, updated_at FROM chart_layouts WHERE id = ? LIMIT 1'
      )
      stmt.bind([id])
      if (stmt.step()) {
        const row = stmt.getAsObject()
        stmt.free()
        return {
          id: row.id as string,
          name: row.name as string,
          symbol: row.symbol as string,
          timeframe: row.timeframe as Timeframe,
          chartType: row.chart_type as ChartType,
          indicators: JSON.parse((row.indicators_json as string) || '[]'),
          activePanel: (row.active_panel as string) || undefined,
          isFavorite: Boolean(row.is_favorite),
          description: (row.description as string) || undefined,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        }
      }
      stmt.free()
      return null
    } catch (err) {
      console.error('Error fetching layout by id:', err)
      return null
    }
  }

  public saveLayout(layout: ChartLayoutData): boolean {
    if (!this.db) return false
    try {
      this.db.run(
        `INSERT OR REPLACE INTO chart_layouts (id, name, symbol, timeframe, chart_type, indicators_json, active_panel, is_favorite, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          layout.id,
          layout.name,
          layout.symbol,
          layout.timeframe,
          layout.chartType,
          JSON.stringify(layout.indicators || []),
          layout.activePanel || null,
          layout.isFavorite ? 1 : 0,
          layout.description || null,
          layout.createdAt || Date.now(),
          layout.updatedAt || Date.now()
        ]
      )
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error saving chart layout:', err)
      return false
    }
  }

  public deleteLayout(id: string): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM chart_layouts WHERE id = ?', [id])
      this.scheduleDiskWrite()
      return true
    } catch (err) {
      console.error('Error deleting chart layout:', err)
      return false
    }
  }
}
