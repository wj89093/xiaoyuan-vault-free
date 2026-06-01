import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      'node_modules/',
      'out/',
      '**/*.d.ts',
      'src/test-setup.ts',
      // agent-eval.test.ts 是“未来待实现”的验收清单，不是回归测试
      // 跑默认 `npm test` 时跳过，需要检查时手动跑: npx vitest run src/test/agent-eval.test.ts
      'src/test/agent-eval.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'out/', '**/*.d.ts', 'src/test-setup.ts', 'src/test/agent-eval.test.ts']
    }
  }
})
