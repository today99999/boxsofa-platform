"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ProductMediaProps = {
  name: string;
  images: string[];
  video?: string;
  previousHref?: string;
  nextHref?: string;
};

export function ProductMedia({ name, images, video, previousHref, nextHref }: ProductMediaProps) {
  const gallery = useMemo(() => images.filter(Boolean), [images]);
  const [index, setIndex] = useState(0);
  const [showVideo, setShowVideo] = useState(Boolean(video));
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
      {!showVideo && hasGallery ? (
        <button
          aria-label="Previous product image"
          className="media-arrow media-arrow-left"
          type="button"
          onClick={showPreviousImage}
        >
          ‹
        </button>
      ) : !showVideo && previousHref ? (
        <Link aria-label="Previous product" className="media-arrow media-arrow-left" href={previousHref}>
          ‹
        </Link>
      ) : null}

      {showVideo && video ? (
        <video
          aria-label={`${name} product video`}
          autoPlay
          className="product-main-video"
          controls
          loop
          muted
          playsInline
          poster={currentImage}
          preload="metadata"
          src={video}
        />
      ) : currentImage ? (
        <img src={currentImage} alt={name} />
      ) : (
        <div className="image-placeholder" aria-label={`${name} product image unavailable`}>
          Product image unavailable
        </div>
      )}

      {!showVideo && hasGallery ? (
        <button
          aria-label="Next product image"
          className="media-arrow media-arrow-right"
          type="button"
          onClick={showNextImage}
        >
          ›
        </button>
      ) : !showVideo && nextHref ? (
        <Link aria-label="Next product" className="media-arrow media-arrow-right" href={nextHref}>
          ›
        </Link>
      ) : null}

      {video ? (
        <div className="product-media-modes" aria-label="Product media">
          <button
            aria-pressed={showVideo}
            className={showVideo ? "active" : ""}
            type="button"
            onClick={() => setShowVideo(true)}
          >
            Video
          </button>
          <button
            aria-pressed={!showVideo}
            className={!showVideo ? "active" : ""}
            type="button"
            onClick={() => setShowVideo(false)}
          >
            Photos
          </button>
        </div>
      ) : null}
    </div>
  );
}
