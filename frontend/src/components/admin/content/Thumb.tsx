import { Icon, type IconName } from "@/components/admin/icons";
import { MediaImage } from "@/components/ui/MediaImage";
import { cn } from "@/lib/cn";

const SHAPES = {
  video: "h-10 w-16",
  portrait: "h-14 w-10",
  square: "size-12",
} as const;

/** Small image preview for list rows (placeholder icon when there is no image). */
export function Thumb({
  src,
  shape = "video",
  icon = "image",
  className,
}: {
  src: string | null | undefined;
  shape?: keyof typeof SHAPES;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100",
        SHAPES[shape],
        className,
      )}
    >
      {src ? (
        <MediaImage src={src} alt="" fill sizes="64px" className="object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-stone-400">
          <Icon name={icon} className="size-4" />
        </span>
      )}
    </span>
  );
}
