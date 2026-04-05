/**
 * Simple development server for e2e tests.
 * Serves test fixture pages and built IIFE bundles.
 */

const ROUTES: Record<string, string> = {
  '/': 'tests/e2e/fixtures/test-page.html',
  '/overlay': 'tests/e2e/fixtures/overlay-test-page.html',
}

const DIST_DIRS = ['packages/core/dist', 'packages/overlay/dist']

Bun.serve({
  port: 3000,
  async fetch(req) {
    const pathname = new URL(req.url).pathname

    // Check named routes first
    const route = ROUTES[pathname]
    if (route) {
      return new Response(Bun.file(route))
    }

    // Try to serve from dist directories
    const filename = pathname.slice(1)
    for (const dir of DIST_DIRS) {
      const file = Bun.file(`${dir}/${filename}`)
      if (await file.exists()) {
        return new Response(file)
      }
    }

    return new Response('Not found', { status: 404 })
  },
})
