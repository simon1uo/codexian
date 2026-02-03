import { setIcon } from '../icons';

interface IconButtonOptions {
  ariaLabel: string;
  className: string;
  tooltip?: string;
}

export function createIconButton(
  container: HTMLElement,
  icon: string,
  options: IconButtonOptions
): HTMLButtonElement {
  const button = container.createEl('button', { cls: options.className });
  button.setAttribute('aria-label', options.ariaLabel);
  if (options.tooltip) {
    button.setAttribute('data-tooltip', options.tooltip);
  }
  setIcon(button, icon);
  return button;
}
