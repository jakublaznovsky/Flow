import { Component, type ReactNode } from 'react'

/**
 * Renders nothing when its children fail (e.g. a lazy chunk that cannot load) and reports the
 * error once through `onError` (the issue log); no pop-up.
 */
export default class QuietBoundary extends Component<{ children: ReactNode; onError: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { this.props.onError(e) }
  render() { return this.state.failed ? null : this.props.children }
}
