const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = process.env.PORT || 8000;
const folderPath = __dirname;
const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
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

  if (
    mediaType.startsWith('video') ||
    /<video\b/i.test(html) ||
    /<iframe\b[^>]*\bsrc=["'][^"']*(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com)/i.test(html) ||
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

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || dayCount > 31) {
    return { status: 400, data: { msg: 'Choose a date range of 31 days or fewer.' } };
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

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === '/api/apod') {
    try {
      const result = await getApodPhotos(requestUrl.searchParams);
      sendJson(response, result.status, result.data);
    } catch {
      sendJson(response, 502, { msg: 'NASA could not load APOD photos. Try again later.' });
    }
    return;
  }

  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : decodeURIComponent(requestUrl.pathname);
  const filePath = path.resolve(folderPath, `.${requestedPath}`);

  if (filePath !== folderPath && !filePath.startsWith(`${folderPath}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const contentType = contentTypes[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(contents);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Space Explorer is running at http://localhost:${port}`);
});
