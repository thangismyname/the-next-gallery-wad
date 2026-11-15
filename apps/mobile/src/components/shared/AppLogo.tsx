import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";

/** App mark — same drawing as the web favicon (frontend/public/favicon.svg). */
export function AppLogo({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="The Next Gallery">
      <Rect width={64} height={64} rx={14} fill="#2A2523" />
      <Defs>
        <ClipPath id="frame">
          <Rect x={12} y={15} width={40} height={34} rx={4} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#frame)">
        <Circle cx={24} cy={26} r={5} fill="#E7B87F" />
        <Path d="M12 49 L25 33 L34 42 L41 35 L52 46 L52 49 Z" fill="#F7F4EF" />
      </G>
      <Rect x={12} y={15} width={40} height={34} rx={4} fill="none" stroke="#F7F4EF" strokeWidth={3} />
    </Svg>
  );
}
