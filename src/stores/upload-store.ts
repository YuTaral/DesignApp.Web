import { create } from "zustand"

/**
 * Keeps a local preview of the photo being uploaded, so the editor can show it instantly
 * while the stored copy loads from the API. The object URL is revoked whenever it's replaced.
 */
type UploadState = {
  /** Object URL of the chosen photo, or null when there is none. */
  previewUrl: string | null
  /** The room the preview belongs to, once the upload has created it. */
  roomId: string | null
  /** Starts a preview for a newly chosen photo, replacing any previous one. */
  setFile: (file: File) => void
  /** Links the preview to the room the upload created. */
  attachRoom: (roomId: string) => void
  /** Drops the preview, e.g. after a failed upload. */
  clear: () => void
}

/** Hook for the upload preview state, shared by the home page and the editor. */
export const useUploadStore = create<UploadState>((set, get) => ({
  previewUrl: null,
  roomId: null,
  setFile: (file) => {
    const previous = get().previewUrl

    if (previous) {
      URL.revokeObjectURL(previous)
    }

    set({ previewUrl: URL.createObjectURL(file), roomId: null })
  },
  attachRoom: (roomId) => set({ roomId }),
  clear: () => {
    const previous = get().previewUrl

    if (previous) {
      URL.revokeObjectURL(previous)
    }

    set({ previewUrl: null, roomId: null })
  },
}))
