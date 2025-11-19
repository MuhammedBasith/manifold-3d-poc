import Link from 'next/link';
import BIMEditor from '../components/BIMEditor';

export const metadata = {
  title: 'BIM Editor | Manifold-3D POC',
  description: 'Create and edit building models with real-time CSG operations',
};

export default function BIMEditorPage() {
  return (
    <div className="h-screen flex flex-col bg-zinc-900">
      {/* Header */}
      <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </Link>
          <div className="h-6 w-px bg-zinc-600" />
          <h1 className="text-lg font-semibold text-white">BIM Editor</h1>
        </div>
        <div className="text-xs text-zinc-500">
          Powered by Manifold-3D & Three.js
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <BIMEditor />
      </div>
    </div>
  );
}
