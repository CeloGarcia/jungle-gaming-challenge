import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes } from "react";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const variants = cva(
  "button inline-flex items-center justify-center gap-2 rounded-md font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-ink hover:brightness-110",
        outline: "border border-border text-foreground hover:bg-surface",
        ghost: "text-accent hover:bg-surface",
      },
      size: {
        default: "px-4 py-3",
        sm: "px-3 py-2 text-sm",
        icon: "size-10 p-2",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(variants({ variant, size }), className)} {...props} />
  );
}
