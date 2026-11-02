import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="recovery-screen">
          <div>
            <p className="eyebrow">GRD SUPPLY INTELLIGENCE</p>
            <h1>The workspace needs a fresh connection.</h1>
            <p>
              Reload and sign in to retrieve the confirmed server records.
              Review the action centre before repeating a stock action.
            </p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Reload workspace
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}
