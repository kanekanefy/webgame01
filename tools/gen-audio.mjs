#!/usr/bin/env node
/**
 * gen-audio.mjs — 用 ElevenLabs Sound Effects API 生成「战国大名 AI 模拟器」的 UI/环境音效。
 *
 * 运行（务必先 source 密钥，密钥绝不入库）：
 *   bash -c 'source secrets/keys.env && node tools/gen-audio.mjs'
 *
 * 可选环境变量：
 *   AUDIO_OUT_DIR   输出目录（默认 apps/web/public/audio）
 *   AUDIO_FORCE=1   覆盖已存在且 >5KB 的文件（默认跳过已生成的，省额度）
 *
 * 行为：
 *   - 读取 process.env.ELEVENLABS_API_KEY
 *   - 并发 ≤2，每条失败重试 1 次
 *   - 响应为 audio/mpeg 二进制流，直接写成 .mp3
 *   - 打印每条结果（OK/SKIP/FAIL + 大小）
 *
 * 注意：不在任何地方打印或写入密钥。
 */

import { writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.elevenlabs.io/v1/sound-generation";
const API_KEY = process.env.ELEVENLABS_API_KEY;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = process.env.AUDIO_OUT_DIR
  ? resolve(process.env.AUDIO_OUT_DIR)
  : join(REPO_ROOT, "apps/web/public/audio");
const FORCE = process.env.AUDIO_FORCE === "1";

const CONCURRENCY = 2;
const RETRIES = 1;
const MIN_VALID_BYTES = 5 * 1024;

/**
 * 音效清单。loop 仅用于环境音（已验证 API 接受该参数）。
 * @type {{name:string,text:string,duration:number,loop?:boolean}[]}
 */
const MANIFEST = [
  // ---- UI 音效（短）----
  {
    name: "click",
    text: "a single soft wooden clack, like a Japanese hyoshigi wood block, short",
    duration: 2,
  },
  {
    name: "advance",
    text: "a single deep taiko drum hit with subtle reverb",
    duration: 3,
  },
  {
    name: "coin",
    text: "coins and rice grains shifting in a wooden box, brief, soft",
    duration: 2,
  },
  {
    name: "reject",
    text: "a low ominous shakuhachi flute note, short, tense, dissonant",
    duration: 3,
  },
  {
    name: "victory",
    text: "triumphant short Japanese taiko drums and shakuhachi flute fanfare, celebratory",
    duration: 5,
  },
  {
    name: "defeat",
    text: "a slow mournful single Buddhist temple bell toll fading into silence",
    duration: 5,
  },
  // ---- 环境音（循环）----
  {
    name: "ambient",
    text: "quiet Japanese castle courtyard at night, distant koto, gentle wind, crickets, calm loopable ambience",
    duration: 10,
    loop: true,
  },
];

/**
 * 生成单个音效并写入磁盘。
 * @param {{name:string,text:string,duration:number,loop?:boolean}} item
 * @returns {Promise<{name:string,status:string,bytes:number}>}
 */
async function generateOne(item) {
  const outPath = join(OUT_DIR, `${item.name}.mp3`);

  if (!FORCE) {
    try {
      const s = await stat(outPath);
      if (s.size > MIN_VALID_BYTES) {
        return { name: item.name, status: "SKIP (exists)", bytes: s.size };
      }
    } catch {
      /* 不存在，继续生成 */
    }
  }

  /** @type {Record<string, unknown>} */
  const body = {
    text: item.text,
    duration_seconds: item.duration,
    prompt_influence: 0.3,
  };
  if (item.loop) body.loop = true;

  let lastErr = "";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = `HTTP ${res.status} ${txt.slice(0, 200)}`;
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < MIN_VALID_BYTES) {
        lastErr = `too small (${buf.byteLength} bytes)`;
        continue;
      }

      await writeFile(outPath, buf);
      return { name: item.name, status: "OK", bytes: buf.byteLength };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  return { name: item.name, status: `FAIL (${lastErr})`, bytes: 0 };
}

/**
 * 简单并发池（≤ CONCURRENCY）。
 * @param {typeof MANIFEST} items
 */
async function runPool(items) {
  const queue = [...items];
  /** @type {{name:string,status:string,bytes:number}[]} */
  const results = [];

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const r = await generateOne(item);
      results.push(r);
      const kb = r.bytes ? `${(r.bytes / 1024).toFixed(1)}KB` : "-";
      console.log(`  [${r.status.startsWith("OK") ? "OK" : r.status.startsWith("SKIP") ? "SKIP" : "FAIL"}] ${item.name}.mp3  ${kb}  ${r.status.startsWith("FAIL") ? r.status : ""}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

async function main() {
  if (!API_KEY) {
    console.error("ERROR: 未找到 ELEVENLABS_API_KEY。请先 `source secrets/keys.env`。");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`生成 ${MANIFEST.length} 个音效 -> ${OUT_DIR}\n`);

  const results = await runPool(MANIFEST);

  const ok = results.filter((r) => r.status.startsWith("OK")).length;
  const skip = results.filter((r) => r.status.startsWith("SKIP")).length;
  const fail = results.filter((r) => r.status.startsWith("FAIL"));

  console.log(`\n完成：OK=${ok} SKIP=${skip} FAIL=${fail.length}`);
  if (fail.length) {
    console.log("失败项：", fail.map((f) => f.name).join(", "));
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("未捕获错误：", err);
  process.exit(1);
});
