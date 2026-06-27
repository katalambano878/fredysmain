/**
 * Storefront hero backgrounds — AI-generated kids Ankara/kente banners.
 * Images live in /public/heroes/.
 */
export const HERO_IMAGES = {
  shop: '/heroes/hero-shop.jpg',
  categories: '/heroes/hero-categories.jpg',
  gallery: '/heroes/hero-gallery.jpg',
  contact: '/heroes/hero-contact.jpg',
  cart: '/heroes/hero-cart.jpg',
  faqs: '/heroes/hero-contact.jpg',
  wishlist: '/heroes/hero-gallery.jpg',
  shipping: '/heroes/hero-cart.jpg',
  blog: '/heroes/hero-categories.jpg',
  help: '/heroes/hero-contact.jpg',
} as const;

export type HeroImageKey = keyof typeof HERO_IMAGES;
