import React, { useEffect } from 'react';
import '../styles/preloader.css';

interface PreloaderProps {
  onComplete: () => void;
}

export const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  useEffect(() => {
    // Trigger completion after animation finishes (3.6s)
    const timer = setTimeout(() => {
      onComplete();
    }, 3600);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="preloader">
      <div className="preloader-content">
        <img
          src="/logo.png"
          alt="LILA"
          className="preloader-logo"
        />
        <h1 className="preloader-text">LILA</h1>
      </div>
    </div>
  );
};
