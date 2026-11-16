// 선택 기능: Claude 로 공시 원문을 한국어 요약한다.
// 켜는 조건: AI_SUMMARY=1 + Anthropic 자격증명(ANTHROPIC_API_KEY 등) + `npm install` 로 SDK 설치.
// 원문은 www.sec.gov 에서 받으므로 SEC_USER_AGENT 에 연락처를 넣어야 차단되지 않는다.
import { getText, limiter } from './http.mjs';

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
// 비용 상한을 위해 원문 앞부분만 보낸다. 잘렸다는 사실은 프롬프트에 알려 준다.
const MAX_CHARS = Number(process.env.AI_MAX_CHARS || 60000);
const AI_CATS = new Set((process.env.AI_CATEGORIES || 'event,earnings').split(','));

const SYSTEM = `당신은 미국 SEC 공시를 한국 개인투자자에게 설명하는 애널리스트입니다.
공시 원문을 읽고 아래 형식으로만 답하세요.

판단: 호재 | 악재 | 중립 중 하나
요약: 한국어 2~3문장. 무엇을 발표했는지와 핵심 숫자(금액, 주당 가격, 비율, 날짜)를 원문에 있는 그대로 담습니다.

원문에 없는 내용은 쓰지 않습니다. 주가 전망이나 매수·매도 권유는 하지 않습니다. 판단은 기존 주주 입장에서 공시 내용 자체가 갖는 성격만 봅니다. 근거가 분명하지 않으면 중립으로 둡니다.`;

export function htmlToText(html) {
  return html
    .replace(/<(script|style|ix:header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n\s*/g, '\n').trim();
}

export function parseAnswer(text) {
  const verdict = /판단\s*[:：]\s*(호재|악재|중립)/.exec(text)?.[1] || '중립';
  const summary = (/요약\s*[:：]\s*([\s\S]+)/.exec(text)?.[1] || '').trim();
  if (!summary) return null;
  return { summary, signal: verdict === '호재' ? 1 : verdict === '악재' ? -1 : 0 };
}

export async function createSummarizer() {
  if (process.env.AI_SUMMARY !== '1') return null;
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
  catch { console.warn('[ai] @anthropic-ai/sdk 가 없습니다. `npm install` 후 다시 시작하세요. AI 요약을 끕니다.'); return null; }
  const client = new Anthropic();
  const lim = limiter(2);
  let disabled = false;

  return (f) => lim(async () => {
    if (disabled || !f.docUrl || !f.ticker || !AI_CATS.has(f.cat)) return null;
    let text;
    try { text = htmlToText(await getText(f.docUrl, { sec: true })); }
    catch (e) { console.warn(`[ai] 원문 수신 실패 ${f.id}: ${e.message}`); return null; }
    if (text.length < 200) return null;
    const cut = text.length > MAX_CHARS;
    const body = cut ? text.slice(0, MAX_CHARS) : text;
    try {
      // 안전 분류기가 거절하면 서버 측에서 다른 모델로 이어받도록 fallbacks 를 켠다.
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `회사: ${f.name} (${f.ticker})\n서식: ${f.form}${f.tags.length ? `\n8-K 항목: ${f.tags.join(', ')}` : ''}\n` +
            (cut ? `※ 원문이 길어 앞 ${MAX_CHARS.toLocaleString()}자만 제공합니다. 제공된 범위 안에서만 요약하세요.\n` : '') +
            `\n<공시원문>\n${body}\n</공시원문>`,
        }],
      });
      if (res.stop_reason === 'refusal') return null;
      const out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return parseAnswer(out);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        disabled = true;
        console.error('[ai] 인증 실패. AI 요약을 끕니다:', e.message);
      } else if (e instanceof Anthropic.RateLimitError) {
        console.warn('[ai] 요청 한도 초과, 이번 건은 건너뜁니다.');
      } else if (e instanceof Anthropic.APIError) {
        console.warn(`[ai] API 오류 ${e.status}: ${e.message}`);
      } else {
        console.warn('[ai] 요약 실패:', e.message);
      }
      return null;
    }
  });
}
