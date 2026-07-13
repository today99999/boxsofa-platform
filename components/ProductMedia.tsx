"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
          aria-label="上一张图片"
          className="media-arrow media-arrow-left"
          type="button"
          onClick={showPreviousImage}
        >
          ‹
        </button>
      ) : previousHref ? (
        <Link aria-label="上一个 SKU" className="media-arrow media-arrow-left" href={previousHref}>
          ‹
        </Link>
      ) : null}

      {currentImage ? (
        <img src={currentImage} alt={name} />
      ) : (
        <div className="image-placeholder" aria-label={`${name} 主图待上传`}>
          主图待上传
        </div>
      )}

      {hasGallery ? (
        <button
          aria-label="下一张图片"
          className="media-arrow media-arrow-right"
          type="button"
          onClick={showNextImage}
        >
          ›
        </button>
      ) : nextHref ? (
        <Link aria-label="下一个 SKU" className="media-arrow media-arrow-right" href={nextHref}>
          ›
        </Link>
      ) : null}
    </div>
  );
}
