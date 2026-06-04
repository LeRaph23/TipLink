'use client';

import { Component, type ReactNode } from 'react';

// Keeps a Stripe/checkout exception from taking down the whole pay route (the
// global "Une erreur est survenue" boundary). Shows an inline fallback instead.
export class CheckoutErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[pay] checkout crashed', error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
