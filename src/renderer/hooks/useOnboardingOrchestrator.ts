/**
 * useOnboardingOrchestrator — vault 创建后的引导流程控制
 *
 * Fires once per vault: 引导用户打开使用说明文档。
 */
import { useEffect, useRef } from 'react'

export function useOnboardingOrchestrator(
  vaultPath: string | null,
  showOnboarding: boolean,
  onOpenAIChat: (msg: string, autoSend?: boolean) => void
): void {
  const firedRef = useRef(false)

  useEffect(() => {
    if (!vaultPath || !showOnboarding) return
    const key = 'onboarding_ai_shown_' + vaultPath
    if (sessionStorage.getItem(key) || firedRef.current) return
    firedRef.current = true
    sessionStorage.setItem(key, '1')
    const name = vaultPath.split('/').pop() ?? '新知识库'
    setTimeout(() => {
      onOpenAIChat(
        `你好！我是 ${name} 的知识管理助手

请先把你的第一批文件拖进来（文档、笔记、网页、图片都可以），我会：

1. 阅读并分析所有文件内容
2. 自动建议合适的目录结构
3. 为每个领域设计 Schema 规范
4. 整理为结构化 Wiki 页面

拖拽文件到窗口就可以开始`,
        true
      )
    }, 600)
  }, [vaultPath, showOnboarding, onOpenAIChat])
}
