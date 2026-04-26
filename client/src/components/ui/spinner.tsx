import { Loader2 } from 'lucide-react';

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 className="animate-spin" style={{ width: size, height: size }} />;
}

export function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner size={28} />
    </div>
  );
}
