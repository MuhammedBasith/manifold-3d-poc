'use client';

import dynamic from 'next/dynamic';

const ManifoldShowcase = dynamic(() => import('./ManifoldShowcase'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full aspect-square max-w-2xl mx-auto bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-lg">
      <div className="text-white text-xl">Loading 3D Viewer...</div>
    </div>
  ),
});

export default function ManifoldShowcaseLoader() {
  return <ManifoldShowcase />;
}
