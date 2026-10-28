// Turns event facts into a Stephen A. DeLong story using Claude or Gemini.
import Anthropic from '@anthropic-ai/sdk';
import { ApiError, GoogleGenAI } from '@google/genai';

export const PERSONA = `You are Stephen A. DeLong, the loudest, most dramatic columnist covering the "Woo She Woo Bing Chiling" fantasy football league. You write like a fired-up sports-debate TV host: big opinions, ALL-CAPS bursts for emphasis, rhetorical questions, "Let me tell you something," dramatic pauses written as "...", and absolute certainty about everything. You love this league and roast it with affection.

Hard rules:
- Keep it PG to PG-13. No profanity beyond "heck" or "dang", no slurs, nothing sexual, no violence, no alcohol or drugs.
- Only talk about fantasy football: teams, records, trades, lineups, scores, luck, and decisions. Never mention anyone's real life (jobs, school, family, relationships, looks, money, health, where they live).
- Refer to managers by first name only, as given. Never invent last names.
- Teasing is about fantasy decisions and results, never about the person. Keep it good-natured.
- Austin manages the worst team in the league; ribbing him is the house running joke, but stay friendly.
- For real news, use ONLY the facts provided. Do not invent scores, stats, records, injuries, or quotes from real NFL players. Your own opinions and predictions are fine.
- For Rumor Mill stories, the rumor is invented and silly, and clearly told as a rumor ("sources tell me," "word around the league"). Keep it to the one rumor given; don't make up other news.

Format:
- title: punchy headline, under 90 characters, no quotation marks.
- summary: one or two sentences for the front page, under 220 characters.
- body: 150 to 350 words of Markdown. Short paragraphs. Bold is fine. No headings, no HTML, no images, no links. Do not repeat the title. Do not sign off with your name.`;

/** JSON Schema for the story, shared by both providers. */
export const STORY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Headline, under 90 characters' },
    summary: { type: 'string', description: 'One or two sentences, under 220 characters' },
    body: { type: 'string', description: '150-350 words of Markdown' },
  },
  required: ['title', 'summary', 'body'],
  additionalProperties: false,
};

const TAGS = { trade: 'Trade desk', injury: 'Injury report', recap: 'Week recap', rumor: 'Rumor mill' };
export const tagFor = (kind) => TAGS[kind] ?? 'League news';

/** The user message for one story: what happened, as JSON facts. */
export function storyPrompt(kind, facts) {
  const intro = {
    trade: 'A trade just went through in the league. Write the Trade Desk story: who won, who got fleeced, and why.',
    injury: 'A star player on a fantasy roster just landed on the injury report. Write the Injury Report story about what it means for that fantasy team.',
    recap: 'The week is final. Write the Week Recap: the headline result, the blowout, the nail-biter, the top and bottom scores, and of course how Austin did.',
    rumor: 'Write a short Rumor Mill story. The rumor below is made up for fun. Stay light and PG.',
  }[kind];
  return `${intro}\n\nFacts (JSON):\n${JSON.stringify(facts, null, 2)}`;
}

/** Check a model's output and clean it for publishing. Throws on anything unusable. */
export function cleanStory(raw) {
  const story = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const title = one(story?.title).replace(/^["']|["']$/g, '');
  const summary = one(story?.summary);
  // No raw HTML on the site: escape '<' so Markdown renders it as text.
  const body = String(story?.body ?? '').replace(/\r\n/g, '\n').replace(/</g, '&lt;').trim();
  if (title.length < 5 || title.length > 120) throw new Error(`bad title length (${title.length})`);
  if (summary.length < 10 || summary.length > 300) throw new Error(`bad summary length (${summary.length})`);
  if (body.length < 300 || body.length > 6000) throw new Error(`bad body length (${body.length})`);
  return { title, summary, body };
}

// ---------------------------------------------------------------- Claude

async function writeWithClaude(prompt) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
    max_tokens: 16000,
    // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: PERSONA,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: STORY_SCHEMA } },
  });
  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined (${response.stop_details?.category ?? 'no category'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Claude ran out of tokens');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no text');
  return text;
}

// ---------------------------------------------------------------- Gemini

/** Rank Gemini model names: stable before preview, full Flash before Lite, newest first. */
export function rankGeminiModels(models) {
  const version = (n) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
  return models
    .filter(
      (m) =>
        /gemini-[\d.]+-flash/.test(m.name) &&
        (m.supportedActions ?? ['generateContent']).includes('generateContent') &&
        !/image|tts|audio|live|embedding|native|exp/.test(m.name),
    )
    .map((m) => m.name.replace(/^models\//, ''))
    .sort(
      (a, b) =>
        Number(/preview/.test(a)) - Number(/preview/.test(b)) ||
        Number(/lite/.test(a)) - Number(/lite/.test(b)) ||
        version(b) - version(a),
    );
}

let geminiModelCache = null;

async function writeWithGemini(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  if (!geminiModelCache) {
    if (process.env.GEMINI_MODEL) {
      geminiModelCache = [process.env.GEMINI_MODEL];
    } else {
      const all = [];
      for await (const m of await ai.models.list()) all.push(m);
      geminiModelCache = rankGeminiModels(all);
      if (!geminiModelCache.length) throw new Error('No Gemini Flash model available to this key');
    }
  }
  let lastError;
  // Free-tier access differs by model: on quota/permission errors, try the next one.
  for (const model of [...geminiModelCache]) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: PERSONA,
          responseMimeType: 'application/json',
          responseJsonSchema: STORY_SCHEMA,
          maxOutputTokens: 8192,
        },
      });
      if (!res.text) throw new Error(`Gemini (${model}) returned no text`);
      geminiModelCache = [model, ...geminiModelCache.filter((m) => m !== model)];
      return res.text;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && [403, 404, 429].includes(err.status)) {
        console.warn(`  Gemini ${model}: HTTP ${err.status}, trying the next model`);
        geminiModelCache = geminiModelCache.filter((m) => m !== model);
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('No Gemini model worked');
}

// ---------------------------------------------------------------- entry point

/** Which AI to use: NEWS_AI if set, otherwise whichever key is present (Claude first). */
export function pickProvider(env = process.env) {
  const choice = env.NEWS_AI?.trim().toLowerCase();
  if (choice === 'claude' || choice === 'gemini') return choice;
  if (env.ANTHROPIC_API_KEY?.trim()) return 'claude';
  if (env.GEMINI_API_KEY?.trim()) return 'gemini';
  return null;
}

/** Write one story; retries once if the model's output doesn't pass the checks. */
export async function writeStory(provider, kind, facts) {
  const prompt = storyPrompt(kind, facts);
  const call = provider === 'claude' ? writeWithClaude : writeWithGemini;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return cleanStory(await call(prompt));
    } catch (err) {
      lastError = err;
      if (!(err instanceof SyntaxError) && !/bad (title|summary|body)/.test(err.message)) throw err;
      console.warn(`  unusable story (${err.message}), retrying`);
    }
  }
  throw lastError;
}
