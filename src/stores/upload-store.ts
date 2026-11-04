import { create } from "zustand"

/**
 * Keeps a local preview of the photo being uploaded, so the editor can show it instantly
 * while the stored copy loads from the API. The object URL is revoked whenever it's replaced.
 */
type UploadState = {
  previewUrl: string | null
  /** The room the preview belongs to, once the upload has created it. */
  roomId: string | null
  setFile: (file: File) => void
  attachRoom: (roomId: string) => void
  clear: () => void
}

export const useUploadStore = create<UploadState>((set, get) => ({
  previewUrl: null,
  roomId: null,
  setFile: (file) => {
    const previous = get().previewUrl
    if (previous) URL.revokeObjectURL(previous)
    set({ previewUrl: URL.createObjectURL(file), roomId: null })
  },
  attachRoom: (roomId) => set({ roomId }),
  clear: () => {
    const previous = get().previewUrl
    if (previous) URL.revokeObjectURL(previous)
    set({ previewUrl: null, roomId: null })
  },
}))
