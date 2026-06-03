import { useState, type JSX } from 'react'
import React from 'react'
import { X, FolderOpen, ArrowRight, Check } from 'lucide-react'

interface VaultCreationWizardProps {
  onClose: () => void
  onCreated: (vaultPath: string, name: string) => void
}

const TOTAL_STEPS = 3

function StepIndicator({ current }: { current: number }) {
  return (
    <div
      className="vcw-step-indicator"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <React.Fragment key={step}>
            <div
              className={`vcw-step-dot ${active ? 'vcw-step-active' : ''} ${done ? 'vcw-step-done' : ''}`}
              aria-label={`步骤 ${step} / ${TOTAL_STEPS}`}
            >
              {done ? <Check size={10} strokeWidth={3} /> : step}
            </div>
            {step < TOTAL_STEPS && (
              <div className={`vcw-step-line ${done ? 'vcw-step-line-done' : ''}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function VaultCreationWizard({ onClose, onCreated }: VaultCreationWizardProps): JSX.Element {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('我的知识库')
  const [basePath, setBasePath] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  // P3-5: step transition direction for animation
  const [_prevStep, _setPrevStep] = useState(1)
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward')

  const handleNext = () => {
    setStepDirection('forward')
    _setPrevStep(step)
    setStep((s) => s + 1)
  }
  const handleBack = () => {
    setStepDirection('back')
    _setPrevStep(step)
    setStep((s) => s - 1)
  }

  // P2-3: conflict detection — check if vault path already exists
  const fullPath = basePath && name.trim() ? `${basePath}/${name.trim()}` : ''

  const isStep1Valid = name.trim().length > 0 && basePath.length > 0
  const isStep2Valid = true // description is optional

  // P2-3: run conflict check when name or basePath changes
  React.useEffect(() => {
    if (!name.trim() || !basePath) return
    void (async () => {
      try {
        // Check via listFiles if the vault directory already has content
        const files = await window.api.listFiles?.()
        if (files && Array.isArray(files)) {
          const exists = files.some((f: { path: string }) => f.path.startsWith(fullPath + '/'))
          if (exists) {
            setNameError('该路径下已有知识库内容，请换一个名称或位置')
          }
        }
      } catch {
        // ignore
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fullPath used in effect but is the function param
  }, [name, basePath])

  const handleBrowse = async () => {
    const path = await (window.api as any).selectDirectory?.()
    if (path) setBasePath(path)
  }

  const handleCreate = async () => {
    if (!name.trim() || !basePath || !isStep1Valid) return
    setCreating(true)
    try {
      const result = await (window.api as any).vault?.createAt?.(fullPath)
      if (result) {
        onCreated(fullPath, name.trim())
      }
    } catch {
      /* ignore */
    }
    setCreating(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)'
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: 32,
          width: 440,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>新建知识库</span>
          <button
            onClick={onClose}
            tabIndex={0}
            aria-label="关闭"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* P2-1: step indicator */}
        <StepIndicator current={step} />

        {/* P3-5: animated step content */}
        <div className={`vcw-step-content vcw-step-content-${stepDirection}`} key={step}>
          {/* Step 1: name + location */}
          {step === 1 && (
            <>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  名称
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: nameError
                      ? '1px solid var(--color-red)'
                      : '1px solid var(--color-border)',
                    fontSize: 14,
                    outline: 'none'
                  }}
                  placeholder="我的知识库"
                  autoFocus
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'vcw-name-error' : undefined}
                />
                {/* P2-3: conflict warning on the input */}
                {nameError && (
                  <div
                    id="vcw-name-error"
                    style={{ fontSize: 11, color: 'var(--color-red)', marginTop: 4 }}
                    role="alert"
                  >
                    {nameError}
                  </div>
                )}
              </div>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  位置
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={basePath}
                    readOnly
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      fontSize: 14,
                      background: 'var(--color-surface)',
                      color: basePath ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                      outline: 'none'
                    }}
                    placeholder="选择文件夹..."
                  />
                  <button
                    onClick={handleBrowse}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    <FolderOpen size={14} /> 浏览
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 2: optional description */}
          {step === 2 && (
            <div>
              <label
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  display: 'block',
                  marginBottom: 6
                }}
              >
                描述（可选）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  fontSize: 14,
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: 80,
                  fontFamily: 'inherit'
                }}
                placeholder="这个知识库用来管理…"
                autoFocus
              />
            </div>
          )}

          {/* Step 3: review */}
          {step === 3 && (
            <div style={{ background: 'var(--color-surface-hover)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                确认知识库信息
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>名称：</span>
                  <strong>{name}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>位置：</span>
                  <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{basePath}</span>
                </div>
                {description && (
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      描述：
                    </span>
                    <span>{description}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* /P3-5 step content */}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {step > 1 && (
            <button
              onClick={handleBack}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--color-text-primary)'
              }}
            >
              上一步
            </button>
          )}
          {step < TOTAL_STEPS ? (
            /* P2-2: disable next when current step is invalid */
            <button
              onClick={handleNext}
              disabled={step === 1 ? !isStep1Valid || !!nameError : !isStep2Valid}
              aria-disabled={step === 1 ? !isStep1Valid || !!nameError : !isStep2Valid}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: (step === 1 ? !isStep1Valid || !!nameError : !isStep2Valid)
                  ? 'var(--color-border)'
                  : 'var(--color-blue)',
                color: 'var(--color-text-inverse)',
                fontSize: 13,
                fontWeight: 500,
                cursor: (step === 1 ? !isStep1Valid || !!nameError : !isStep2Valid)
                  ? 'default'
                  : 'pointer',
                opacity: (step === 1 ? !isStep1Valid || !!nameError : !isStep2Valid) ? 0.6 : 1
              }}
            >
              下一步 <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating || !isStep1Valid || !!nameError}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background:
                  !isStep1Valid || !!nameError || creating
                    ? 'var(--color-border)'
                    : 'var(--color-green, #1e7a4d)',
                color: 'var(--color-text-inverse)',
                fontSize: 13,
                fontWeight: 500,
                cursor: !isStep1Valid || !!nameError || creating ? 'default' : 'pointer'
              }}
            >
              {creating ? (
                '创建中...'
              ) : (
                <>
                  创建知识库 <ArrowRight size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
