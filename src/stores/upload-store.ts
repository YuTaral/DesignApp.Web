import { create } from "zustand"

/**
 * Holds the photo picked on the upload screen until the API takes over storage.
 * The object URL is revoked whenever a new photo replaces it.
 */
type UploadState = {
  file: File | null
  previewUrl: string | null
  setFile: (file: File) => void
  clear: () => void
}

export const useUploadStore = create<UploadState>((set, get) => ({
  file: null,
  previewUrl: null,
  setFile: (file) => {
    const previous = get().previewUrl
    if (previous) URL.revokeObjectURL(previous)
    set({ file, previewUrl: URL.createObjectURL(file) })
  },
  clear: () => {
    const previous = get().previewUrl
    if (previous) URL.revokeObjectURL(previous)
    set({ file: null, previewUrl: null })
  },
}))
