import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listQuickNotes, createQuickNote, updateQuickNote, deleteQuickNote } from '../api/quickNotes'

const QUICK_NOTES_KEY = ['quick-notes']

// Query + mutations cho ghi chú nhanh; mutation tự invalidate để list cập nhật.
export function useQuickNotes() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: QUICK_NOTES_KEY, queryFn: listQuickNotes, staleTime: 30_000 })
  const invalidate = () => qc.invalidateQueries({ queryKey: QUICK_NOTES_KEY })

  const create = useMutation({ mutationFn: createQuickNote, onSuccess: invalidate })
  const update = useMutation({ mutationFn: ({ id, content }) => updateQuickNote(id, content), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: deleteQuickNote, onSuccess: invalidate })

  return { ...query, create, update, remove }
}
