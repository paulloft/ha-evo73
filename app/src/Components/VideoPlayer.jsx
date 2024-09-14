import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export default function VideoPlayer({ src, className = '', poster = null }) {
  const videoRef = useRef();

  useEffect(() => {
    const hls = new Hls();

    if (Hls.isSupported()) {
      hls.log = true;
      hls.loadSource(src);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, (err) => {
        console.log(err);
      });
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      controls
      src={src}
      poster={poster}
      className={className}
    />
  );
}