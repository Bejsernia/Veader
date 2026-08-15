import { Easing } from 'react-native-reanimated';

export const motionEasing = Easing.bezier(0.16, 1, 0.3, 1);
export const motionSpring = { damping: 20, stiffness: 100, mass: 0.85 } as const;

export function motionDuration(reducedMotion: boolean, duration: number) {
  return reducedMotion ? 1 : duration;
}
