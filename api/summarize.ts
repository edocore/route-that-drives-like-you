import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SummarizeRequest {
  prompt: string;
}

const DEFAULT_MODEL = 'meta-llama/Llama-3.2-3B-Instruct';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.HF_TOKEN;
  const model = process.env.HF_MODEL_ID || DEFAULT_MODEL;
  if (!token) {
    res.status(503).json({ error: 'HF_TOKEN not configured', source: 'unconfigured' });
    return;
  }

  const body = req.body as SummarizeRequest;
  if (!body?.prompt) {
    res.status(400).json({ error: 'prompt required' });
    return;
  }

  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: body.prompt,
        parameters: {
          max_new_tokens: 140,
          temperature: 0.4,
          return_full_text: false,
        },
        options: {
          wait_for_model: true,
          use_cache: true,
        },
      }),
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const text = await r.text();
      res
        .status(r.status)
        .json({ error: 'HF error', detail: text, source: 'hf-error' });
      return;
    }

    const data = (await r.json()) as
      | Array<{ generated_text?: string }>
      | { generated_text?: string };
    const text = Array.isArray(data)
      ? data[0]?.generated_text
      : data?.generated_text;

    if (!text || typeof text !== 'string') {
      res.status(502).json({ error: 'No text in HF response', source: 'hf-empty' });
      return;
    }

    res
      .status(200)
      .setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      .json({ text: text.trim(), model, source: 'hf' });
  } catch (err) {
    clearTimeout(timeout);
    res.status(504).json({
      error: 'HF call failed or timed out',
      detail: (err as Error).message,
      source: 'hf-timeout',
    });
  }
}
