'use client';

import { ReactNode, memo, useRef, useEffect, useState, useCallback, createRef, type RefObject, type CSSProperties } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { TransitionEffect } from '@/types/playlist';
import { isLowPowerDevice } from '@/lib/device-detection';
import '@/styles/transitions.css';

interface TransitionContainerProps {
  children: ReactNode;
  transition: TransitionEffect;
  duration: number;
  contentKey: string | number;
  displaySettings?: { isRaspberryPi?: boolean };
}

export const TransitionContainer = memo(function TransitionContainer({
  children,
  transition,
  duration,
  contentKey,
  displaySettings,
}: TransitionContainerProps) {
  const nodeRefs = useRef(new Map<string | number, RefObject<HTMLDivElement>>());
  const [isLowPower, setIsLowPower] = useState(false);
  const [optimizedTransition, setOptimizedTransition] = useState(transition);
  const [optimizedDuration, setOptimizedDuration] = useState(duration);

  useEffect(() => {
    // Use the device detection utility with display settings
    const lowPower = isLowPowerDevice(displaySettings);
    setIsLowPower(lowPower);

    if (lowPower) {
      // Simplify complex transitions to fade for better performance
      const complexTransitions = ['dissolve', 'burn', 'morph', 'zoom', 'iris', 'peel', 'page-roll'];
      if (complexTransitions.includes(transition)) {
        setOptimizedTransition('fade');
      } else {
        setOptimizedTransition(transition);
      }

      // Reduce transition duration for smoother playback
      setOptimizedDuration(Math.min(duration, 0.5)); // Cap at 500ms for Pi
    } else {
      setOptimizedTransition(transition);
      setOptimizedDuration(duration);
    }
  }, [transition, duration, displaySettings]);

  const getNodeRef = useCallback((key: string | number) => {
    if (!nodeRefs.current.has(key)) {
      nodeRefs.current.set(key, createRef<HTMLDivElement>());
    }
    return nodeRefs.current.get(key)!;
  }, []);

  const transitionClassNames = `transition-${optimizedTransition}`;
  const enterDuration = optimizedDuration;
  const exitDuration = Math.min(optimizedDuration, 0.3);
  const timeout = {
    enter: enterDuration * 1000,
    exit: exitDuration * 1000,
  } as const;
  const nodeRef = getNodeRef(contentKey);

  // Set CSS variable for transition duration
  const style: CSSProperties = {
    '--transition-duration': `${enterDuration}s`,
    '--transition-enter-duration': `${enterDuration}s`,
    '--transition-exit-duration': `${exitDuration}s`,
  };

  // For instant transitions (cut), just render without animation
  if (optimizedTransition === 'cut') {
    return (
      <div className="relative w-full h-full gpu-accelerated hardware-accelerate">
        <div className="absolute inset-0 gpu-transition low-power-optimize">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full gpu-accelerated hardware-accelerate overflow-hidden ${isLowPower ? 'low-power-optimize' : ''}`}
      style={{
        perspective: isLowPower ? 'none' : '1200px',
        transformStyle: isLowPower ? 'flat' : 'preserve-3d',
      }}
    >
      <TransitionGroup component={null}>
        <CSSTransition
          key={contentKey}
          timeout={timeout}
          classNames={transitionClassNames}
          nodeRef={nodeRef}
          unmountOnExit
        >
          <div
            ref={nodeRef}
            className={`absolute inset-0 gpu-transition ${isLowPower ? 'low-power-optimize' : ''}`}
            style={{
              ...style,
              transformStyle: isLowPower ? 'flat' : 'preserve-3d',
              backfaceVisibility: 'hidden',
              willChange: isLowPower ? 'opacity' : 'transform, opacity',
              transform: 'translateZ(0)', // Force GPU layer
            }}
          >
            {children}
          </div>
        </CSSTransition>
      </TransitionGroup>
    </div>
  );
});

export default TransitionContainer;
