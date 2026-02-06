export default async (request, context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  const url = new URL(request.url);

  if (!contentType.includes('text/html')) {
    return response;
  }

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return response;
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') || '';
  if (!apiKey) {
    return response;
  }

  const html = await response.text();
  const injected = html.replace(
    '</head>',
    `<script>window.__ENV__ = { GOOGLE_MAPS_API_KEY: "${apiKey}" };</script></head>`
  );

  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
