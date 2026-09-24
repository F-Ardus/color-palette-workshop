// Serves the static site from ./public. Requests to the old subdomain are
// redirected to the new one, keeping path and query, so shared links keep working.

// Not exported: named exports of a Worker entry must be handlers.
const HOST = 'palettekit.fardus.dev';
const OLD_HOSTS = new Set(['values.fardus.dev']);

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (OLD_HOSTS.has(url.hostname)) {
      url.hostname = HOST;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
