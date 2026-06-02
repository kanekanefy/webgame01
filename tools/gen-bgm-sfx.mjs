#!/usr/bin/env node
/**
 * gen-bgm-sfx.mjs — 用 ElevenLabs 批量生成「战国大名 AI 模拟器」的背景音乐(BGM)与事件音效(SFX)。
 *
 * 运行（务必先 source 密钥，密钥绝不入库）：
 *   bash -c 'source secrets/keys.env && node tools/gen-bgm-sfx.mjs'
 *
 * 可选环境变量：
 *   AUDIO_OUT_DIR   输出目录（默认 apps/web/public/audio）
 *   AUDIO_FORCE=1   覆盖已存在且达标的文件（默认跳过已生成的，省额度）
 *
 * 两个端点：
 *   - BGM: POST /v1/music                { prompt, music_length_ms }            响应 mp3 二进制
 *   - SFX: POST /v1/sound-generation     { text, duration_seconds, prompt_influence } 响应 mp3 二进制
 *
 * 行为：低并发 ≤2，每条失败重试 1 次；BGM 超时 120s、SFX 超时 60s；写成 .mp3。
 * 注意：不在任何地方打印或写入密钥。
 */

import { writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MUSIC_URL = "https://api.elevenlabs.io/v1/music";
const SFX_URL = "https://api.elevenlabs.io/v1/sound-generation";
const API_KEY = process.env.ELEVENLABS_API_KEY;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = process.env.AUDIO_OUT_DIR
  ? resolve(process.env.AUDIO_OUT_DIR)
  : join(REPO_ROOT, "apps/web/public/audio");
const FORCE = process.env.AUDIO_FORCE === "1";

const CONCURRENCY = 2;
const RETRIES = 1;
const MUSIC_TIMEOUT_MS = 120_000;
const SFX_TIMEOUT_MS = 60_000;
const MIN_BGM_BYTES = 300 * 1024;
const MIN_SFX_BYTES = 5 * 1024;

/**
 * 资产清单。
 * kind: "bgm" -> /v1/music（music_length_ms）；"sfx" -> /v1/sound-generation（duration_seconds）。
 * @type {{name:string,kind:"bgm"|"sfx",prompt:string,lengthMs?:number,duration?:number}[]}
 */
const MANIFEST = [
  // ---- BGM（Music API，循环用）----
  {
    name: "bgm-peace",
    kind: "bgm",
    lengthMs: 95000,
    prompt:
      "Calm meditative traditional Japanese Sengoku-era ambient music for a strategy game governance screen. Solo shakuhachi flute and koto with sparse plucked notes, slow, peaceful, spacious, NO percussion, soft and unobtrusive, gentle reverb, suitable for seamless background looping, ends softly and quietly.",
  },
  {
    name: "bgm-war",
    kind: "bgm",
    lengthMs: 70000,
    prompt:
      "Tense restrained traditional Japanese war music. Low taiko drums, deep shakuhachi, martial and ominous but steady and not chaotic, slow building, suitable for looping during military campaigns.",
  },
  // ---- SFX（Sound Effects API）----
  {
    name: "triumph",
    kind: "sfx",
    duration: 3,
    prompt:
      "short triumphant Japanese taiko drum flourish with a single victory horn, celebratory",
  },
  {
    name: "defeat-low",
    kind: "sfx",
    duration: 3,
    prompt: "a single somber low Japanese war drum hit slowly fading, defeat",
  },
  {
    name: "battle",
    kind: "sfx",
    duration: 3,
    prompt: "brief clash of katana swords with a distant war cry",
  },
  {
    name: "betrayal",
    kind: "sfx",
    duration: 3,
    prompt: "ominous low gong strike with tense dark night atmosphere",
  },
  {
    name: "recruit",
    kind: "sfx",
    duration: 3,
    prompt:
      "a respectful rising koto pluck phrase, a samurai retainer pledging service, gentle",
  },
  {
    name: "court",
    kind: "sfx",
    duration: 3,
    prompt:
      "elegant Japanese gagaku court music sting, sho mouth-organ chord and a soft bell, refined imperial",
  },
  {
    name: "omen",
    kind: "sfx",
    duration: 3,
    prompt: "mystical shimmering ethereal chime, auspicious omen",
  },
  {
    name: "disaster",
    kind: "sfx",
    duration: 3,
    prompt: "somber ominous low drone swell, calamity and dread",
  },
  {
    name: "ikki",
    kind: "sfx",
    duration: 3,
    prompt: "an angry peasant crowd murmur with a clanging alarm bell, uprising",
  },
  {
    name: "festival",
    kind: "sfx",
    duration: 3,
    prompt:
      "lively Japanese matsuri festival with bamboo flute and small taiko drums, cheerful",
  },
  {
    name: "build",
    kind: "sfx",
    duration: 3,
    prompt:
      "brief construction sounds of hammering wood and digging earth, craftsmen at work",
  },
];

/**
 * 生成单个资产并写入磁盘。
 * @param {(typeof MANIFEST)[number]} item
 * @returns {Promise<{name:string,status:string,bytes:number}>}
 */
async function generateOne(item) {
  const outPath = join(OUT_DIR, `${item.name}.mp3`);
  const minBytes = item.kind === "bgm" ? MIN_BGM_BYTES : MIN_SFX_BYTES;
  const timeoutMs = item.kind === "bgm" ? MUSIC_TIMEOUT_MS : SFX_TIMEOUT_MS;
  const url = item.kind === "bgm" ? MUSIC_URL : SFX_URL;

  if (!FORCE) {
    try {
      const s = await stat(outPath);
      if (s.size > minBytes) {
        return { name: item.name, status: "SKIP (exists)", bytes: s.size };
      }
    } catch {
      /* 不存在，继续生成 */
    }
  }

  const body =
    item.kind === "bgm"
      ? { prompt: item.prompt, music_length_ms: item.lengthMs }
      : {
          text: item.prompt,
          duration_seconds: item.duration,
          prompt_influence: 0.4,
        };

  let lastErr = "";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = `HTTP ${res.status} ${txt.slice(0, 200)}`;
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < minBytes) {
        lastErr = `too small (${buf.byteLength} bytes, need >${minBytes})`;
        continue;
      }

      await writeFile(outPath, buf);
      return { name: item.name, status: "OK", bytes: buf.byteLength };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
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
      const tag = r.status.startsWith("OK")
        ? "OK"
        : r.status.startsWith("SKIP")
          ? "SKIP"
          : "FAIL";
      console.log(
        `  [${tag}] ${item.name}.mp3 (${item.kind})  ${kb}  ${r.status.startsWith("FAIL") ? r.status : ""}`,
      );
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
  console.log(`生成 ${MANIFEST.length} 个资产 -> ${OUT_DIR}\n`);

  const results = await runPool(MANIFEST);

  const ok = results.filter((r) => r.status.startsWith("OK")).length;
  const skip = results.filter((r) => r.status.startsWith("SKIP")).length;
  const fail = results.filter((r) => r.status.startsWith("FAIL"));

  console.log(`\n完成：OK=${ok} SKIP=${skip} FAIL=${fail.length}`);
  if (fail.length) {
    console.log("失败项：", fail.map((f) => `${f.name} ${f.status}`).join(" | "));
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("未捕获错误：", err);
  process.exit(1);
});
