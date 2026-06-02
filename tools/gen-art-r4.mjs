#!/usr/bin/env node
// gen-art-r4.mjs — 战国大名 AI 模拟器：R4 扩展事件/战斗插画批量生成（agnes-ai image-2.1-flash）
//
// 复用 gen-art.mjs 的管线（并发≤3、失败重试1次、立即下载、<10KB 视为失败），
// 为 R4 新增的 fact kind 补 16 张事件插画，风格仍锚定「朝议厅」。
//
// 运行：bash -c 'source secrets/keys.env && node tools/gen-art-r4.mjs'
//   - 读 process.env.AGNES_API_KEY（绝不入库；密钥只在 gitignored 的 secrets/keys.env）
//   - 输出目录：apps/web/public/assets/events/<name>.png（后续由 sips 压成 .jpg）

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('缺少 AGNES_API_KEY。请先：bash -c \'source secrets/keys.env && node tools/gen-art-r4.mjs\'');
  process.exit(1);
}

const API_URL = 'https://apihub.agnes-ai.com/v1/images/generations';
const MODEL = 'agnes-image-2.1-flash';
const MAX_CONCURRENCY = 3;
const MIN_BYTES = 10 * 1024; // <10KB 视为错误页/失败

// 统一风格锚点（每条 prompt 都带）
const STYLE =
  'Japanese Sengoku-era (1560), ink-wash painting aesthetic mixed with painterly realism, ' +
  'warm candle/lantern amber light, moody dark tones, cinematic, no text, no letters';

// name → 场景英文要点（最终 prompt = 描述 + ', ' + STYLE）
const SHOTS = [
  { name: 'battle_win', scene: 'victorious samurai cavalry charging with banners at dawn, triumphant' },
  { name: 'battle_lose', scene: 'defeated samurai retreating, broken banners, dusk, somber' },
  { name: 'conquer', scene: 'a daimyo on horseback entering a surrendered castle gate, victory procession' },
  { name: 'defend_win', scene: 'castle defenders on ramparts repelling a siege, arrows and spears, holding the wall' },
  { name: 'defend_lose', scene: 'a castle breached and burning, defenders falling back, smoke' },
  { name: 'betrayal', scene: 'a treacherous retainer leaving a castle at night with armed men and torches, tense' },
  { name: 'recruit', scene: 'a ronin samurai kneeling in a hall offering his sword in service to the lord' },
  { name: 'court', scene: 'an imperial court envoy from Kyoto presenting a rank scroll to the daimyo, gold refinement' },
  { name: 'merchant_gift', scene: 'a wealthy Sakai merchant presenting coffers of rice and coin to the lord' },
  { name: 'plague', scene: 'a stricken village, somber physicians and shrouded figures, dim' },
  { name: 'flood', scene: 'flooded rice paddies in heavy rain, peasants repairing earthen dikes' },
  { name: 'bumper', scene: 'an abundant golden rice harvest, peasants reaping sheaves, autumn warmth' },
  { name: 'negotiate', scene: "two clans' envoys exchanging documents at a formal diplomatic meeting" },
  { name: 'develop', scene: 'peasants opening new farmland with hoes and oxen, clearing wilderness' },
  { name: 'omen', scene: 'an auspicious comet/aurora over a castle at night, mystical, reverent' },
  { name: 'freeform', scene: "a quiet scene of daily life in a daimyo's residence, retainers attending, candlelit" },
];

// 可选：ONLY=逗号分隔的 name 子集（用于只重跑失败项），并发降为 1 更稳。
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const SELECTED = ONLY.length ? SHOTS.filter((s) => ONLY.includes(s.name)) : SHOTS;
const CONCURRENCY = ONLY.length ? 1 : MAX_CONCURRENCY;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'apps', 'web', 'public', 'assets', 'events');

async function postWithTimeout(url, opts, ms = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function generateOne(shot) {
  const prompt = `${shot.scene}, ${STYLE}`;
  const res = await postWithTimeout(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, prompt, n: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`generations HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const imgUrl = json?.data?.[0]?.url;
  if (!imgUrl) throw new Error(`响应缺少 data[0].url: ${JSON.stringify(json).slice(0, 200)}`);

  // 立即下载落库（临时 GCS URL 会失效）
  const dl = await postWithTimeout(imgUrl, { method: 'GET' }, 120000);
  if (!dl.ok) throw new Error(`下载 HTTP ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length < MIN_BYTES) throw new Error(`下载内容过小 (${buf.length}B)，疑似错误页`);

  const outPath = resolve(OUT_DIR, `${shot.name}.png`);
  await writeFile(outPath, buf);
  const st = await stat(outPath);
  return { name: shot.name, path: outPath, bytes: st.size };
}

async function withRetry(shot) {
  try {
    return await generateOne(shot);
  } catch (e1) {
    console.warn(`[${shot.name}] 第一次失败：${e1.message} — 重试中`);
    await new Promise((r) => setTimeout(r, 2000));
    return await generateOne(shot);
  }
}

// 简单并发池（≤ MAX_CONCURRENCY）
async function runPool(shots, limit) {
  const results = [];
  const queue = [...shots];
  async function worker() {
    while (queue.length) {
      const shot = queue.shift();
      const started = Date.now();
      try {
        const r = await withRetry(shot);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`OK   ${r.name.padEnd(16)} ${(r.bytes / 1024).toFixed(0)}KB  ${secs}s  -> ${r.path}`);
        results.push({ ...r, ok: true });
      } catch (e) {
        console.error(`FAIL ${shot.name.padEnd(16)} ${e.message}`);
        results.push({ name: shot.name, ok: false, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`生成 ${SELECTED.length} 张 R4 事件插画 -> ${OUT_DIR}  (并发 ${CONCURRENCY})\n`);
  const results = await runPool(SELECTED, CONCURRENCY);
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`\n完成：${ok.length}/${SELECTED.length} 成功，${fail.length} 失败`);
  if (fail.length) {
    console.log('失败项：', fail.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('致命错误：', e);
  process.exit(1);
});
