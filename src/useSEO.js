/**
 * useSEO — dynamic per-page SEO hook
 * Updates document title, meta tags, Open Graph, Twitter Card,
 * canonical URL and JSON-LD structured data on every route.
 *
 * Usage:
 *   useSEO({ title, description, image, url, type, schema })
 */

const SITE_NAME = 'NXL Beauty Bar';
const BASE_URL  = 'https://nxlbeautybar.co.za';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.jpg`;
const DEFAULT_DESC  = 'Book professional nail, hair and beauty services at NXL Beauty Bar in Dube, Soweto. Shop professional beauty products online with free delivery over R500.';

function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href, extra = {}) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  Object.entries(extra).forEach(([k, v]) => el.setAttribute(k, v));
}

function setJsonLD(schema) {
  const id = 'jsonld-schema';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);
}

export function useSEO({
  title,
  description = DEFAULT_DESC,
  image       = DEFAULT_IMAGE,
  url,
  type        = 'website',
  schema      = null,
  noIndex     = false,
} = {}) {
  const fullTitle   = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Nails, Hair & Beauty in Soweto`;
  const canonicalUrl = url ? `${BASE_URL}${url}` : BASE_URL;
  const fullImage   = image.startsWith('http') ? image : `${BASE_URL}${image}`;

  document.title = fullTitle;

  // Primary
  setMeta('description',     description);
  setMeta('robots',          noIndex ? 'noindex, nofollow' : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');

  // Open Graph
  setMeta('og:type',         type,         'property');
  setMeta('og:site_name',    SITE_NAME,    'property');
  setMeta('og:title',        fullTitle,    'property');
  setMeta('og:description',  description,  'property');
  setMeta('og:image',        fullImage,    'property');
  setMeta('og:image:width',  '1200',       'property');
  setMeta('og:image:height', '630',        'property');
  setMeta('og:url',          canonicalUrl, 'property');
  setMeta('og:locale',       'en_ZA',      'property');

  // Twitter
  setMeta('twitter:card',        'summary_large_image');
  setMeta('twitter:title',       fullTitle);
  setMeta('twitter:description', description);
  setMeta('twitter:image',       fullImage);

  // Canonical
  setLink('canonical', canonicalUrl);

  // JSON-LD
  if (schema) setJsonLD(schema);

  return { title: fullTitle, description, image: fullImage, url: canonicalUrl };
}

// ── Pre-built schemas ──────────────────────────────────────────────────────

export const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type':    'BeautySalon',
  'name':     'NXL Beauty Bar',
  'image':    `${BASE_URL}/og-image.jpg`,
  'logo':     `${BASE_URL}/Logo.jpeg`,
  '@id':      `${BASE_URL}/#salon`,
  'url':      BASE_URL,
  'telephone': '+27685113394',
  'email':    'nxlbeautybar@gmail.com',
  'priceRange': 'R–RR',
  'currenciesAccepted': 'ZAR',
  'paymentAccepted': 'Cash, Credit Card, Online Payment',
  'address': {
    '@type':           'PostalAddress',
    'streetAddress':   '1948 Mahalefele Road',
    'addressLocality': 'Dube',
    'addressRegion':   'Soweto',
    'postalCode':      '1800',
    'addressCountry':  'ZA',
  },
  'geo': {
    '@type':     'GeoCoordinates',
    'latitude':  -26.2641,
    'longitude':  27.8739,
  },
  'openingHoursSpecification': [
    { '@type':'OpeningHoursSpecification', 'dayOfWeek':['Monday','Tuesday','Wednesday','Thursday','Friday'], 'opens':'09:00', 'closes':'17:00' },
    { '@type':'OpeningHoursSpecification', 'dayOfWeek':'Saturday', 'opens':'09:00', 'closes':'17:00' },
  ],
  'sameAs': [
    'https://www.instagram.com/nxlbeautybar',
    'https://www.facebook.com/nxlbeautybar',
    'https://www.tiktok.com/@nxlbeautybar',
  ],
  'hasMap': 'https://www.google.com/maps/search/?api=1&query=1948+Mahalefele+Rd+Dube+Soweto',
  'aggregateRating': {
    '@type':       'AggregateRating',
    'ratingValue': '4.9',
    'reviewCount': '47',
  },
};

export function productSchema(product) {
  return {
    '@context': 'https://schema.org',
    '@type':    'Product',
    'name':     product.name,
    'description': product.description || `${product.name} — professional beauty product from NXL Beauty Bar`,
    'image':    product.images?.[0] || `${BASE_URL}/og-image.jpg`,
    'brand': { '@type': 'Brand', 'name': product.brand || 'NXL Beauty Bar' },
    'sku':  product.sku || product._id,
    'offers': {
      '@type':         'Offer',
      'url':           `${BASE_URL}/shop/product/${product._id}`,
      'priceCurrency': 'ZAR',
      'price':         String(parseFloat(product.price || 0).toFixed(2)),
      'priceValidUntil': new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10),
      'availability':  product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      'seller': { '@type': 'Organization', 'name': 'NXL Beauty Bar' },
      'hasMerchantReturnPolicy': {
        '@type': 'MerchantReturnPolicy',
        'applicableCountry': 'ZA',
        'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
        'merchantReturnDays': 7,
      },
    },
    ...(product.reviews?.length ? {
      'aggregateRating': {
        '@type':       'AggregateRating',
        'ratingValue': String((product.reviews.reduce((s,r) => s + r.rating, 0) / product.reviews.length).toFixed(1)),
        'reviewCount': String(product.reviews.length),
      }
    } : {}),
  };
}

export function serviceSchema(service) {
  return {
    '@context': 'https://schema.org',
    '@type':    'Service',
    'name':     service.name,
    'description': service.description || `${service.name} at NXL Beauty Bar, Dube, Soweto`,
    'provider':  { '@type': 'BeautySalon', 'name': 'NXL Beauty Bar' },
    'areaServed': { '@type': 'City', 'name': 'Soweto' },
    'offers': {
      '@type':         'Offer',
      'priceCurrency': 'ZAR',
      'price':         String(parseFloat(service.price || 0).toFixed(2)),
    },
    'serviceType':  service.category || 'Beauty Service',
  };
}

export function breadcrumbSchema(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    'itemListElement': crumbs.map((crumb, i) => ({
      '@type':    'ListItem',
      'position': i + 1,
      'name':     crumb.name,
      'item':     `${BASE_URL}${crumb.url}`,
    })),
  };
}