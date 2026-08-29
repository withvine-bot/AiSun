#!/usr/bin/env node
/**
 * index.html 과 그 자산을 단일 HTML 파일로 묶는다.
 *   node tools/bundle.mjs [출력경로]
 *
 * 결과물은 파일 하나로 완결되어 어디서든 열리고(더블클릭·USB·메일 첨부),
 * Artifact 로 그대로 게시할 수도 있다. 그래서 <!doctype>·<html>·<head>·<body>를
 * 쓰지 않는다 — 브라우저는 이 형태를 그대로 렌더하고, Artifact 는 자체 골격으로 감싼다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] || 'dist/aisun.html');
const TITLE = '어문회 1급 합격플랜';

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

/** 인라인 스크립트 안에서 </script> 가 나오면 태그가 조기에 닫힌다. */
const safeJs = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

const parts = [];
const push = (s) => parts.push(s);

push(`<title>${TITLE}</title>`);

// <link rel="stylesheet" href="..."> → <style>
for (const m of html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)) {
  push(`<style>\n${readFileSync(resolve(ROOT, m[1]), 'utf8').trim()}\n</style>`);
}

// index.html 의 <body> 내용에서 <script src> 를 걷어낸 마크업
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
const body = (bodyMatch ? bodyMatch[1] : html)
  .replace(/<script[^>]+src="[^"]+"[^>]*><\/script>\s*/g, '')
  .trim();
push(body);

// <script src="..."> → 인라인 (index.html 에 적힌 순서 그대로여야 한다)
let bytes = 0;
for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g)) {
  const code = readFileSync(resolve(ROOT, m[1]), 'utf8');
  bytes += code.length;
  push(`<script>\n${safeJs(code)}\n</script>`);
}

const out = parts.join('\n\n') + '\n';
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');

// 한글·한자는 UTF-8 에서 3바이트라 문자 수가 아니라 바이트로 재야 한다
const size = Buffer.byteLength(out, 'utf8');
const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(`생성: ${OUT.replace(ROOT + '/', '')}  (${kb(size)})`);
if (size > 16 * 1024 * 1024) console.error('경고: 16MB 를 넘으면 Artifact 로 게시할 수 없다.');
