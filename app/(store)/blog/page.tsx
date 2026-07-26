'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageHero from '@/components/PageHero';
import { HERO_IMAGES } from '@/lib/hero-images';
import { supabase } from '@/lib/supabase';

type BlogPost = {
  id: string;
  title: string;
  slug: string;
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

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image, published_at, created_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (!error && data) setPosts(data);
      setLoading(false);
    }
    load();
  }, []);

  const featuredPost = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Our Blog"
        subtitle="Style tips, outfit guides, and the latest from Freby's Fashion GH."
        image={HERO_IMAGES.blog}
        imagePosition="50% 25%"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {loading ? (
          <div className="py-20 text-center text-gray-500">
            <i className="ri-loader-4-line animate-spin text-3xl" />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-20 text-center">
            <i className="ri-article-line text-5xl text-gray-300 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No posts yet</h2>
            <p className="text-gray-600">Check back soon for style tips and updates.</p>
          </div>
        ) : (
          <>
            {featuredPost && (
              <Link href={`/blog/${featuredPost.id}`} className="block mb-16 hover:opacity-90 transition-opacity cursor-pointer">
                <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                  <div className="grid md:grid-cols-2 gap-0">
                    <div className="relative h-96 md:h-auto bg-gray-100">
                      {featuredPost.featured_image ? (
                        <img src={featuredPost.featured_image} alt={featuredPost.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <i className="ri-image-line text-5xl" />
                        </div>
                      )}
                      <div className="absolute top-6 left-6">
                        <span className="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-medium">Featured</span>
                      </div>
                    </div>
                    <div className="p-12 flex flex-col justify-center">
                      <p className="text-sm text-gray-500 mb-4">{formatDate(featuredPost.published_at || featuredPost.created_at)}</p>
                      <h2 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">{featuredPost.title}</h2>
                      <p className="text-gray-600 text-lg leading-relaxed mb-6">{featuredPost.excerpt || ''}</p>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {rest.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-8">Latest Articles</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {rest.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.id}`}
                      className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer"
                    >
                      <div className="relative h-56 bg-gray-100">
                        {post.featured_image ? (
                          <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <i className="ri-image-line text-4xl" />
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <p className="text-xs text-gray-500 mb-2">{formatDate(post.published_at || post.created_at)}</p>
                        <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight">{post.title}</h3>
                        <p className="text-gray-600 text-sm line-clamp-3">{post.excerpt || ''}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
