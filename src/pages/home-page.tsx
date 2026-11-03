import { useNavigate } from "@tanstack/react-router"
import { MousePointerClickIcon, PaletteIcon, ScanSearchIcon } from "lucide-react"
import { motion } from "motion/react"

import { PhotoDropzone } from "@/features/upload/photo-dropzone"
import { useUploadStore } from "@/stores/upload-store"

const steps = [
  {
    icon: ScanSearchIcon,
    title: "AI maps your room",
    text: "Walls, floor, furniture and decor are detected and outlined automatically.",
  },
  {
    icon: MousePointerClickIcon,
    title: "Pick any object",
    text: "Tap the sofa, a wall or a rug to select it, on any device.",
  },
  {
    icon: PaletteIcon,
    title: "Restyle and save",
    text: "Try new colors with realistic shading, then save the design.",
  },
]

export function HomePage() {
  const navigate = useNavigate()
  const setFile = useUploadStore((state) => state.setFile)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="mb-3 text-sm font-medium text-primary">AI interior styling</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          See your room in a new color before you paint
        </h1>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">
          Upload a photo, select any object and restyle it in seconds.
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
        className="mx-auto mt-10 max-w-2xl"
      >
        <PhotoDropzone
          onSelect={(file) => {
            setFile(file)
            navigate({ to: "/editor" })
          }}
        />
      </motion.div>

      <section aria-label="How it works" className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16 + index * 0.06, ease: "easeOut" }}
            className="rounded-2xl border bg-card p-5 shadow-soft"
          >
            <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </div>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </motion.div>
        ))}
      </section>
    </div>
  )
}
