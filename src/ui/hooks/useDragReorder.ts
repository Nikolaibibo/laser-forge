import { useRef, useState } from "react";

export { reorder } from "../../lib/reorder";

export type DragReorderHandlers = {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
};

/**
 * HTML5 drag-based reorder hook for a vertical list.
 * Returns per-item handlers. When an item is dragged over another item's
 * midpoint and dropped, calls `onReorder(from, to)`.
 *
 * Usage:
 *   const { getItemProps, dragOverIndex } = useDragReorder({ count: layers.length, onReorder });
 *   // In JSX: <div {...getItemProps(i)} className={dragOverIndex === i ? "drag-over" : ""}>
 */
export function useDragReorder({
  count,
  onReorder,
}: {
  count: number;
  onReorder: (from: number, to: number) => void;
}): {
  getItemProps: (index: number) => DragReorderHandlers;
  dragOverIndex: number | null;
} {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function getItemProps(index: number): DragReorderHandlers {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragIndexRef.current = index;
        // Required for Firefox compatibility
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverIndex(index);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = dragIndexRef.current;
        if (from !== null && from !== index) {
          onReorder(from, index);
        }
        dragIndexRef.current = null;
        setDragOverIndex(null);
      },
      onDragEnd: (_e: React.DragEvent) => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
      },
    };
  }

  // reserved for future bounds clamping
  void count;

  return { getItemProps, dragOverIndex };
}
