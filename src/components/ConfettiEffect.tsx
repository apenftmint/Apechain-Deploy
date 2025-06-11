
import React, { useEffect, useState } from 'react';

interface ConfettiPieceData {
  id: number;
  style: React.CSSProperties;
  animationName: string; // To allow unique keyframes per piece for varied fall paths
}

interface ConfettiEffectProps {
  count?: number; // Number of confetti pieces
}

const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ count = 50 }) => {
  const [pieces, setPieces] = useState<ConfettiPieceData[]>([]);
  const [keyframes, setKeyframes] = useState<string>('');

  useEffect(() => {
    const newPiecesData: ConfettiPieceData[] = [];
    let dynamicKeyframes = '';
    const colors = ['#f9a8d4', '#fde047', '#67e8f9', '#86efac', '#fda4af', '#d8b4fe']; 

    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100 + 'vw'; 
      const animationDelay = Math.random() * 1.5 + 's'; // Stagger start times slightly more
      const animationDuration = (55 + Math.random() * 5) + 's'; // 55-60 seconds duration
      const initialRotation = Math.random() * 360;
      const finalRotationX = Math.random() * 720 - 360;
      const finalRotationY = Math.random() * 360 - 180;
      const finalRotationZ = Math.random() * 720 - 360;
      
      const width = 6 + Math.random() * 6 + 'px';
      const height = 10 + Math.random() * 10 + 'px';
      const animationName = `fall_${i}`;

      dynamicKeyframes += `
        @keyframes ${animationName} {
          0% {
            transform: translateY(-30px) rotateX(0deg) rotateY(0deg) rotateZ(${initialRotation}deg) scale(1.2);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotateX(${finalRotationX}deg) rotateY(${finalRotationY}deg) rotateZ(${finalRotationZ}deg) scale(0.3);
            opacity: 0;
          }
        }
      `;

      newPiecesData.push({
        id: i,
        animationName: animationName,
        style: {
          position: 'absolute',
          top: '-30px', 
          left: `calc(${left} - 50vw)`, 
          width: width,
          height: height,
          backgroundColor: color,
          opacity: 0, // Will be set to 1 by animation
          animationName: animationName,
          animationDuration: animationDuration,
          animationDelay: animationDelay,
          animationTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)', // Smoother fall
          animationFillMode: 'forwards',
          transform: `rotateZ(${initialRotation}deg)`,
          zIndex: 10, 
          borderRadius: Math.random() > 0.5 ? '2px' : '50%', 
        },
      });
    }
    setKeyframes(dynamicKeyframes);
    setPieces(newPiecesData);

    // No JS cleanup timer needed here; CSS animation 'forwards' and parent unmount handle it.
  }, [count]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      <style>{keyframes}</style>
      {pieces.map(piece => (
        <div key={piece.id} style={piece.style} />
      ))}
    </div>
  );
};

export default ConfettiEffect;