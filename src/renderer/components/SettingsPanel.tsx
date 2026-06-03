/**
 * SettingsPanel — 设置面板外壳
 *
 * P1-2026-06-02 (backport from Pro 仓): 拆 15 useState → 3 个独立子组件。
 * 父组件只管 FloatingPanel wrapper + 3 个 section 装配,自身无 state。
 * 
 * 包含:
 * - ThemeSection: 主题模式（light/dark/system）
 * - AuthSection: 晓园账户登录/登出
 * - SkillSection: 用户 Skill CRUD（v1.4 保留，AGENTS.md 取代协议部分）
 */
import { memo, type JSX } from 'react'
import { Settings } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'
import { ThemeSection, SkillSection } from './SettingsSections'

interface SettingsPanelProps {
  onClose: () => void
  /** Free 仓 v1.4 暂未使用 vault path/file select,保留接口便于 Pro 对齐 */
  _vaultPath?: string | null
  _onSelectFile?: (path: string) => void
}

export const SettingsPanel = memo(function SettingsPanel({
  onClose,
  _vaultPath,
  _onSelectFile
}: SettingsPanelProps): JSX.Element {
  return (
    <FloatingPanel
      title="设置"
      icon={<Settings size={15} />}
      onClose={onClose}
      width={400}
      height={520}
      bottomOffset={80}
    >
      <div className="settings-body">
        <ThemeSection />
        <SkillSection />
      </div>
    </FloatingPanel>
  )
})
