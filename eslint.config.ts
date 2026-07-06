import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'src/**/*.js',
      'src/**/*.mjs',
      'src/**/*.cjs',
      'src/renderer/**/*.js',
      // Agent vetted bash 脚本 (CommonJS require, 不走 TS 规则)
      'server/tools/**',
      'tests/e2e-vault/**',
    ]
  },

  // 基础 ESLint 推荐规则
  ...tseslint.configs.recommended,

  // 主进程 + 预加载脚本（排除 .js 文件，避免类型规则解析失败）
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    ignores: ['src/main/**/*.js', 'src/preload/**/*.js', 'src/shared/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // === 类型安全 ===
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',

      // === 代码质量 ===
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports'
      }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // === 安全 ===
      '@typescript-eslint/no-implied-eval': 'error',
      'no-new-func': 'error',

      // === 代码风格 ===
      'no-console': 'off',
      'prefer-const': 'error',

      // === 错误处理 ===
      '@typescript-eslint/only-throw-error': 'error'
    }
  },

  // 渲染进程（React）
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx', 'src/shared/**/*.ts'],
    ignores: ['src/renderer/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      // === React Hooks ===
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true
      }],

      // === 类型安全（window.api 未类型化 + D3 动态类型，降级为 off） ===
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',

      // === 代码质量 ===
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports'
      }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',

      // === 安全 ===
      '@typescript-eslint/no-implied-eval': 'error',
      'no-new-func': 'error',

      // === 代码风格 ===
      'no-console': 'off',
      'prefer-const': 'error',

      // === 错误处理 ===
      '@typescript-eslint/only-throw-error': 'error'
    }
  },

  // 测试文件 - 放宽部分规则
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test-setup.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-console': 'off'
    }
  },

  // App.tsx - disable react-refresh warning
  {
    files: ['src/renderer/App.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },

  // MermaidTest.tsx exports non-component utilities
  {
    files: ['src/renderer/components/MermaidTest.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },

  // AIBanner.tsx exports non-component utilities (showAIBanner)
  {
    files: ['src/renderer/components/AIBanner.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  }
)
