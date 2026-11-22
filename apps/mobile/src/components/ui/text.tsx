import { fontClasses, useJapaneseFonts } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cssInterop } from 'nativewind';
import { Platform, StyleSheet, Text as RNText, type Role } from 'react-native';

import { FONT_SCALES, useFontScale } from '@/hooks/useFontScale';

const textVariants = cva(
  cn(
    'text-foreground text-base',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: '',
        h1: cn(
          'font-heading text-center text-4xl font-semibold tracking-tight',
          Platform.select({ web: 'scroll-m-20 text-balance' })
        ),
        h2: cn(
          'font-heading border-border border-b pb-2 text-3xl font-semibold tracking-tight',
          Platform.select({ web: 'scroll-m-20 first:mt-0' })
        ),
        h3: cn('font-heading text-2xl font-semibold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        h4: cn('text-xl font-semibold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        p: 'mt-3 leading-7 sm:mt-6',
        blockquote: 'mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6',
        code: cn(
          'bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold'
        ),
        lead: 'text-muted-foreground text-xl',
        large: 'text-lg font-semibold',
        small: 'text-sm font-medium leading-none',
        muted: 'text-muted-foreground text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: Platform.select({ web: 'blockquote' as Role }),
  code: Platform.select({ web: 'code' as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

/** RN Text that multiplies the resolved fontSize / lineHeight by the app's text size (`useFontScale`).
 *  Registered with cssInterop so `className` is already turned into `style` when it gets here. */
function ScaledText({ style, ...props }: React.ComponentProps<typeof RNText>) {
  const factor = FONT_SCALES[useFontScale((s) => s.scale)];
  if (factor === 1) return <RNText style={style} {...props} />;
  const flat = StyleSheet.flatten(style) ?? {};
  const scaled = {
    fontSize: (flat.fontSize ?? 14) * factor,
    ...(typeof flat.lineHeight === 'number' ? { lineHeight: flat.lineHeight * factor } : {}),
  };
  return <RNText style={[style, scaled]} {...props} />;
}
cssInterop(ScaledText, { className: 'style' });

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const japanese = useJapaneseFonts();
  const Component = asChild ? Slot : ScaledText;
  const merged = cn(textVariants({ variant }), textClass, className);
  return (
    <Component
      className={cn(merged, fontClasses(merged, japanese))}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };
