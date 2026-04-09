import React from 'react';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
}

export const Logo: React.FC<LogoProps> = ({ size = 'medium' }) => {
  const sizes = {
    small: 60,
    medium: 100,
    large: 370
  };

  const dimension = sizes[size];

  return (
    <img
      src="/logo.png"
      alt="LILA"
      width={dimension}
      height={dimension}
      className="logo"
    />
  );
};

