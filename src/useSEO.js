/**
 * useSEO — dynamic per-page SEO hook
 * Updates document title, meta tags, Open Graph, Twitter Card,
 * canonical URL, JSON-LD structured data and hreflang on every route.
 */

import { useEffect } from 'react';

const SITE_NAME    = 'NXL Beauty Bar';
const BASE_URL     = 'https://nxlbeautybar.co.za';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.jpg`;
const DEFAULT_DESC  = 'Book professional nail, hair and beauty services at NXL Beauty Bar in Dube, Soweto. Shop professional beauty products online with free delivery over R500.';

function setMeta(name, content, attr = 'name') {
  if (content == null) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

function setLink(rel, href, extra = {}) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el); }
  el.setAttribute('href', href);
  Object.entries(extra).forEach(([k, v]) => el.setAttribute(k, v));
}

function setJsonLD(schema, id = 'jsonld-schema') {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('script'); el.id = id; el.type = 'application/ld+json'; document.head.appendChild(el); }
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
  keywords    = null,
  publishedAt = null,
  modifiedAt  = null,
} = {}) {
  useEffect(() => {
    const fullTitle    = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Nails, Hair & Beauty in Soweto`;
    const canonicalUrl = url ? `${BASE_URL}${url}` : BASE_URL;
    const fullImage    = image?.startsWith('http') ? image : `${BASE_URL}${image || '/og-image.jpg'}`;

    document.title = fullTitle;

    // Primary meta
    setMeta('description', description);
    setMeta('robots', noIndex
      ? 'noindex, nofollow'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    if (keywords) setMeta('keywords', keywords);

    // Open Graph
    setMeta('og:type',         type,         'property');
    setMeta('og:site_name',    SITE_NAME,    'property');
    setMeta('og:title',        fullTitle,    'property');
    setMeta('og:description',  description,  'property');
    setMeta('og:image',        fullImage,    'property');
    setMeta('og:image:width',  '1200',       'property');
    setMeta('og:image:height', '630',        'property');
    setMeta('og:image:alt',    fullTitle,    'property');
    setMeta('og:url',          canonicalUrl, 'property');
    setMeta('og:locale',       'en_ZA',      'property');
    if (publishedAt) setMeta('article:published_time', publishedAt, 'property');
    if (modifiedAt)  setMeta('article:modified_time',  modifiedAt,  'property');

    // Twitter
    setMeta('twitter:card',        'summary_large_image');
    setMeta('twitter:site',        '@nxlbeautybar');
    setMeta('twitter:creator',     '@nxlbeautybar');
    setMeta('twitter:title',       fullTitle);
    setMeta('twitter:description', description);
    setMeta('twitter:image',       fullImage);
    setMeta('twitter:image:alt',   fullTitle);

    // Canonical + hreflang
    setLink('canonical', canonicalUrl);
    setLink('alternate', canonicalUrl, { hreflang: 'en-ZA' });
    setLink('alternate', canonicalUrl, { hreflang: 'x-default' });

    // Preconnect hints for performance
    setLink('preconnect', 'https://fonts.googleapis.com', { crossorigin: '' });
    setLink('preconnect', 'https://fonts.gstatic.com',    { crossorigin: '' });
    setLink('preconnect', 'https://res.cloudinary.com',   { crossorigin: '' });

    // JSON-LD
    if (schema) setJsonLD(schema);

    // Always inject LocalBusiness on every page
    setJsonLD(LOCAL_BUSINESS_SCHEMA, 'jsonld-business');

    return () => {}; // no cleanup needed — meta tags persist until next route
  }, [title, description, image, url, type, noIndex, keywords]);

  return null;
}

// ── Pre-built schemas ──────────────────────────────────────────────────────

export const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type':    ['BeautySalon', 'LocalBusiness'],
  '@id':      `${BASE_URL}/#salon`,
  'name':     'NXL Beauty Bar',
  'alternateName': 'NXL Beauty',
  'image':    `${BASE_URL}/og-image.jpg`,
  'logo':     { '@type': 'ImageObject', 'url': `${BASE_URL}/Logo.jpeg`, 'width': 300, 'height': 300 },
  'url':      BASE_URL,
  'telephone': '+27685113394',
  'email':    'nxlbeautybar@gmail.com',
  'priceRange': 'R–RR',
  'currenciesAccepted': 'ZAR',
  'paymentAccepted': 'Cash, Credit Card, Online Payment (Yoco)',
  'address': {
    '@type':           'PostalAddress',
    'streetAddress':   '1948 Mahalefele Road',
    'addressLocality': 'Dube',
    'addressRegion':   'Gauteng',
    'postalCode':      '1800',
    'addressCountry':  'ZA',
  },
  'geo': {
    '@type':     'GeoCoordinates',
    'latitude':  -26.2641,
    'longitude':  27.8739,
  },
  'openingHoursSpecification': [
    { '@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday','Tuesday','Wednesday','Thursday','Friday'], 'opens': '09:00', 'closes': '17:00' },
    { '@type': 'OpeningHoursSpecification', 'dayOfWeek': 'Saturday', 'opens': '09:00', 'closes': '17:00' },
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
    'bestRating':  '5',
    'worstRating': '1',
  },
  'servesCuisine': [],
  'serviceArea': { '@type': 'City', 'name': 'Soweto', 'addressCountry': 'ZA' },
};

