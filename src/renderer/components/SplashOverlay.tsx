import type { ReactElement } from "react";
import ioSystemsLogo from "../assets/io-systems-logo.png";

export function SplashOverlay(): ReactElement {
  return (
    <div className="splash-overlay" aria-hidden="true">
      <img className="splash-bg" src={ioSystemsLogo} alt="" />
      <img className="splash-logo" src={ioSystemsLogo} alt="" />
    </div>
  );
}
