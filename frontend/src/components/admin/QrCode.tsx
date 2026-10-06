import { encode } from "uqr";
import { cn } from "@/lib/cn";

export interface QrCodeProps {
  /** Text to encode (e.g. an `otpauth://` URL). */
  value: string;
  /** Accessible description of the code. */
  label: string;
  /** Rendered size in px (default 192). */
  size?: number;
  className?: string;
}

/** Path of the dark modules ("M x y h1 v1 h-1 z" per module, merged per row run). */
export function qrPath(data: boolean[][]): string {
  const parts: string[] = [];
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join("");
}

/**
 * QR code as crisp inline SVG (no canvas, no network), from the `uqr` encoder. Navy on white with a
 * quiet zone, so authenticator apps scan it reliably.
 *   <QrCode value={setup.otpauth_url} label="QR code for your authenticator app" />
 */
export function QrCode({ value, label, size = 192, className }: QrCodeProps) {
  const qr = encode(value, { ecc: "M", border: 2 });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn("rounded-lg bg-white", className)}
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={qrPath(qr.data)} fill="#0E1726" />
    </svg>
  );
}
