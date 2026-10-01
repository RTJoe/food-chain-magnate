import { encode } from 'uqr';
import { useMemo } from 'preact/hooks';

/** Crisp SVG QR code (one path, rounded modules) for the lobby join URL. */
export function QrCode({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 2 });
    let path = '';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) path += `M${x + 0.08} ${y + 0.08}h0.84v0.84h-0.84z`;
      }),
    );
    return { d: path, n: qr.size };
  }, [text]);
  return (
    <svg class="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect width={n} height={n} rx="1.2" fill="#fffaf0" />
      <path d={d} fill="#2b2a33" />
    </svg>
  );
}
