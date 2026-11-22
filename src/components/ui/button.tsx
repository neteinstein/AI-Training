import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * Buttons follow the style sheet: 12px corners, semibold labels, and a height of at least
 * 44px so they are comfortable to tap. `buttonVariants()` can also style a link as a button.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding font-semibold whitespace-nowrap no-underline transition-colors select-none disabled:pointer-events-none disabled:border-transparent disabled:bg-border disabled:text-muted-foreground aria-disabled:pointer-events-none aria-disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border-[1.5px] border-primary bg-transparent text-primary hover:bg-accent",
        neutral: "border-input bg-card text-foreground hover:bg-muted",
        ghost: "text-primary hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-primary hover:text-primary-hover",
      },
      size: {
        default: "min-h-12 px-6 text-base",
        sm: "min-h-11 px-4 text-[0.9375rem]",
        icon: "size-11",
        inline: "min-h-11 px-0 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

/**
 * The same look for a link: `<Link className={buttonClass({ variant: "outline" })}>`.
 * It resolves clashes between the base and the variant, which `buttonVariants()` alone does not.
 */
function buttonClass({
  className,
  ...variants
}: VariantProps<typeof buttonVariants> & { className?: string } = {}) {
  return cn(buttonVariants(variants), className);
}

export { Button, buttonClass, buttonVariants };
