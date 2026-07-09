// Kéo-thả sắp xếp danh sách (dnd-kit) dùng chung — mỗi nơi tự vẽ hàng qua render-prop.
// Cách dùng:
//   <SortableList ids={items.map(i => i.id)} onReorder={(newIds) => ...} disabled={!canEdit}>
//     {items.map(it => (
//       <SortableItem key={it.id} id={it.id}>
//         {({ setNodeRef, style, handleProps, isDragging }) => (
//           <div ref={setNodeRef} style={style}>
//             <button {...handleProps}><GripVertical/></button>
//             ...nội dung hàng...
//           </div>
//         )}
//       </SortableItem>
//     ))}
//   </SortableList>
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function SortableList({ ids, onReorder, disabled, children }) {
  const sensors = useSensors(
    // distance 4px: vẫn click/sửa bình thường, chỉ kéo khi rê tay
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(active.id)
    const newIdx = ids.indexOf(over.id)
    if (oldIdx < 0 || newIdx < 0) return
    onReorder(arrayMove(ids, oldIdx, newIdx), oldIdx, newIdx)
  }

  if (disabled) return children

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export function SortableItem({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
  }
  return children({ setNodeRef, style, handleProps: { ...attributes, ...listeners }, isDragging })
}
