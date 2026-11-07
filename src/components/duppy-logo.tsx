import Svg, { Circle, Path } from 'react-native-svg';

import { brand } from '@/constants/duppyTheme';

// Original Duppy Map mark: a winding street resolving into a map pin, with a
// single botanical leaf wrapping the pin's head. Designed flat for legibility
// at launcher-icon size (plan.md V5-B "Ensure legibility at launcher-icon
// size"). Not derived from the supplied reference screenshots' artwork.
export function DuppyLogo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Circle cx={48} cy={48} r={48} fill={brand.cream} />
      {/* winding street */}
      <Path
        d="M20 66c6-10 2-18 10-22s14 4 10-6-6-16 4-20"
        stroke={brand.forest}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
      {/* leaf wrapping the pin */}
      <Path
        d="M44 20c10-6 20 2 18 12-2 9-12 12-20 8 2-8 0-15 2-20z"
        fill={brand.sage}
      />
      {/* pin body */}
      <Path
        d="M62 40c0 12-14 28-14 28s-14-16-14-28a14 14 0 1 1 28 0z"
        fill={brand.lavender}
        stroke={brand.forest}
        strokeWidth={3}
      />
      <Circle cx={48} cy={40} r={5.5} fill={brand.cream} />
    </Svg>
  );
}
