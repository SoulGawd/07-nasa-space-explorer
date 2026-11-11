const allowedOrigins = new Set([
  'https://soulgawd.github.io',
  'http://localhost:8000',
  'http://localhost:8001',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:8001'
]);

function getCorsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  });

  if (allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

function sendJson(data, status, origin) {
  const headers = getCorsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanHtml(text) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#8217;/gi, "'")
    .replace(/&#8211;|&#8212;/gi, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMetaContent(html, property) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const metaTag = metaTags.find((tag) =>
    new RegExp(`(?:property|name)=[\"']${property}[\"']`, 'i').test(tag)
  );
  const content = metaTag?.match(/\bcontent=[\"']([^\"']*)[\"']/i);
  return content ? cleanHtml(content[1]) : '';
}

async function getApodPhoto(date) {
  const dateParts = date.split('-');
  const archiveDate = `${dateParts[0].slice(2)}${dateParts[1]}${dateParts[2]}`;
  const pageUrl = `https://apod.nasa.gov/apod/ap${archiveDate}.html`;
  const response = await fetch(pageUrl);

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const imageUrl = getMetaContent(html, 'og:image');
  const mediaType = getMetaContent(html, 'og:type');
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const explanationParagraph = paragraphs
    .map((paragraph) => cleanHtml(paragraph[1]))
    .find((paragraph) => paragraph.startsWith('Explanation:'));
  const hasVideo = mediaType.startsWith('video') ||
    /<video\b/i.test(html) ||
    /<iframe\b[^>]*\bsrc=["'][^"']*(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com)/i.test(html);

  if (
    hasVideo ||
    !imageUrl ||
    imageUrl.includes('/nasa-logo@2x.png') ||
    imageUrl.includes('/news-thumbnail.png') ||
    !heading
  ) {
    return null;
  }

  return {
    date,
    title: cleanHtml(heading[1]),
    url: imageUrl,
    hdurl: imageUrl,
    explanation: explanationParagraph
      ? explanationParagraph.replace(/^Explanation:\s*/, '')
      : 'No explanation is available for this image.',
    media_type: 'image'
  };
}

async function getApodPhotos(searchParams) {
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(startDate || '') || !datePattern.test(endDate || '') || startDate > endDate) {
    return { status: 400, data: { msg: 'Choose a valid start and end date.' } };
  }

  const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
  const endTime = new Date(`${endDate}T00:00:00Z`).getTime();
  const dayCount = Math.floor((endTime - startTime) / 86400000) + 1;

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    new Date(startTime).toISOString().slice(0, 10) !== startDate ||
    new Date(endTime).toISOString().slice(0, 10) !== endDate ||
    dayCount > 31
  ) {
    return { status: 400, data: { msg: 'Choose a valid date range of 31 days or fewer.' } };
  }

  const dates = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startTime + index * 86400000);
    return date.toISOString().slice(0, 10);
  });
  const results = await Promise.all(dates.map(async (date) => {
    try {
      return await getApodPhoto(date);
    } catch {
      return null;
    }
  }));
  const photos = results.filter(Boolean);

  if (photos.length === 0) {
    return { status: 502, data: { msg: 'NASA could not load APOD photos for those dates. Try again later.' } };
  }

  return { status: 200, data: photos };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname !== '/api/apod' || request.method !== 'GET') {
      return sendJson({ msg: 'Not found.' }, 404, origin);
    }

    if (origin && !allowedOrigins.has(origin)) {
      return sendJson({ msg: 'This origin is not allowed.' }, 403, origin);
    }

    try {
      const result = await getApodPhotos(url.searchParams);
      return sendJson(result.data, result.status, origin);
    } catch {
      return sendJson({ msg: 'NASA could not load APOD photos. Try again later.' }, 502, origin);
    }
  }
};
