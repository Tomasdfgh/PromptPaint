import { promptpaintLogoDataUri } from '../assets/promptpaintLogo';

export default function MobileLanding() {
  return (
    <div className="mobile-landing">
      <div className="mobile-landing-inner">
        <img src={promptpaintLogoDataUri} alt="PromptPaint logo" className="mobile-landing-logo" />

        <h1 className="mobile-landing-title">PromptPaint</h1>
        <p className="mobile-landing-tagline">Prompt Like a Painter</p>

        <div className="mobile-landing-divider" />

        <div className="mobile-landing-body">
          <p>
            PromptPaint is a research tool for steering AI image generation using
            interactions inspired by paint mediums. Just as a painter mixes colors
            on a palette and applies them to a canvas, PromptPaint lets you mix,
            blend, and paint with text prompts.
          </p>
          <p>
            You can interpolate between prompts to explore the space between ideas,
            shift images along conceptual directions, spatially paint different
            prompts onto regions of the canvas, and intervene mid-generation to
            guide the output as it unfolds.
          </p>
          <p>
            The tool is built on top of Stable Diffusion XL and runs on a private
            GPU server.
          </p>
        </div>

        <div className="mobile-landing-notice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          <span>PromptPaint is designed for laptops and desktops. Please visit on a larger screen to use the tool.</span>
        </div>

        <p className="mobile-landing-credit">
          Based on <em>PromptPaint</em> by John Joon Young Chung &amp; Eytan Adar, University of Michigan · UIST 2023 · Implemented by Thomas Nguyen, University of Toronto
        </p>
      </div>
    </div>
  );
}
