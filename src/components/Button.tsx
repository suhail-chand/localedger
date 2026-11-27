import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
};

export function Button({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
    secondary:
      "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800",
    danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  };

  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
