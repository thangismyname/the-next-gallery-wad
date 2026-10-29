import { useSearchParams } from "react-router-dom";
import { isKnownTag } from "../tagCatalog";
import { TagProgressBanner } from "./TagProgressBanner";
import { TagCategoryGrid } from "./TagCategoryGrid";
import { TagMediaGrid } from "./TagMediaGrid";

/**
 * Tab Phân loại: lưới danh mục tag ↔ ảnh của 1 tag. Tag đang mở nằm trên URL
 * (`?tag=food`) để back/forward và chia sẻ link hoạt động.
 */
export const ClassificationPanel: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");

  const openTag = (next: string | null) =>
    setParams(next ? { tag: next } : {}, { replace: false });

  return (
    <div className="space-y-5">
      <TagProgressBanner />
      {isKnownTag(tag) ? (
        <TagMediaGrid tag={tag} onBack={() => openTag(null)} />
      ) : (
        <TagCategoryGrid onOpen={openTag} />
      )}
    </div>
  );
};
