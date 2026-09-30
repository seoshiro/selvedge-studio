import { useId } from "react";
import { garmentInner } from "./garment";
import type { Asset, Side, Variant } from "./model";
export function Garment({
  variant,
  side = "front",
  assets,
  guides = false,
  label = "",
  className = "",
}: {
  variant: Variant;
  side?: Side;
  assets: Asset[];
  guides?: boolean;
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      viewBox="0 0 500 560"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{
        __html: garmentInner(variant, side, assets, uid, guides),
      }}
    />
  );
}
