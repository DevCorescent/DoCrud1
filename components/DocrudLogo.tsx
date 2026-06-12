import Image from 'next/image';

interface DocrudLogoProps {
  className?: string;
  height?: number;
  priority?: boolean;
}

const LOGO_RATIO = 2046 / 769;

export default function DocrudLogo({
  className = '',
  height = 34,
  priority = false,
}: DocrudLogoProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[1rem] ${className}`.trim()}
      style={{ height: `${height}px`, width: `${Math.round(height * LOGO_RATIO)}px` }}
    >
      <Image
        src="/docrud-logo.png"
        alt="docrud"
        fill
        priority={priority}
        sizes={`${Math.round(height * LOGO_RATIO)}px`}
        className="rounded-[1rem] object-contain object-left"
      />
    </div>
  );
}
