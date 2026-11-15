import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useLayout } from "@/hooks/useLayout";

/**
 * 1 trang của carousel: rộng đúng cửa sổ, cao trọn màn (chừa thanh trên / dưới qua
 * `top` / `bottom`), nội dung ≤ 560 phone / 720 tablet ở giữa. Màn thấp (điện thoại
 * xoay ngang, chia đôi màn iPad) → trang tự cuộn dọc thay vì bị cắt.
 */
export function Slide({
  width,
  top,
  bottom,
  left,
  right,
  children,
}: {
  width: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  children: ReactNode;
}) {
  const { isTablet } = useLayout();
  return (
    <View style={{ width }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: top, paddingBottom: bottom, paddingLeft: left + 20, paddingRight: right + 20 }}
      >
        <View className="w-full flex-1 self-center" style={{ maxWidth: isTablet ? 720 : 560 }}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Bố cục onboarding mobile: **hình ở trên** (chiếm phần còn lại), **chữ ở dưới** — gần ngón
 * cái và nút Tiếp. Cửa sổ ngang đủ rộng (điện thoại xoay ngang, iPad ngang) → hình trái, chữ phải.
 */
export function SlideBody({ visual, children }: { visual: ReactNode; children: ReactNode }) {
  const { width, isLandscape } = useLayout();
  const side = isLandscape && width >= 700;
  if (side) {
    return (
      <View className="flex-1 flex-row items-center gap-8">
        <View className="flex-1 self-stretch justify-center">{visual}</View>
        <View className="flex-1 gap-3">{children}</View>
      </View>
    );
  }
  return (
    <View className="flex-1 gap-6">
      <View className="flex-1 justify-center" style={{ minHeight: 220 }}>
        {visual}
      </View>
      <View className="gap-3">{children}</View>
    </View>
  );
}

/** Dòng chữ nhỏ in hoa giãn chữ phía trên tiêu đề (eyebrow của landing web). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text className="text-xs font-medium uppercase tracking-[3px] text-muted-foreground">{children}</Text>;
}
