import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button design system.
 *
 * Both themes are expressed here with Tailwind's `dark:` variant (the project
 * already sets `darkMode: ["class"]` and ThemeController toggles `.dark` on
 * <html>), rather than relying on the `:root[data-ui-mode='dark'] .ui-button`
 * attribute-selector overrides in globals.css. Those overrides remain in place
 * and still apply, but they could not reach every variant — `[class*='ghost']`
 * never matched, because cva emits the class STRING, not the variant name, and
 * the `link` variant was left as `text-black`, i.e. invisible on a dark page.
 *
 * Dark surfaces follow one glass language: translucent white fill, a visible
 * hairline border, backdrop blur and high-contrast text.
 */
const buttonVariants = cva(
  [
    "ui-button inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium",
    "ring-offset-background transition-all duration-200",
    // Always-visible keyboard focus, in both themes.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "focus-visible:ring-slate-900/40 dark:focus-visible:ring-white/50",
    // Pressed feedback, and a disabled state that stays legible rather than vanishing.
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 disabled:saturate-50",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/[0.10] dark:text-slate-50 dark:border dark:border-white/[0.12] dark:backdrop-blur-md dark:hover:bg-white/[0.16]",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-500/[0.16] dark:text-rose-100 dark:border dark:border-rose-400/30 dark:backdrop-blur-md dark:hover:bg-rose-500/[0.24]",
        outline:
          "border border-slate-300 bg-white/70 text-slate-900 backdrop-blur hover:bg-white dark:border-white/[0.12] dark:bg-white/[0.05] dark:text-slate-100 dark:hover:bg-white/[0.10]",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-100 dark:border dark:border-white/[0.10] dark:backdrop-blur-md dark:hover:bg-white/[0.12]",
        /**
         * The "Cancel" baseline — the reference surface for every secondary
         * action (Cancel / Close / Back / Skip / Not now).
         */
        glass:
          "border border-slate-200 bg-white/60 text-slate-900 backdrop-blur-md hover:bg-white/80 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/[0.12]",
        ghost:
          "text-slate-900 hover:bg-slate-900/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white",
        link:
          "text-slate-900 underline-offset-4 hover:underline dark:text-slate-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-7 rounded-lg px-2.5 text-xs",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        // Square icon targets stay >=40px so they remain comfortable on touch.
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        // NOTE: `type` is deliberately NOT defaulted to "button" here. Existing
        // call sites inside <form> rely on the implicit submit behaviour, and
        // changing it would silently stop those forms submitting.
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
