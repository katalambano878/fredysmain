import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const groqKey = process.env.GROQ_API_KEY;

export async function POST(request: Request) {
  if (!groqKey) {
    return NextResponse.json({ error: 'Text-to-speech not configured' }, { status: 500 });
  }
  // This calls a paid service, so each visitor gets a limited number of requests.
  if (!checkRateLimit(`chat-speak:${getClientIdentifier(request)}`, { maxRequests: 20, windowSeconds: 300 }).success) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    // Clean text for natural speech
    let cleaned = text
      .replace(/GH₵/g, 'Ghana Cedis ')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s?/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`/g, '');

    // Limit text length for TTS
    const truncated = cleaned.length > 2000 ? cleaned.slice(0, 2000) + '...' : cleaned;

    const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'canopylabs/orpheus-v1-english',
        voice: 'autumn',
        response_format: 'wav',
        input: truncated,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Speak API] Groq error:', res.status, errText);
      return NextResponse.json({ error: 'Speech generation failed' }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[Speak API] Error:', err);
    return NextResponse.json({ error: 'Speech generation error' }, { status: 500 });
  }
}
