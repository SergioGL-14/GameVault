import { useState, type ImgHTMLAttributes, type ReactNode } from 'react'

interface ImageWithFallbackProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string
  fallback: ReactNode
}

/** Renders an image until it fails, then uses the supplied fallback and retries for a new source. */
export default function ImageWithFallback({
  src,
  fallback,
  onError,
  ...props
}: ImageWithFallbackProps): React.JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (failedSrc === src) return <>{fallback}</>

  return (
    <img
      {...props}
      src={src}
      onError={(event) => {
        onError?.(event)
        setFailedSrc(src)
      }}
    />
  )
}
