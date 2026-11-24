import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export type IslandButtonSize = 'default' | 'sm' | 'icon' | 'icon-sm' | 'icon-xs';

export interface IslandButtonProps extends React.ComponentProps<'button'> {
  size?: IslandButtonSize;
  asChild?: boolean;
}

export function IslandButton({
  className,
  size = 'default',
  asChild = false,
  type = 'button',
  ...props
}: IslandButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      type={asChild ? undefined : type}
      data-slot="island-button"
      data-size={size}
      className={cn('island-btn', `size-${size}`, className)}
      {...props}
    />
  );
}

export interface IslandGroupProps extends React.ComponentProps<'div'> {
  asChild?: boolean;
}

export function IslandGroup({ className, asChild = false, ...props }: IslandGroupProps) {
  const Comp = asChild ? Slot.Root : 'div';
  return <Comp data-slot="island-group" className={cn('island-group', className)} {...props} />;
}

export interface IslandItemProps extends React.ComponentProps<'div'> {
  active?: boolean;
  asChild?: boolean;
}

export function IslandItem({ className, active = false, asChild = false, ...props }: IslandItemProps) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot="island-item"
      data-active={active}
      className={cn('island-item', active && 'is-active', className)}
      {...props}
    />
  );
}