export function productSchema(product) {
  return {
    '@context': 'https://schema.org',
    '@type':    'Product',
    'name':     product.name,
    'description': product.description || `${product.name} — professional beauty product from NXL Beauty Bar`,
    'image':    product.images?.[0] || DEFAULT_IMAGE,
    'brand':    { '@type': 'Brand', 'name': product.brand || 'NXL Beauty Bar' },
    'sku':      product.sku || product._id,
    'mpn':      product.sku || product._id,
    'category': product.category || 'Beauty Products',
    'offers': {
      '@type':         'Offer',
      'url':           `${BASE_URL}/shop/product/${product._id}`,
      'priceCurrency': 'ZAR',
      'price':         String(parseFloat(product.price || 0).toFixed(2)),
      'priceValidUntil': new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10),
      'availability':  product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      'itemCondition': 'https://schema.org/NewCondition',
      'seller':        { '@type': 'Organization', 'name': 'NXL Beauty Bar' },
      'shippingDetails': {
        '@type': 'OfferShippingDetails',
        'shippingRate': { '@type': 'MonetaryAmount', 'value': product.price >= 500 ? '0' : '80', 'currency': 'ZAR' },
        'deliveryTime': { '@type': 'ShippingDeliveryTime', 'businessDays': { '@type': 'QuantitativeValue', 'minValue': 3, 'maxValue': 7 } },
      },
      'hasMerchantReturnPolicy': {
        '@type': 'MerchantReturnPolicy',
        'applicableCountry': 'ZA',
        'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
        'merchantReturnDays': 7,
        'returnMethod': 'https://schema.org/ReturnByMail',
      },
    },
    ...(product.reviews?.length ? {
      'aggregateRating': {
        '@type':       'AggregateRating',
        'ratingValue': String((product.reviews.reduce((s,r) => s + r.rating, 0) / product.reviews.length).toFixed(1)),
        'reviewCount': String(product.reviews.length),
        'bestRating':  '5',
      }
    } : {}),
  };
}

export function serviceSchema(service) {
  return {
    '@context': 'https://schema.org',
    '@type':    'Service',
    'name':     service.name,
    'description': service.description || `Professional ${service.name} at NXL Beauty Bar, Dube, Soweto`,
    'provider':  { '@type': 'BeautySalon', 'name': 'NXL Beauty Bar', 'url': BASE_URL },
    'areaServed': { '@type': 'City', 'name': 'Soweto', 'addressCountry': 'ZA' },
    'availableChannel': { '@type': 'ServiceChannel', 'serviceUrl': `${BASE_URL}/book`, 'servicePhone': '+27685113394' },
    'offers': {
      '@type':         'Offer',
      'priceCurrency': 'ZAR',
      'price':         String(parseFloat(service.price || 0).toFixed(2)),
      'availability':  'https://schema.org/InStock',
    },
    'serviceType':  service.category || 'Beauty Service',
    'hoursAvailable': [
      { '@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], 'opens': '09:00', 'closes': '17:00' },
    ],
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

export function faqSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    'mainEntity': items.map(({ question, answer }) => ({
      '@type':          'Question',
      'name':           question,
      'acceptedAnswer': { '@type': 'Answer', 'text': answer },
    })),
  };
}

export function reviewSchema(review, itemName) {
  return {
    '@context': 'https://schema.org',
    '@type':    'Review',
    'itemReviewed': { '@type': 'BeautySalon', 'name': 'NXL Beauty Bar' },
    'reviewRating': { '@type': 'Rating', 'ratingValue': String(review.rating), 'bestRating': '5' },
    'name':         itemName || 'Review',
    'reviewBody':   review.comment || '',
    'author':       { '@type': 'Person', 'name': review.authorName || 'Customer' },
    'datePublished': review.createdAt ? new Date(review.createdAt).toISOString().slice(0,10) : undefined,
  };
}

export function appointmentSchema(service) {
  return {
    '@context': 'https://schema.org',
    '@type':    'MedicalProcedure',
    'name':     service.name,
    'description': service.description || `Book ${service.name} at NXL Beauty Bar`,
    'bodyLocation': 'Nails / Hair / Beauty',
    'howPerformed': `Professional ${service.name} service by trained technicians`,
    'procedureType': 'https://schema.org/CosmeticProcedure',
    'status': 'https://schema.org/ActiveActionStatus',
  };
}