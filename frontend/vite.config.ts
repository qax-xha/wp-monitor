import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import pages from 'vite-plugin-pages';

/**
 * Vite 配置文件
 *
 * @see https://v8.vite.dev/config/
 */
export default defineConfig(({ mode }) => {
  /**
   * 加载环境变量，第三个参数 `''` 表示加载所有前缀（不限于 VITE_），
   * 用于读取仅 Vite 配置层使用的变量（不会被注入客户端代码）。
   *
   * @see https://v8.vite.dev/guide/api-javascript.html#loadenv
   * @see https://v8.vite.dev/guide/env-and-mode.html
   */
  const env = loadEnv(mode, process.cwd(), '');

  return {
    /**
     * 模块路径别名，将 `@/` 映射到 `src/` 目录。
     *
     * @see https://v8.vite.dev/config/shared-options.html#resolve-alias
     */
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    /**
     * Vite 插件列表。
     *
     * - codeInspectorPlugin: 开发环境 DOM 元素源码定位
     * - react: React JSX 编译与 HMR
     * - vite-plugin-pages: 基于文件系统的自动路由
     *
     * @see https://v8.vite.dev/config/shared-options.html#plugins
     * @see https://v8.vite.dev/guide/api-plugin.html
     */
    plugins: [
      codeInspectorPlugin({ bundler: 'vite' }),
      react(),
      pages({
        dirs: [{ dir: 'src/views/pages', baseRoute: '' }],
        exclude: ['**/components/**'],
      }),
    ],

    /**
     * 开发服务器配置。
     *
     * @see https://v8.vite.dev/config/server-options.html
     */
    server: {
      /**
       * 开发服务器端口，通过环境变量 VITE_DEV_SERVER_PORT 配置，
       * 未设置时回退到 5173。
       *
       * NOTE: 请在 .env.local 文件中设置，不要在这里修改。
       */
      port: Number(env.VITE_DEV_SERVER_PORT) || 5173,

      /**
       * API 代理，将 `/api` 请求转发到后端服务。
       * 目标地址通过环境变量 VITE_PROXY_TARGET 配置，
       * 未设置时回退到默认值。
       *
       * @see https://v8.vite.dev/config/server-options.html#server-proxy
       *
       * NOTE: 请在 .env.local 文件中设置 VITE_PROXY_TARGET，不要在这里修改配置文件。
       */
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'https://monitor.alpha.warpparse.com',
          changeOrigin: true,
        },
      },
    },
  };
});
