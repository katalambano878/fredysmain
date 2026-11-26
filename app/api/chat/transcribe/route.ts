import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const groqKey = process.env.GROQ_API_KEY;

export async function POST(request: Request) {
  if (!groqKey) {
    return NextResponse.json({ error: 'Speech-to-text not configured' }, { status: 500 });
  }
  // This calls a paid service, so each visitor gets a limited number of requests and a size cap.
  if (!checkRateLimit(`chat-transcribe:${getClientIdentifier(request)}`, { maxRequests: 20, windowSeconds: 300 }).success) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });
  }
  if (Number(request.headers.get('content-length') || 0) > 6 * 1024 * 1024) {
    return NextResponse.json({ error: 'That recording is too long.' }, { status: 413 });
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Forward to Groq Whisper API
    const groqForm = new FormData();
    groqForm.append('file', audioFile, audioFile.name || 'audio.webm');
    groqForm.append('model', 'whisper-large-v3');
    groqForm.append('temperature', '0');
    groqForm.append('response_format', 'verbose_json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: groqForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Transcribe API] Groq error:', res.status, errText);
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      text: data.text || '',
      language: data.language || 'en',
      duration: data.duration || 0,
    });
  } catch (err: any) {
    console.error('[Transcribe API] Error:', err);
    return NextResponse.json({ error: 'Transcription error' }, { status: 500 });
  }
}
