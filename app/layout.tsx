import type { Metadata } from "next";
import Script from "next/script";
import { Pacifico, Playfair_Display, Inter } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import "./globals.css";

const pacifico = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-pacifico" });
const playfair = Playfair_Display({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-playfair",
});
const inter = Inter({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter",
});

/** Canonical site origin — must match the URL people paste in WhatsApp (set NEXT_PUBLIC_APP_URL in production). */
const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://frebysfashion.com"
).replace(/\/+$/, "");

/** WhatsApp / Facebook / iMessage read og:image — use absolute URL + explicit meta tags below. */
const shareImageUrl = `${siteUrl}/frebys-logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Freby’s Fashion GH",
  category: "shopping",
  referrer: "origin-when-cross-origin",
  title: {
    default: "Freby’s Fashion GH | Kids Ready-to-Wear Outfits",
    template: "%s | Freby’s Fashion GH",
  },
  description:
    "Freby’s Fashion GH creates unique kids ready-to-wear outfits for all occasions. Casual and luxury kids wear with worldwide delivery from Haatso, Accra, Ghana.",
  keywords: [
    "Freby’s Fashion GH",
    "kids Ankara clothes",
    "kids ready to wear Ghana",
    "children fashion Ghana",
    "casual kids wear",
    "luxury kids wear",
    "Ankara outfits for kids",
    "Haatso Accra",
    "worldwide kids fashion delivery",
    "African print kids clothing",
    "Ankara dresses for children",
    "kids clothing brand Ghana",
    "buy kids Ankara online",
    "children occasion outfits Ghana",
    "birthday outfit kids Ankara",
    "Ghana kids fashion store",
    "Accra children clothing",
    "kids ready-to-wear Ankara",
    "unique kids wear",
  ],
  authors: [{ name: "Freby’s Fashion GH" }],
  creator: "Freby’s Fashion GH",
  publisher: "Freby’s Fashion GH",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    shortcut: [{ url: '/favicon.ico' }],
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', sizes: '64x64', type: 'image/png' },
      { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Freby’s Fashion GH",
  },
  formatDetection: {
    telephone: true,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
  openGraph: {
    type: "website",
    locale: "en_GH",
    url: siteUrl,
    title: "Freby’s Fashion GH | Kids Ready-to-Wear Outfits",
    description:
      "Unique kids ready-to-wear outfits for all occasions. Casual and luxury kids wear with worldwide delivery from Haatso, Accra, Ghana.",
    siteName: "Freby’s Fashion GH",
    images: [
      {
        url: shareImageUrl,
        width: 593,
        height: 421,
        type: "image/png",
        alt: "Freby’s Fashion GH logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Freby’s Fashion GH | Kids Ready-to-Wear Outfits",
    description:
      "Unique kids ready-to-wear outfits for all occasions. Worldwide delivery from Ghana.",
    images: [shareImageUrl],
  },
  alternates: {
    canonical: siteUrl,
  },
};

// Google Analytics Measurement ID
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
// Google reCAPTCHA v3 Site Key
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Social share preview (WhatsApp, Facebook, LinkedIn) — explicit absolute og:image */}
        <meta property="og:image" content={shareImageUrl} />
        <meta property="og:image:secure_url" content={shareImageUrl} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="593" />
        <meta property="og:image:height" content="421" />
        <meta property="og:image:alt" content="Freby’s Fashion GH logo" />
        <meta name="twitter:image" content={shareImageUrl} />
        <link rel="image_src" href={shareImageUrl} />

        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#166d1f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Freby’s Fashion GH" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#166d1f" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="384x384" href="/icons/icon-384x384.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512x512.png" />

        {/* Apple Splash Screens */}
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />

        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css"
          rel="stylesheet"
        />

        {/* Structured Data: Organization + LocalBusiness + WebSite + SearchAction */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${siteUrl}#organization`,
                  "name": "Freby’s Fashion GH",
                  "alternateName": ["Frebys Fashion GH", "Freby’s Fashion Ghana", "Frebys Kids Ankara"],
                  "url": siteUrl,
                  "logo": { "@type": "ImageObject", "url": `${siteUrl}/frebys-logo.png`, "width": 593, "height": 421 },
                  "image": shareImageUrl,
                  "description": "Unique kids ready-to-wear outfits for all occasions. Casual and luxury kids wear handmade in Haatso, Accra with worldwide delivery.",
                  "foundingLocation": "Haatso, Accra, Ghana",
                  "knowsAbout": ["Kids fashion", "Ankara fabric", "African print clothing", "Children ready-to-wear", "Kids occasion outfits"],
                  "sameAs": ["https://wa.me/233244720197"],
                  "contactPoint": { "@type": "ContactPoint", "contactType": "customer service", "telephone": "+233244720197", "email": "info@frebysfashion.com", "availableLanguage": ["English"] }
                },
                {
                  "@type": "ClothingStore",
                  "@id": `${siteUrl}#store`,
                  "name": "Freby’s Fashion GH",
                  "url": siteUrl,
                  "image": [shareImageUrl],
                  "telephone": "+233244720197",
                  "email": "info@frebysfashion.com",
                  "priceRange": "$$",
                  "currenciesAccepted": "GHS",
                  "paymentAccepted": "Mobile Money, Cash",
                  "openingHoursSpecification": { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"], "opens": "08:00", "closes": "18:00" },
                  "address": { "@type": "PostalAddress", "streetAddress": "Haatso", "addressLocality": "Accra", "addressRegion": "Greater Accra", "addressCountry": "GH" },
                  "geo": { "@type": "GeoCoordinates", "latitude": 5.6505, "longitude": -0.2092 },
                  "areaServed": [{ "@type": "Country", "name": "Ghana" }, { "@type": "Place", "name": "Worldwide" }],
                  "hasOfferCatalog": { "@type": "OfferCatalog", "name": "Kids Ankara Clothing", "itemListElement": [{ "@type": "OfferCatalog", "name": "Casual Kids Wear" }, { "@type": "OfferCatalog", "name": "Luxury Kids Wear" }, { "@type": "OfferCatalog", "name": "Occasion Outfits" }] }
                },
                {
                  "@type": "WebSite",
                  "@id": `${siteUrl}#website`,
                  "name": "Freby’s Fashion GH",
                  "url": siteUrl,
                  "publisher": { "@id": `${siteUrl}#organization` },
                  "potentialAction": { "@type": "SearchAction", "target": { "@type": "EntryPoint", "urlTemplate": `${siteUrl}/shop?search={search_term_string}` }, "query-input": "required name=search_term_string" }
                }
              ]
            })
          }}
        />
      </head>

      {/* Google Analytics */}
      {GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', {
                page_path: window.location.pathname,
              });
            `}
          </Script>
        </>
      )}

      {/* Google reCAPTCHA v3 */}
      {RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      )}

      <body className={`antialiased overflow-x-hidden pwa-body ${pacifico.variable} ${playfair.variable} ${inter.variable} font-sans`} style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[10000] focus:px-6 focus:py-3 focus:bg-gray-900 focus:text-white focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>
        <CartProvider>
          <WishlistProvider>
            <div id="main-content">
              {children}
            </div>
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}
