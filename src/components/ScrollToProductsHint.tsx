import { motion, useScroll, useSpring, useTransform } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useStore } from '../store'

export function ScrollToProductsHint() {
  const selectedLocation = useStore((state) => state.selectedLocation)
  const hasProducts = Boolean(selectedLocation?.products?.length)
  const { scrollY } = useScroll()
  const targetId = selectedLocation ? (hasProducts ? 'products' : null) : 'about'
  const label = selectedLocation ? 'к товарам' : 'ниже'
  const ariaLabel = selectedLocation ? 'Прокрутить к товарам' : 'Прокрутить ниже'

  const opacity = useSpring(
    useTransform(scrollY, [0, 120, 220], [1, 0.5, 0]),
    { stiffness: 220, damping: 30, mass: 0.35 }
  )
  const y = useSpring(
    useTransform(scrollY, [0, 220], [0, 18]),
    { stiffness: 220, damping: 30, mass: 0.35 }
  )

  if (!targetId) return null

  const handleClick = () => {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        opacity,
        y
      }}
      className="pointer-events-auto fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full bg-black/25 px-4 py-2 text-white/85 backdrop-blur-sm transition-colors hover:text-white md:bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
      aria-label={ariaLabel}
    >
      <span className="text-[12px] tracking-[0.16em]">{label}</span>
      <motion.span
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center justify-center"
      >
        <ChevronDown size={18} strokeWidth={1.75} />
      </motion.span>
    </motion.button>
  )
}
