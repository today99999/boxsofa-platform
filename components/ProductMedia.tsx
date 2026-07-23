"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OptimizedImage } from "@/components/OptimizedImage";

type ProductMediaProps = {
  name: string;
  images: string[];
  previousHref?: string;
  nextHref?: string;
};

export function ProductMedia({ name, images, previousHref, nextHref }: ProductMediaProps) {
  const gallery = useMemo(() => images.filter(Boolean), [images]);
  const [index, setIndex] = useState(0);
  const hasGallery = gallery.length > 1;
  const currentImage = gallery[index] ?? gallery[0];

  function showPreviousImage() {
    setIndex((current) => (current - 1 + gallery.length) % gallery.length);
  }

  function showNextImage() {
    setIndex((current) => (current + 1) % gallery.length);
  }

  return (
    <div className="product-media">
      {hasGallery ? (
        <button
          aria-label="Previous product image"
          className="media-arrow media-arrow-left"
          type="button"
          onClick={showPreviousImage}
        >
          ‹
        </button>
      ) : previousHref ? (
        <Link aria-label="Previous product" className="media-arrow media-arrow-left" href={previousHref}>
          ‹
        </Link>
      ) : null}

      {currentImage ? (
        <OptimizedImage
          alt={name}
          priority
          sizes="(max-width: 820px) calc(100vw - 28px), 52vw"
          src={currentImage}
        />
      ) : (
        <div className="image-placeholder" aria-label={`${name} product image unavailable`}>
          Product image unavailable
        </div>
      )}

      {hasGallery ? (
        <button
          aria-label="Next product image"
          className="media-arrow media-arrow-right"
          type="button"
          onClick={showNextImage}
        >
          ›
        </button>
      ) : nextHref ? (
        <Link aria-label="Next product" className="media-arrow media-arrow-right" href={nextHref}>
          ›
        </Link>
      ) : null}

    </div>
  );
}
