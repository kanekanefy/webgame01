#!/usr/bin/env node
// gen-art.mjs — 战国大名 AI 模拟器：事件插画批量生成（agnes-ai image-2.1-flash）
//
// 两段式美术管线的「铺量」环节（见 design/art/art-pipeline.md §1）：
// 风格锚点 = design/art/concept/court-audience-bg.png，下面每条 prompt 复述其风格参数三件套
// （色温 / 媒介 / 构图）+ 换主体，以保持全套插画风格对齐。
//
// 运行：bash -c 'source secrets/keys.env && node tools/gen-art.mjs'
//   - 读 process.env.AGNES_API_KEY（绝不入库；密钥只在 gitignored 的 secrets/keys.env）
//   - 并发 ≤3，每张失败重试 1 次
//   - 生成后立即下载临时 GCS URL 到本地落库（test bucket 会失效，不可直链）
//   - 输出目录：apps/web/public/assets/events/<name>.png

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.AGNES_API_KEY;
if (!API_KEY) {
  console.error('缺少 AGNES_API_KEY。请先：bash -c \'source secrets/keys.env && node tools/gen-art.mjs\'');
  process.exit(1);
}

const API_URL = 'https://apihub.agnes-ai.com/v1/images/generations';
const MODEL = 'agnes-image-2.1-flash';
const MAX_CONCURRENCY = 3;
const MIN_BYTES = 10 * 1024; // <10KB 视为错误页/失败

// 风格锚点复述串（court-audience-bg.png 确立）——所有 prompt 共用，保持一致性
const STYLE =
  'Japanese Sengoku-era (1560), ink-wash painting aesthetic mixed with painterly realism, ' +
  'warm candle/lantern amber light, moody dark tones, cinematic, refined, ' +
  'wide cinematic 16:9 composition, no text, no letters';

// name → 场景英文描述（最终 prompt = 描述 + ', ' + STYLE）
const SHOTS = [
  {
    name: 'ikki',
    scene:
      'a peasant uprising (ikki) sweeping across a rural Japanese province, angry farmers with bamboo spears and torches marching at dusk, smoke rising from a burning manor in the distance, chaotic and tense',
  },
  {
    name: 'festival',
    scene:
      'a village shrine festival (matsuri) at night, paper lanterns strung between wooden stalls, townsfolk in simple robes dancing and praying, a small portable shrine, joyful and calming mood that eases the populace',
  },
  {
    name: 'irrigation',
    scene:
      'peasants digging an irrigation channel to bring water to terraced rice paddies, wooden water wheels and earthen dikes, farmers cooperating with hoes and baskets under a soft sky, industrious and hopeful',
  },
  {
    name: 'levy',
    scene:
      'a levy of foot soldiers (ashigaru) being mustered, a column of conscripted commoners receiving spears and simple armor in a castle courtyard, an officer inspecting the ranks, disciplined formation',
  },
  {
    name: 'tax',
    scene:
      'the autumn rice tax (nengu) being collected and stored, peasants carrying bales of harvested rice into a granary, officials tallying on scrolls, golden rice sheaves stacked high, bountiful harvest mood',
  },
  {
    name: 'border',
    scene:
      'a tense provincial border, a mountain pass with a wooden watch fort and a lit signal beacon (noroshi) on a ridge, distant enemy banners massing beyond the frontier, ominous and watchful',
  },
  {
    name: 'retainer-strife',
    scene:
      'discord among retainers, two samurai vassals in kamishimo arguing heatedly across a war council chamber, others looking on uneasily, hands near sword hilts, a low dais in the background, charged tense atmosphere',
  },
  {
    name: 'weather',
    scene:
      'a violent storm and natural calamity striking the domain, driving rain and wind lashing rice fields, bending pines and flooding paddies, dark turbulent clouds over a darkened village, foreboding',
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'apps', 'web', 'public', 'assets', 'events');

async function postWithTimeout(url, opts, ms = 60000) {
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
  const dl = await postWithTimeout(imgUrl, { method: 'GET' }, 60000);
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
    // 退避后重试 1 次
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
  console.log(`生成 ${SHOTS.length} 张事件插画 -> ${OUT_DIR}  (并发 ${MAX_CONCURRENCY})\n`);
  const results = await runPool(SHOTS, MAX_CONCURRENCY);
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`\n完成：${ok.length}/${SHOTS.length} 成功，${fail.length} 失败`);
  if (fail.length) {
    console.log('失败项：', fail.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('致命错误：', e);
  process.exit(1);
});
