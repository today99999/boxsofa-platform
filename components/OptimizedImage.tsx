type OptimizedImageProps = {
  alt: string;
  className?: string;
  priority?: boolean;
  sizes: string;
  src: string;
};

const responsiveWidths = [256, 384, 640, 828, 1200, 1920];

function optimizedImageUrl(src: string, width: number) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=72`;
}

export function OptimizedImage({ alt, className, priority = false, sizes, src }: OptimizedImageProps) {
  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes}
      src={optimizedImageUrl(src, 828)}
      srcSet={responsiveWidths.map((width) => `${optimizedImageUrl(src, width)} ${width}w`).join(", ")}
    />
  );
}
