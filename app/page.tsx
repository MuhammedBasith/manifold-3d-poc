import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 font-sans">
      <main className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
            Manifold-3D Projects
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Explore interactive 3D demonstrations powered by Manifold-3D and WebAssembly
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          <Link
            href="/manifold-showcase"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 p-8 text-white transition-transform hover:scale-105 hover:shadow-2xl"
          >
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-4">Manifold Showcase</h2>
              <p className="text-blue-50 mb-6">
                Explore boolean operations like union, difference, intersection, and convex hull
                with interactive 3D controls
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>View Demo</span>
                <svg
                  className="w-5 h-5 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          <Link
            href="/bim-editor"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white transition-transform hover:scale-105 hover:shadow-2xl"
          >
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-4">BIM Editor</h2>
              <p className="text-emerald-50 mb-6">
                Create and edit building models with walls, doors, and windows. Features raycasting,
                snapping, and real-time boolean operations
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>Start Building</span>
                <svg
                  className="w-5 h-5 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-teal-700 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              High Performance
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Built with WebAssembly for near-native performance in the browser
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              Robust CSG
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Reliable boolean operations with guaranteed manifold output
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
              Modern API
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Easy integration with Three.js and other 3D libraries
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <a
            href="https://github.com/elalish/manifold"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            View on GitHub
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </main>
    </div>
  );
}
