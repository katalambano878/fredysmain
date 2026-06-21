import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const groqKey = process.env.GROQ_API_KEY;

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;
  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    if (parsed?.access_token) return parsed.access_token;
    if (typeof parsed === 'string') return parsed;
  } catch {
    return decoded;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const token = getAccessToken(request);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single();
    const role = profile?.role != null ? String(profile.role) : '';
    if (role !== 'admin' && role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!groqKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const { imageUrl, productName, categoryName } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    const contextParts = [productName && `Product name: "${productName}"`, categoryName && `Category: "${categoryName}"`].filter(Boolean);
    const context = contextParts.length > 0 ? `\n\nContext: ${contextParts.join('. ')}.` : '';

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content:
              'You are a product copywriter for Freby’s Fashion GH, a kids ready-to-wear fashion brand in Ghana offering unique outfits for all occasions. ' +
              'Write short, compelling product descriptions (2-3 sentences, max 300 characters). ' +
              'Be specific about what the product is and its key benefit. ' +
              'Use a warm, professional tone. Do not use hashtags or emojis. ' +
              'Return ONLY the description text, nothing else.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Write a short product description for this kids fashion product based on the image.${context}`,
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Groq vision API error:', err);
      return NextResponse.json({ error: 'Failed to generate description' }, { status: 502 });
    }

    const data = await res.json();
    const description = data.choices?.[0]?.message?.content?.trim() || '';

    if (!description) {
      return NextResponse.json({ error: 'No description generated' }, { status: 500 });
    }

    return NextResponse.json({ description });
  } catch (error: any) {
    console.error('Generate description error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
