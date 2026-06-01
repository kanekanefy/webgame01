import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // 复用根 wrangler 配置：DO 绑定 / migrations / nodejs_compat 在测试中一致生效。
        wrangler: { configPath: '../../wrangler.jsonc' },
      },
    },
  },
});
