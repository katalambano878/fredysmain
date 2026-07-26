'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  created_at: string;
};

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function BlogPostPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, content, excerpt, featured_image, published_at, created_at')
        .eq('status', 'published')
        .or(`id.eq.${id},slug.eq.${id}`)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPost(data);

      const { data: more } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image, published_at, created_at')
        .eq('status', 'published')
        .neq('id', data.id)
        .order('published_at', { ascending: false })
        .limit(2);

      setRelated(more || []);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-gray-900" />
      </main>
    );
  }

  if (notFound || !post) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Post not found</h1>
        <Link href="/blog" className="text-emerald-700 font-semibold mt-4">
          Back to blog
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="relative h-96 bg-gray-900">
        {post.featured_image ? (
          <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover opacity-50" />
        ) : (
          <div className="w-full h-full bg-emerald-950 opacity-80" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">{post.title}</h1>
            <div className="flex items-center justify-center gap-6 text-gray-100 text-sm">
              <span className="flex items-center gap-2">
                <i className="ri-calendar-line" />
                {formatDate(post.published_at || post.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <article className="prose prose-lg max-w-none">
          <div
            className="text-gray-600 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            style={{ fontSize: '1.125rem', lineHeight: '1.8' }}
          />
        </article>

        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Related Articles</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/blog/${r.id}`}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all"
                >
                  <div className="relative h-48 bg-gray-100">
                    {r.featured_image ? (
                      <img src={r.featured_image} alt={r.title} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 leading-tight">{r.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 text-center">
          <Link href="/blog" className="inline-flex items-center gap-2 text-gray-900 font-medium hover:gap-3 transition-all">
            <i className="ri-arrow-left-line" />
            Back to Blog
          </Link>
        </div>
      </div>
    </div>
  );
}
