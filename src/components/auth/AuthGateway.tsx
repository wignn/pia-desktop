import React, { useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { THEME_TOKENS } from '../../theme/tokens'

// Minimalist SVG sparklines for reference market pulse
const SPARKLINES = {
  up: 'M0,16 L8,15 L16,13 L24,14 L32,10 L40,11 L48,7 L56,9 L64,4 L72,6 L80,2',
  down: 'M0,4 L8,5 L16,8 L24,7 L32,11 L40,10 L48,14 L56,12 L64,17 L72,15 L80,19'
}

interface MarketTickerItem {
  symbol: string
  name: string
  price: string
  change: string
  isPositive: boolean
  sparkline: string
}

const PREVIEW_TICKERS: MarketTickerItem[] = [
  {
    symbol: 'XAU/USD',
    name: 'Gold Spot',
    price: '2,724.80',
    change: '+0.42%',
    isPositive: true,
    sparkline: SPARKLINES.up
  },
  {
    symbol: 'BTC/USD',
    name: 'Bitcoin',
    price: '67,840.00',
    change: '+1.85%',
    isPositive: true,
    sparkline: SPARKLINES.up
  },
  {
    symbol: 'EUR/USD',
    name: 'Euro / US Dollar',
    price: '1.0845',
    change: '-0.14%',
    isPositive: false,
    sparkline: SPARKLINES.down
  },
  {
    symbol: 'DXY',
    name: 'US Dollar Index',
    price: '103.42',
    change: '+0.08%',
    isPositive: true,
    sparkline: SPARKLINES.up
  },
  {
    symbol: 'US10Y',
    name: '10Y Treasury Yield',
    price: '4.180%',
    change: '+0.02%',
    isPositive: true,
    sparkline: SPARKLINES.up
  }
]

export function AuthGateway(): React.JSX.Element {
  const [step, setStep] = useState<1 | 2>(1)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [isApiKeySubmitting, setIsApiKeySubmitting] = useState(false)

  const { loginWithGoogle, saveApiKey, isSaving, errorMessage } = useSettingsStore()
  const { status: updaterStatus, isChecking, checkForUpdates, installUpdate } = useUpdaterStore()

  const handleGoogleLogin = async (): Promise<void> => {
    await loginWithGoogle()
  }

  const handleApiKeySubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!apiKeyInput.trim()) return
    setIsApiKeySubmitting(true)
    await saveApiKey(apiKeyInput.trim())
    setIsApiKeySubmitting(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#080A0F',
        color: '#F4F6FC',
        fontFamily: THEME_TOKENS.typography.fontSans,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Subtle architectural background grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          pointerEvents: 'none'
        }}
      />

      {/* Top Header Bar */}
      <header
        style={{
          height: 48,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0B0E14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '0.08em',
              color: '#F4F6FC'
            }}
          >
            <span style={{ color: '#D4AF37' }}>◈</span> PIA TERMINAL
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: THEME_TOKENS.typography.fontMono,
              color: '#64748B',
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
              paddingLeft: 12,
              letterSpacing: '0.06em'
            }}
          >
            QUANTITATIVE FOREX & MULTI-ASSET ENGINE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Node pulse status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: THEME_TOKENS.typography.fontMono,
              color: '#10B981'
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981'
              }}
            />
            EDGE SG1-SIN // &lt; 4MS
          </div>

          <div
            style={{
              fontSize: 11,
              fontFamily: THEME_TOKENS.typography.fontMono,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 8px',
              borderRadius: 3,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94A3B8'
            }}
          >
            v{updaterStatus.currentVersion}
          </div>
        </div>
      </header>

      {/* TradingView-Style Market Ticker Ribbon */}
      <div
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: '#0D1118',
          display: 'flex',
          alignItems: 'center',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '0 16px',
          height: 38,
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {PREVIEW_TICKERS.map((item) => (
            <div
              key={item.symbol}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
                fontFamily: THEME_TOKENS.typography.fontMono
              }}
            >
              <span style={{ fontWeight: 600, color: '#F4F6FC' }}>{item.symbol}</span>
              <span style={{ color: '#94A3B8' }}>{item.price}</span>
              <span
                style={{
                  color: item.isPositive ? '#10B981' : '#F43F5E',
                  fontWeight: 600
                }}
              >
                {item.change}
              </span>
              <svg width="40" height="14" viewBox="0 0 80 20" style={{ opacity: 0.85 }}>
                <path
                  d={item.sparkline}
                  fill="none"
                  stroke={item.isPositive ? '#10B981' : '#F43F5E'}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          position: 'relative',
          zIndex: 10
        }}
      >
        {step === 1 ? (
          /* STEP 1: Lightweight TradingView-style Release Radar & Update Check */
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              animation: 'fadeIn 0.25s ease-out'
            }}
          >
            {/* Stage Eyebrow */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 4
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: THEME_TOKENS.typography.fontMono,
                  color: '#D4AF37',
                  letterSpacing: '0.1em'
                }}
              >
                STEP 1 OF 3 // SYSTEM READINESS &amp; UPDATE RADAR
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#64748B',
                  fontFamily: THEME_TOKENS.typography.fontMono
                }}
              >
                STANDBY MODE
              </div>
            </div>

            {/* Hero Card */}
            <div
              style={{
                backgroundColor: '#0C1017',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                padding: '24px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7)'
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: '#FFFFFF',
                    margin: 0
                  }}
                >
                  Selamat Datang di PIA Terminal
                </h1>
                <p
                  style={{
                    fontSize: 13,
                    color: '#838896',
                    marginTop: 6,
                    lineHeight: 1.5,
                    maxWidth: 580
                  }}
                >
                  Platform analisis valuta asing dan multi-aset institusional. Periksa pembaruan
                  sistem di bawah ini sebelum menginisialisasi sesi kerja terminal Anda.
                </p>
              </div>

              {/* Version & Diagnostics Bar */}
              <div
                style={{
                  backgroundColor: '#111622',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 6,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F4F6FC' }}>
                      Pembaruan Aplikasi
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: THEME_TOKENS.typography.fontMono,
                        backgroundColor:
                          updaterStatus.state === 'available'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                        color: updaterStatus.state === 'available' ? '#F59E0B' : '#10B981',
                        padding: '2px 6px',
                        borderRadius: 3,
                        fontWeight: 700
                      }}
                    >
                      {updaterStatus.state === 'available' ? 'Update Tersedia' : 'Versi Mutakhir'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#838896',
                      fontFamily: THEME_TOKENS.typography.fontMono
                    }}
                  >
                    Versi Terpasang: v{updaterStatus.currentVersion}
                    {updaterStatus.availableVersion && ` → v${updaterStatus.availableVersion}`}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {updaterStatus.state === 'downloaded' ? (
                    <button
                      type="button"
                      onClick={() => installUpdate()}
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: '#10B981',
                        color: '#080A0F',
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      Pasang Sekarang
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isChecking}
                      onClick={() => checkForUpdates()}
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: '#E2E8F0',
                        borderRadius: 4,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: isChecking ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isChecking ? 'Memeriksa...' : 'Periksa Update'}
                    </button>
                  )}
                </div>
              </div>

              {/* What's New Feature Highlights */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#64748B',
                    textTransform: 'uppercase'
                  }}
                >
                  Update Highlights v3.0.2:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 6,
                      padding: '10px 12px'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#D4AF37' }}>
                      NATS High-Speed Memory
                    </div>
                    <div style={{ fontSize: 11, color: '#838896', marginTop: 3 }}>
                      Kuotasi harga real-time tanpa overhead database.
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 6,
                      padding: '10px 12px'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>
                      SafeStorage Native OAuth
                    </div>
                    <div style={{ fontSize: 11, color: '#838896', marginTop: 3 }}>
                      Loopback port terenkripsi &amp; hardware keyring OS.
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button to Step 2 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: '#64748B',
                    fontFamily: THEME_TOKENS.typography.fontMono
                  }}
                >
                  Workspace feeds akan dimuat setelah autentikasi.
                </span>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    backgroundColor: '#F59E0B',
                    color: '#080A0F',
                    fontWeight: 700,
                    fontSize: 13,
                    padding: '9px 20px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Lanjutkan ke Login <span>→</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: Focused Obsidian Authentication Card */
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Back to Step 1 */}
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                background: 'none',
                border: 'none',
                color: '#838896',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: 0,
                alignSelf: 'flex-start'
              }}
            >
              ← Kembali ke Cek Update
            </button>

            {/* Login Card */}
            <div
              style={{
                backgroundColor: '#0C1017',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                boxShadow: '0 24px 50px -12px rgba(0, 0, 0, 0.85)'
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: THEME_TOKENS.typography.fontMono,
                    color: '#D4AF37',
                    letterSpacing: '0.12em',
                    marginBottom: 6
                  }}
                >
                  STEP 2 OF 3 // USER AUTHENTICATION
                </div>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: '#FFFFFF',
                    margin: 0
                  }}
                >
                  Autentikasi Terminal
                </h2>
                <p style={{ fontSize: 12, color: '#838896', marginTop: 6, lineHeight: 1.4 }}>
                  Masuk dengan akun Google Anda untuk mengaktifkan lisensi real-time data feeds.
                </p>
              </div>

              {/* Error Message Alert */}
              {errorMessage && (
                <div
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    borderRadius: 4,
                    padding: '10px 12px',
                    fontSize: 11,
                    color: '#F43F5E',
                    lineHeight: 1.4
                  }}
                >
                  <strong>Gagal Masuk:</strong> {errorMessage}
                </div>
              )}

              {/* Primary: Google Login Button */}
              <button
                type="button"
                disabled={isSaving}
                onClick={handleGoogleLogin}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.75 : 1,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  transition: 'opacity 0.15s ease'
                }}
              >
                {/* Official Google G Logo SVG */}
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>{isSaving ? 'Menghubungkan ke Browser...' : 'Lanjutkan dengan Google'}</span>
              </button>

              {/* Status Note on Active Login */}
              {isSaving && (
                <div
                  style={{
                    fontSize: 11,
                    textAlign: 'center',
                    color: '#D4AF37',
                    fontFamily: THEME_TOKENS.typography.fontMono
                  }}
                >
                  ● Browser telah dibuka. Selesaikan autentikasi Google di jendela browser.
                </div>
              )}

              {/* Divider */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  color: '#525766',
                  fontSize: 10,
                  fontFamily: THEME_TOKENS.typography.fontMono
                }}
              >
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                <span>OPSI PENGEMBANG</span>
                <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
              </div>

              {/* API Key Toggle Form */}
              <div>
                {!showApiKeyForm ? (
                  <button
                    type="button"
                    onClick={() => setShowApiKeyForm(true)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: '1px dashed rgba(255, 255, 255, 0.12)',
                      borderRadius: 4,
                      padding: '8px 12px',
                      color: '#838896',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    Gunakan API Key Mandiri (Bypass)
                  </button>
                ) : (
                  <form
                    onSubmit={handleApiKeySubmit}
                    style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                  >
                    <input
                      type="password"
                      placeholder="Masukkan Kunci API (misal: pia_live_...)"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#07090E',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 4,
                        padding: '8px 10px',
                        color: '#F4F6FC',
                        fontSize: 12,
                        fontFamily: THEME_TOKENS.typography.fontMono,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="submit"
                        disabled={isApiKeySubmitting || !apiKeyInput.trim()}
                        style={{
                          flex: 1,
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: 4,
                          padding: '7px 12px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {isApiKeySubmitting ? 'Menyimpan...' : 'Simpan Kunci & Masuk'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowApiKeyForm(false)}
                        style={{
                          background: 'none',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#838896',
                          borderRadius: 4,
                          padding: '7px 12px',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Security Telemetry Footprint */}
              <div
                style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 10,
                  fontFamily: THEME_TOKENS.typography.fontMono,
                  color: '#64748B'
                }}
              >
                <span>🔒</span> Kredensial disimpan di OS Hardware Keyring (dev.wign.pia)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Global Status Ribbon */}
      <footer
        style={{
          height: 28,
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: '#07090E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontSize: 10,
          fontFamily: THEME_TOKENS.typography.fontMono,
          color: '#525766',
          zIndex: 10
        }}
      >
        <div>PIA TERMINAL // STEP {step} OF 3</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span>MEMORY ENGINE: IDLE</span>
          <span>NATS REALTIME: READY</span>
        </div>
      </footer>
    </div>
  )
}
