/**
 * buildFeatures.ts — 开源版专用
 *
 * 开源版只保留 vault 主功能 + Skill.md 插件。
 * Pro 专属（self-agent、bubble、aiChat 浮窗）不包含。
 * 此文件保留是为了让其它代码中的 `if (IS_PRO)` 守卫仍然能编译通过（守卫永远为 false）。
 */
export const IS_PRO = false
export const IS_OPEN_SOURCE = true
